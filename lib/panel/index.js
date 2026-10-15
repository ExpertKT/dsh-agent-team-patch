import z from "@deepseek-ai/schemastery";
import { CommandDefinitionId } from "@deepseek-ai/dsh-commands/brand";

/** Cordis plugin name. */
const name = "agent-team-panel";
/** Services required to manage the Agent Team roster from the header panel. */
const inject = ["agentTeams"];
/** Loader schema: which subagent provider backs a fresh / forked teammate. */
const Config = z.object({
	freshProvider: z.string().default("spawn"),
	forkProvider: z.string().default("fork")
});

/** The system reminder every newly created teammate starts with. */
function teammateReminder(teammate) {
	return `<system-reminder>
You are teammate "${teammate}".
Your Team Lead is named "lead".
Use list_agents({}) to find your teammates and their names.
To message your Team Lead, use send_message({ target: "lead", message: "..." }).
To message another teammate, use send_message({ target: "<teammate name>", message: "..." }).
</system-reminder>

`;
}

/** Short roster description derived from a teammate's initial task. */
function describeTask(task) {
	const flat = task.trim().replace(/\s+/gu, " ");
	return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}

/**
 * Split one `provider/model` route, with an optional `#effort` suffix.
 *
 * Provider names and model ids never contain a slash or a `#`, so the first `/`
 * separates provider from model and the last `#` separates model from the
 * adapter-owned reasoning effort. A route whose model or effort part is empty is
 * malformed, which keeps every route that used to parse doing what it did.
 */
function parseModelRoute(route) {
	const separator = route.indexOf("/");
	if (separator <= 0 || separator === route.length - 1) return void 0;
	const rest = route.slice(separator + 1);
	const hash = rest.lastIndexOf("#");
	const provider = route.slice(0, separator);
	if (hash < 0) return { provider, model: rest };
	const model = rest.slice(0, hash);
	const effort = rest.slice(hash + 1);
	if (model === "" || effort === "") return void 0;
	return { provider, model, reasoningEffort: effort };
}

/** Render one parsed route back as `provider/model[#effort]`. */
function formatModelRoute(route) {
	return `${route.provider}/${route.model}${route.reasoningEffort === void 0 ? "" : `#${route.reasoningEffort}`}`;
}

/** Build the child Agent options one requested route implies. */
function routeToAgentOptions(route) {
	return {
		provider: route.provider,
		model: route.model,
		...route.reasoningEffort === void 0 ? {} : { reasoningEffort: route.reasoningEffort }
	};
}

/**
 * Read the deployment's teammate model allowlist.
 *
 * `@deepseek-ai/dsh-tool-subagent/model-selection-settings` owns this singleton
 * and the shipped `subagent` tool enforces it for child Agents; a Team spawn is
 * the same kind of model-facing choice, so the panel reads the same policy and
 * refuses an unlisted route instead of silently asking the host to drop it.
 * @param ctx - the plugin Context, which may carry the settings service.
 * @returns the allowed routes, or undefined when every route is selectable.
 */
function allowedModelRoutes(ctx) {
	const settings = ctx.get === void 0 ? void 0 : ctx.get("subagentModelSelection");
	if (settings === void 0 || typeof settings.current !== "function") return void 0;
	const current = settings.current();
	if (current?.enabled !== true) return void 0;
	return Array.isArray(current.allowedModels) ? current.allowedModels : [];
}

/** Refuse one requested route the deployment's allowlist forbids. */
function assertRouteAllowed(ctx, route) {
	const allowed = allowedModelRoutes(ctx);
	if (allowed === void 0) return;
	if (allowed.some((entry) => entry.provider === route.provider && entry.model === route.model)) return;
	const listed = allowed.map((entry) => `${entry.provider}/${entry.model}`).join(", ");
	throw new Error(`teammate model "${route.provider}/${route.model}" is not allowed by the Subagent model-selection allowlist; allowed: ${listed || "(none)"}`);
}

/** The panel sends `add <name> [--fork] [--model p/m[#effort]] [--effort id] -- <prompt>`, or `models`. */
function parseAdd(rawInput) {
	const text = rawInput.trim();
	const marker = /(?:^|\s)--(?=\s|$)/u.exec(text);
	const before = marker === null ? text : text.slice(0, marker.index).trim();
	const tokens = before.split(/\s+/u).filter((token) => token !== "");
	const action = tokens[0];
	if (action === "models") return tokens.length === 1 ? { action } : { error: "usage: models" };
	if (marker === null) return { error: "the new teammate needs an initial task: add <name> -- <prompt>" };
	const prompt = text.slice(marker.index + marker[0].length).trim();
	if (prompt === "") return { error: "the new teammate needs an initial task: add <name> -- <prompt>" };
	if (action !== "add") return { error: `unknown /teammates action "${action ?? ""}"` };
	const teammateName = tokens[1];
	if (teammateName === void 0 || teammateName.startsWith("--")) return { error: "add needs a teammate name: add <name> -- <prompt>" };
	const parsed = { action, name: teammateName, context: "fresh", prompt };
	for (let index = 2; index < tokens.length; index += 1) {
		if (tokens[index] === "--fork") {
			parsed.context = "fork";
			continue;
		}
		if (tokens[index] === "--model") {
			const value = tokens[index + 1];
			const route = value === void 0 ? void 0 : parseModelRoute(value);
			if (route === void 0) return { error: `--model needs <provider>/<model>[#<effort>], got "${value ?? ""}"` };
			parsed.agentOptions = route;
			index += 1;
			continue;
		}
		if (tokens[index] === "--effort") {
			const value = tokens[index + 1];
			if (value === void 0 || value.startsWith("--")) return { error: `--effort needs a reasoning effort id, got "${value ?? ""}"` };
			if (parsed.agentOptions === void 0) return { error: "--effort requires --model <provider>/<model> in the same add" };
			parsed.agentOptions = { ...parsed.agentOptions, reasoningEffort: value };
			index += 1;
			continue;
		}
		return { error: `unexpected /teammates argument "${tokens[index]}"` };
	}
	return parsed;
}

/**
 * Add one teammate and report the model it actually landed on.
 *
 * `agentOptions` is only honoured by a roster that forwards it to the subagent
 * runtime (the upstream experimental packages drop it), so the result is read
 * back and an ignored route is reported instead of silently lost. An allowlisted
 * deployment refuses an unlisted route here, before a teammate exists.
 */
async function addTeammate(ctx, providers, invocation, parsed) {
	if (parsed.error !== void 0) return { kind: "error", text: parsed.error };
	try {
		if (parsed.agentOptions !== void 0) assertRouteAllowed(ctx, parsed.agentOptions);
		const { member } = await ctx.agentTeams.spawnTeammate(invocation.agent, {
			name: parsed.name,
			description: describeTask(parsed.prompt),
			prompt: [
				{ type: "text", text: teammateReminder(parsed.name) },
				{ type: "text", text: parsed.prompt }
			],
			context: parsed.context,
			provider: parsed.context === "fork" ? providers.forkProvider : providers.freshProvider,
			...parsed.agentOptions === void 0 ? {} : { agentOptions: routeToAgentOptions(parsed.agentOptions) },
			signal: invocation.signal
		});
		const actual = member.model === void 0 ? "" : ` on ${member.model}`;
		if (parsed.agentOptions !== void 0 && member.model !== parsed.agentOptions.model) {
			return {
				kind: "success",
				text: `spawned teammate "${member.name}"${actual}, but this host did not apply ${formatModelRoute(parsed.agentOptions)} — it needs the model-selection patch; switch it from the panel instead.`
			};
		}
		return { kind: "success", text: `spawned teammate "${member.name}"${actual}` };
	} catch (error) {
		return { kind: "error", text: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Render the routes a teammate may be created on.
 *
 * The panel offers what the deployment allows: the allowlist when one is
 * enabled, the host model catalog otherwise. An allowlisted route the catalog
 * does not advertise stays visible, because the deployment still admits it.
 * @param ctx - the plugin Context, read for the `llm` and allowlist services.
 */
async function renderTeammateModels(ctx) {
	const llm = ctx.get === void 0 ? void 0 : ctx.get("llm");
	if (llm === void 0 || typeof llm.listProviders !== "function") throw new Error("cannot list teammate models: the `llm` service is not mounted");
	const allowed = allowedModelRoutes(ctx);
	const lines = [];
	for (const provider of llm.listProviders()) {
		const routes = allowed === void 0 ? void 0 : allowed.filter((entry) => entry.provider === provider.id);
		if (allowed !== void 0 && routes.length === 0) continue;
		let models = [];
		try {
			models = await llm.listModels(provider.id);
		} catch (error) {
			lines.push(`${provider.id} — model catalog unavailable (${error instanceof Error ? error.message : String(error)})`);
			continue;
		}
		const selectable = allowed === void 0 ? models : models.filter((model) => routes.some((entry) => entry.model === model.id));
		for (const model of selectable) {
			const efforts = typeof llm.resolveModelInfo === "function" ? await effortSuffix(llm, provider.id, model.id) : "";
			lines.push(`${provider.id}/${model.id}${efforts}`);
		}
		for (const route of routes ?? []) {
			if (models.some((model) => model.id === route.model)) continue;
			lines.push(`${provider.id}/${route.model}`);
		}
	}
	if (lines.length === 0) lines.push("No teammate model route is selectable on this deployment.");
	return lines.join("\n");
}

/** Describe one route's advertised reasoning efforts, best effort. */
async function effortSuffix(llm, provider, model) {
	try {
		const info = await llm.resolveModelInfo(provider, model);
		const efforts = info?.reasoning?.efforts;
		if (!Array.isArray(efforts) || efforts.length === 0) return "";
		const listed = efforts.map((effort) => `${effort.id}${info.reasoning?.defaultEffort === effort.id ? " (default)" : ""}`).join(", ");
		return ` — efforts: ${listed}`;
	} catch {
		return "";
	}
}

/** Register the `/teammates` command that the header panel drives. */
function apply(ctx, config = {}) {
	const providers = {
		freshProvider: config.freshProvider ?? "spawn",
		forkProvider: config.forkProvider ?? "fork"
	};
	ctx.inject(["commands"], (commandCtx) => {
		commandCtx.commands.register({
			definitionId: CommandDefinitionId("dsh-agent-team-panel"),
			name: "teammates",
			description: "Add an Agent Team member from the conversation-header Team panel, or list the models a teammate may run on.",
			input: { hint: "add <name> [--fork] [--model <provider>/<model>[#<effort>]] [--effort <id>] -- <prompt> | models" },
			handler: async (invocation) => {
				const parsed = parseAdd(invocation.rawInput ?? "");
				if (parsed.error === void 0 && parsed.action === "models") {
					try {
						return { kind: "success", text: await renderTeammateModels(ctx) };
					} catch (error) {
						return { kind: "error", text: error instanceof Error ? error.message : String(error) };
					}
				}
				return await addTeammate(ctx, providers, invocation, parsed);
			}
		});
	});
}

export { Config, apply, inject, name };
