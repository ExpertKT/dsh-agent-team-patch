// Checks the per-teammate route surface added on top of the model-selection patch:
// `provider/model#effort` parsing, `reasoning_effort` on the tool, allowlist
// enforcement, effort preflight, and `/team models`.
//
//   node checks/route-check.mjs
//
// The check loads the *patched* modules from DSH_APP_ROOT (default: the author's
// install path) and drives the private Team tool installer through a fake Cordis
// context, so it needs no live Harness.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const APP_ROOT = process.env.DSH_APP_ROOT ?? 'F:/DSHDesktop/DSH Desktop/resources/app';
const pkgUrl = (rel) => pathToFileURL(`${APP_ROOT}/node_modules/@deepseek-ai/${rel}`).href;

const { apply } = await import(pkgUrl('dsh-experimental-tool-agent-team/lib/index.js'));

/**
 * A fake `scoped.tools` service: it records definitions, and keeps the recorded
 * map on `definitions` for the check to inspect.
 */
function toolService() {
	const definitions = new Map();
	return {
		definitions,
		register: (definition) => {
			definitions.set(definition.name, definition);
			return () => void 0;
		}
	};
}

/**
 * Install the Team tools into a fake Agent scope.
 * @param settings - optional `subagentModelSelection` value (`current()` result).
 * @param llm - optional fake `llm` service.
 */
function harness({ settings, llm } = {}) {
	const spawns = [];
	const commands = [];
	const scoped = { tools: toolService() };
	const systemPrompt = {
		section: () => () => void 0,
		getSectionOrder: () => 0
	};
	const services = {
		tools: scoped,
		systemPrompt,
		agentTeams: {
			tryMembership: () => ({ id: 'lead', role: 'lead', name: 'lead' }),
			spawnTeammate: async (agent, request) => {
				spawns.push(request);
				return { member: { id: 'child', name: request.name, role: 'teammate', status: 'running', provider: request.provider, context: request.context, ...request.agentOptions === void 0 ? {} : { model: request.agentOptions.model }, diagnostics: [] } };
			},
			listMembers: () => [{ id: 'lead', name: 'lead', role: 'lead', status: 'running' }]
		},
		commands: {
			register: (definition) => {
				commands.push(definition);
			}
		},
		...(settings === void 0 ? {} : { subagentModelSelection: { current: () => settings } }),
		...(llm === void 0 ? {} : { llm })
	};
	const agentScope = {
		...scoped,
		systemPrompt,
		on: () => () => void 0,
		get: (name) => services[name],
		inject: (names, callback) => callback(services)
	};
	const agent = { id: 'lead', ctx: agentScope };
	const ctx = {
		agentTeams: services.agentTeams,
		agents: { list: () => [agent] },
		on: () => void 0,
		effect: () => void 0,
		get: (name) => services[name],
		inject: (names, callback) => callback(services)
	};
	apply(ctx, {});
	return { tools: scoped.tools.definitions, commands, spawns };
}

const toolCall = (tools, name, args) => tools.get(name).execute(args, { agent: { id: 'lead' }, signal: undefined, callId: 'call' });
const commandCall = (commands, rawInput) => commands.find((entry) => entry.name === 'team').handler({ agent: { id: 'lead' }, rawInput, signal: undefined });
/** The route-grammar diagnostic every malformed route produces. */
const ROUTE_GRAMMAR = /provider>\/<model/u;

const checks = [];
const check = async (label, run) => {
	try {
		await run();
		checks.push({ ok: true, label });
	} catch (error) {
		checks.push({ ok: false, label, detail: error instanceof Error ? error.message : String(error) });
	}
};

// 1. The tool surface grew by exactly the documented parameters.
await check('spawn_teammate exposes model and reasoning_effort', async () => {
	const { tools } = harness();
	const parameters = tools.get('spawn_teammate').parameters;
	assert.equal(parameters.properties.model.type, 'string');
	assert.equal(parameters.properties.reasoning_effort.type, 'string');
	assert.equal(parameters.required.includes('reasoning_effort'), false);
	assert.equal(parameters.required.includes('model'), false);
});

// 2. `provider/model` still works exactly as before.
await check('a plain provider/model route is unchanged', async () => {
	const { tools, spawns } = harness();
	await toolCall(tools, 'spawn_teammate', { name: 't1', description: 'd', prompt: 'p', model: 'zai/glm-5.3' });
	assert.deepEqual(spawns[0].agentOptions, { provider: 'zai', model: 'glm-5.3' });
});

// 3. A `#effort` suffix reaches agentOptions.reasoningEffort.
await check('provider/model#effort carries the effort', async () => {
	const { tools, spawns } = harness();
	await toolCall(tools, 'spawn_teammate', { name: 't2', description: 'd', prompt: 'p', model: 'zai/glm-5.3#high' });
	assert.deepEqual(spawns[0].agentOptions, { provider: 'zai', model: 'glm-5.3', reasoningEffort: 'high' });
});

// 4. A bare separator is not a route: `provider/model#` has an empty effort and
//    `provider/#effort` an empty model, and neither is guessed into a model id.
await check('a bare trailing hash is refused', async () => {
	const { tools, spawns } = harness();
	await assert.rejects(async () => toolCall(tools, 'spawn_teammate', { name: 't3', description: 'd', prompt: 'p', model: 'zai/glm-5.3#' }), ROUTE_GRAMMAR);
	assert.equal(spawns.length, 0);
});

// 4b. An empty model before `#effort` is refused too.
await check('an empty model with an effort is refused', async () => {
	const { tools, spawns } = harness();
	await assert.rejects(async () => toolCall(tools, 'spawn_teammate', { name: 't3b', description: 'd', prompt: 'p', model: 'zai/#high' }), ROUTE_GRAMMAR);
	assert.equal(spawns.length, 0);
});

// 5. reasoning_effort as its own tool parameter.
await check('reasoning_effort overrides the route suffix', async () => {
	const { tools, spawns } = harness();
	await toolCall(tools, 'spawn_teammate', { name: 't4', description: 'd', prompt: 'p', model: 'zai/glm-5.3#low', reasoning_effort: 'xhigh' });
	assert.deepEqual(spawns[0].agentOptions, { provider: 'zai', model: 'glm-5.3', reasoningEffort: 'xhigh' });
});

// 6. effort without a model is refused, since inheritance has no route to attach it to.
await check('reasoning_effort without model is refused', async () => {
	const { tools, spawns } = harness();
	await assert.rejects(async () => toolCall(tools, 'spawn_teammate', { name: 't5', description: 'd', prompt: 'p', reasoning_effort: 'high' }), /requires an explicit model route/);
	assert.equal(spawns.length, 0);
});

// 7. A malformed route is still refused, with the route grammar in the message.
await check('a malformed route is refused', async () => {
	const { tools, spawns } = harness();
	await assert.rejects(async () => toolCall(tools, 'spawn_teammate', { name: 't6', description: 'd', prompt: 'p', model: 'zai' }), ROUTE_GRAMMAR);
	assert.equal(spawns.length, 0);
});

// 8. An enabled allowlist refuses an unlisted route before anything is spawned.
await check('the allowlist refuses an unlisted route', async () => {
	const { tools, spawns } = harness({ settings: { enabled: true, allowedModels: [{ provider: 'zai', model: 'glm-5.3' }] } });
	await assert.rejects(async () => toolCall(tools, 'spawn_teammate', { name: 't7', description: 'd', prompt: 'p', model: 'zai/glm-4.6' }), /not allowed by the Subagent model-selection allowlist/);
	assert.equal(spawns.length, 0);
});

// 9. A listed route still spawns, with the effort preserved.
await check('the allowlist admits a listed route', async () => {
	const { tools, spawns } = harness({ settings: { enabled: true, allowedModels: [{ provider: 'zai', model: 'glm-5.3' }] } });
	await toolCall(tools, 'spawn_teammate', { name: 't8', description: 'd', prompt: 'p', model: 'zai/glm-5.3#max' });
	assert.deepEqual(spawns[0].agentOptions, { provider: 'zai', model: 'glm-5.3', reasoningEffort: 'max' });
});

// 10. A disabled allowlist does not restrict anything.
await check('a disabled allowlist admits any route', async () => {
	const { tools, spawns } = harness({ settings: { enabled: false, allowedModels: [] } });
	await toolCall(tools, 'spawn_teammate', { name: 't9', description: 'd', prompt: 'p', model: 'other/model' });
	assert.deepEqual(spawns[0].agentOptions, { provider: 'other', model: 'model' });
});

// 11. An effort the model does not advertise is refused up front.
await check('an unsupported effort is refused before spawning', async () => {
	const llm = {
		resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'low' }, { id: 'high' }], defaultEffort: 'low' } })
	};
	const { tools, spawns } = harness({ llm });
	await assert.rejects(async () => toolCall(tools, 'spawn_teammate', { name: 't10', description: 'd', prompt: 'p', model: 'zai/glm-5.3#max' }), /does not advertise reasoning effort "max"/);
	assert.equal(spawns.length, 0);
});

// 12. Without an `llm` service the preflight is skipped, never fatal.
await check('a missing llm service skips the effort preflight', async () => {
	const { tools, spawns } = harness();
	await toolCall(tools, 'spawn_teammate', { name: 't11', description: 'd', prompt: 'p', model: 'zai/glm-5.3#max' });
	assert.deepEqual(spawns[0].agentOptions, { provider: 'zai', model: 'glm-5.3', reasoningEffort: 'max' });
});

// 13. `/team add --model p/m#effort` reaches the same request shape.
await check('/team add --model p/m#effort forwards the effort', async () => {
	const { commands, spawns } = harness();
	const result = await commandCall(commands, 'add t12 --model zai/glm-5.3#high -- do the thing');
	assert.equal(result.kind, 'success');
	assert.deepEqual(spawns[0].agentOptions, { provider: 'zai', model: 'glm-5.3', reasoningEffort: 'high' });
});

// 14. `--effort` is an alternative spelling, and needs a model.
await check('/team add --effort works and needs --model', async () => {
	const { commands, spawns } = harness();
	const ok = await commandCall(commands, 'add t13 --model zai/glm-5.3 --effort low -- x');
	assert.equal(ok.kind, 'success');
	assert.deepEqual(spawns[0].agentOptions, { provider: 'zai', model: 'glm-5.3', reasoningEffort: 'low' });
	const bad = await commandCall(commands, 'add t14 --effort low -- x');
	assert.equal(bad.kind, 'error');
	assert.match(bad.text, /--effort requires --model/);
});

// 15. The allowlist gates the command path too.
await check('/team add is allowlist-gated', async () => {
	const { commands, spawns } = harness({ settings: { enabled: true, allowedModels: [{ provider: 'zai', model: 'glm-5.3' }] } });
	const blocked = await commandCall(commands, 'add t15 --model zai/other -- x');
	assert.equal(blocked.kind, 'error');
	assert.match(blocked.text, /not allowed by the Subagent model-selection allowlist/);
	assert.equal(spawns.length, 0);
});

// 16. `/team models` lists only allowlisted routes and their efforts.
await check('/team models reports allowlisted routes with efforts', async () => {
	const llm = {
		listProviders: () => [{ id: 'zai', name: 'ZAI' }, { id: 'other', name: 'Other' }],
		listModels: async (provider) => provider === 'zai' ? [{ id: 'glm-5.3', name: 'GLM' }, { id: 'glm-4.6', name: 'Old' }] : [{ id: 'm', name: 'M' }],
		resolveModelInfo: async (provider, model) => ({ reasoning: { efforts: [{ id: 'low' }, { id: 'high' }], defaultEffort: 'low' } })
	};
	const { commands } = harness({ settings: { enabled: true, allowedModels: [{ provider: 'zai', model: 'glm-5.3' }] }, llm });
	const result = await commandCall(commands, 'models');
	assert.equal(result.kind, 'success');
	assert.match(result.text, /zai\/glm-5\.3/);
	assert.match(result.text, /efforts: low \(default\), high/);
	assert.equal(result.text.includes('zai/glm-4.6'), false, 'an unlisted model must not be offered');
	assert.equal(result.text.includes('other/'), false, 'an unlisted provider must not be offered');
});

// 17. `/team models` without a policy lists everything selectable.
await check('/team models lists every provider without a policy', async () => {
	const llm = {
		listProviders: () => [{ id: 'zai', name: 'ZAI' }],
		listModels: async () => [{ id: 'glm-5.3', name: 'GLM' }],
		resolveModelInfo: async () => ({ reasoning: { efforts: [], defaultEffort: undefined } })
	};
	const { commands } = harness({ llm });
	const result = await commandCall(commands, 'models');
	assert.equal(result.kind, 'success');
	assert.match(result.text, /zai\/glm-5\.3/);
});

// 18. Usage text documents the new grammar.
await check('help documents models and effort', async () => {
	const { commands } = harness();
	const result = await commandCall(commands, 'help');
	assert.equal(result.kind, 'error');
	assert.match(result.text, /\/team models/);
	assert.match(result.text, /#<effort>/);
});

const failed = checks.filter((entry) => !entry.ok);
console.log(checks.map((entry) => `  ${entry.ok ? 'PASS' : 'FAIL'}  ${entry.label}${entry.ok ? '' : ` — ${entry.detail}`}`).join('\n'));
console.log(failed.length === 0 ? `ROUTE-CHECK OK（${checks.length}/${checks.length}）` : `ROUTE-CHECK FAILED（${failed.length} 项）`);
process.exit(failed.length === 0 ? 0 : 1);
