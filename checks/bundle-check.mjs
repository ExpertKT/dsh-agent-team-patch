// Checks the installable half of this repository: the package manifest and bundle patch
// that make `dsh plugin add <this repo>` work, the generated browser bundle, and the
// `/teammates add` command the panel drives.
//
//   node checks/bundle-check.mjs
//
// The host plugin imports @deepseek-ai/* packages, so the check points a `node_modules`
// junction at the installed DSH app the same way the other checks do.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_ROOT = process.env.DSH_APP_ROOT ?? 'F:/DSHDesktop/DSH Desktop/resources/app';
const APP_SCOPE = join(APP_ROOT, 'node_modules', '@deepseek-ai');
const LOCAL_SCOPE = join(HERE, 'node_modules', '@deepseek-ai');

const failures = [];
const check = (name, condition, detail = '') => {
	if (condition) console.log(`  PASS  ${name}`);
	else failures.push(`${name}${detail === '' ? '' : ` — ${detail}`}`);
};

// ── the manifest that makes the repo installable ──────────────────────────
const manifest = JSON.parse(await readFile(join(HERE, 'package.json'), 'utf8'));
check('package declares dsh.bundle.patch', manifest.dsh?.bundle?.patch === './cordis.patch.yml', JSON.stringify(manifest.dsh?.bundle));
check('package declares a web client face', manifest.dsh?.client?.platform === 'web', JSON.stringify(manifest.dsh?.client));
check('the bundle patch exists', existsSync(join(HERE, 'cordis.patch.yml')));
check('the host entry exists', existsSync(join(HERE, manifest.main)));
check('exports["./client"] exists', existsSync(join(HERE, manifest.exports?.['./client']?.default ?? 'missing')));
check('peer pins track the built version', Object.keys(manifest.peerDependencies ?? {}).filter((dep) => dep.startsWith('@deepseek-ai/dsh-')).every((dep) => manifest.peerDependencies[dep] === manifest.version), JSON.stringify(manifest.peerDependencies));

// ── the bundle patch: replace the experimental UI, add our panel ──────────
const patch = await readFile(join(HERE, 'cordis.patch.yml'), 'utf8');
const lines = patch.split('\n');
check('patch disables the experimental client UI', lines.some((line) => line.trim() === '- id: ui-agent-team') && lines.some((line) => line.trim() === 'disabled: true'), patch);
check('patch disables nothing else', lines.filter((line) => /^- id: /.test(line)).length === 1, patch);
check('patch inserts this package', patch.includes('name: dsh-agent-team-panel') && patch.includes('- insert:'), patch);

// ── the host plugin: import, apply, and drive one add ─────────────────────
if (!existsSync(LOCAL_SCOPE)) {
	await mkdir(dirname(LOCAL_SCOPE), { recursive: true });
	await symlink(APP_SCOPE, LOCAL_SCOPE, 'junction');
}
const mod = await import(pathToFileURL(join(HERE, manifest.main)).href).catch((error) => error);
if (mod instanceof Error) {
	check('host plugin imports', false, String(mod));
} else {
	check('host plugin imports', typeof mod.apply === 'function' && Array.isArray(mod.inject) && mod.Config !== void 0);
	check('host plugin injects agentTeams only', JSON.stringify(mod.inject) === JSON.stringify(['agentTeams']), JSON.stringify(mod.inject));

	const registered = [];
	const spawns = [];
	const responses = { member: { name: 't1', model: 'glm-5.3' } };
	const ctx = {
		inject: (services, callback) => callback({ commands: { register: (definition) => registered.push(definition) } }),
		agentTeams: { spawnTeammate: async (agent, request) => { spawns.push({ agent, request }); return responses; } }
	};
	mod.apply(ctx, {});
	check('host plugin registers the /teammates command', registered.length === 1 && registered[0].name === 'teammates', JSON.stringify(registered.map((entry) => entry.name)));
	check('the command hint documents the panel grammar', /add <name>.*-- <prompt>/u.test(registered[0]?.input?.hint ?? ''), JSON.stringify(registered[0]?.input));

	const handler = registered[0].handler;
	const invocation = { agent: { id: 'lead' }, rawInput: 'add t1 --model zai/glm-5.3 -- 写一个 README', signal: undefined };
	const added = await handler(invocation);
	check('add spawns a fresh teammate', spawns.length === 1 && spawns[0].request.name === 't1' && spawns[0].request.context === 'fresh' && spawns[0].request.provider === 'spawn', JSON.stringify(spawns[0]?.request));
	check('add forwards the requested route', JSON.stringify(spawns[0]?.request.agentOptions) === JSON.stringify({ provider: 'zai', model: 'glm-5.3' }));
	check('the teammate prompt carries the reminder and the task', spawns[0]?.request.prompt?.[0]?.text.includes('You are teammate "t1"') === true && spawns[0]?.request.prompt?.[1]?.text === '写一个 README', JSON.stringify(spawns[0]?.request.prompt));
	check('a honoured route is reported as success', added.kind === 'success' && added.text.includes('glm-5.3'), JSON.stringify(added));

	responses.member = { name: 't2', model: 'deepseek-flash' };
	const ignored = await handler({ agent: { id: 'lead' }, rawInput: 'add t2 --model zai/glm-5.3 -- x', signal: undefined });
	check('an ignored route is reported, not silently lost', ignored.kind === 'success' && ignored.text.includes('did not apply') && ignored.text.includes('deepseek-flash'), JSON.stringify(ignored));

	const forked = await handler({ agent: { id: 'lead' }, rawInput: 'add t3 --fork -- x', signal: undefined });
	check('--fork selects the fork provider', spawns[2]?.request.provider === 'fork' && forked.kind === 'success', JSON.stringify(spawns[2]?.request.provider));
	check('a missing `--` is rejected', (await handler({ agent: { id: 'lead' }, rawInput: 'add t4 x', signal: undefined })).kind === 'error');
	check('a bad route is rejected', (await handler({ agent: { id: 'lead' }, rawInput: 'add t5 --model zai -- x', signal: undefined })).kind === 'error');
	check('an unknown action is rejected', (await handler({ agent: { id: 'lead' }, rawInput: 'drop t6 -- x', signal: undefined })).kind === 'error');
	check('the spawn request carries the caller signal', spawns.every((spawn) => 'signal' in spawn.request));
}

// ── the browser bundle is generated from the patched vendor bundle ────────
try {
	execFileSync(process.execPath, [join(HERE, 'tools', 'build-plugin.mjs'), '--check'], { cwd: HERE, stdio: 'pipe' });
	check('lib/panel/client.js matches its generator', true);
} catch (error) {
	check('lib/panel/client.js matches its generator', false, String(error.stdout ?? error));
}

const clientPath = join(HERE, manifest.exports['./client'].default);
const clientSource = await readFile(clientPath, 'utf8');
check('the browser bundle registers this package id', clientSource.includes('id: "dsh-agent-team-panel"'));
check('the browser bundle drives /teammates add', clientSource.includes('/teammates add '));
check('the browser bundle has no retire control', !clientSource.includes('title: t("memberRetire")'));

let entry;
globalThis.window = { __ModuleLoader__: { load: (value) => { entry = value; } } };
globalThis.document = {
	body: {},
	head: { appendChild: () => void 0 },
	activeElement: null,
	querySelector: () => ({}),
	createElement: () => ({ dataset: {}, setAttribute: () => void 0, appendChild: () => void 0 }),
	addEventListener: () => void 0,
	removeEventListener: () => void 0
};
const requireFromApp = createRequire(join(APP_ROOT, 'package.json'));
const stubs = new Map([
	['react-dom', { createPortal: () => null }],
	['@deepseek-ai/dsh-client-ui-primitives', new Proxy({}, { get: () => () => null })]
]);
await import(pathToFileURL(clientPath).href);
const client = entry?.factory((id) => (stubs.has(id) ? stubs.get(id) : requireFromApp(id)));
check('the browser bundle announces id dsh-agent-team-panel', entry?.id === 'dsh-agent-team-panel', JSON.stringify(entry?.id));
check('the browser bundle applies', typeof client?.apply === 'function' && Array.isArray(client?.inject), JSON.stringify(client?.inject));
check('the browser bundle keeps its four services', JSON.stringify(client?.inject) === JSON.stringify(['sessions', 'uiWorkspace', 'slots', 'locale']), JSON.stringify(client?.inject));

console.log(failures.length === 0 ? 'BUNDLE-CHECK OK（失败 0 项）' : `BUNDLE-CHECK FAILED（${failures.length} 项）`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
