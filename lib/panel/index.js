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

/** Split one `provider/model` route; provider names and model ids never contain a slash. */
function parseModelRoute(route) {
	const separator = route.indexOf("/");
	if (separator <= 0 || separator === route.length - 1) return void 0;
	return { provider: route.slice(0, separator), model: route.slice(separator + 1) };
}

/** The panel always sends `add <name> [--fork] [--model p/m] -- <prompt>`. */
function parseAdd(rawInput) {
	const text = rawInput.trim();
	const marker = /(?:^|\s)--(?=\s|$)/u.exec(text);
	if (marker === null) return { error: "the new teammate needs an initial task: add <name> -- <prompt>" };
	const prompt = text.slice(marker.index + marker[0].length).trim();
	if (prompt === "") return { error: "the new teammate needs an initial task: add <name> -- <prompt>" };
	const tokens = text.slice(0, marker.index).trim().split(/\s+/u).filter((token) => token !== "");
	if (tokens[0] !== "add") return { error: `unknown /teammates action "${tokens[0] ?? ""}"` };
	const teammateName = tokens[1];
	if (teammateName === void 0 || teammateName.startsWith("--")) return { error: "add needs a teammate name: add <name> -- <prompt>" };
	const parsed = { name: teammateName, context: "fresh", prompt };
	for (let index = 2; index < tokens.length; index += 1) {
		if (tokens[index] === "--fork") {
			parsed.context = "fork";
			continue;
		}
		if (tokens[index] === "--model") {
			const route = tokens[index + 1] === void 0 ? void 0 : parseModelRoute(tokens[index + 1]);
			if (route === void 0) return { error: `--model needs <provider>/<model>, got "${tokens[index + 1] ?? ""}"` };
			parsed.agentOptions = route;
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
 * back and an ignored route is reported instead of silently lost.
 */
async function addTeammate(ctx, providers, invocation) {
	const parsed = parseAdd(invocation.rawInput ?? "");
	if (parsed.error !== void 0) return { kind: "error", text: parsed.error };
	try {
		const { member } = await ctx.agentTeams.spawnTeammate(invocation.agent, {
			name: parsed.name,
			description: describeTask(parsed.prompt),
			prompt: [
				{ type: "text", text: teammateReminder(parsed.name) },
				{ type: "text", text: parsed.prompt }
			],
			context: parsed.context,
			provider: parsed.context === "fork" ? providers.forkProvider : providers.freshProvider,
			...parsed.agentOptions === void 0 ? {} : { agentOptions: parsed.agentOptions },
			signal: invocation.signal
		});
		const actual = member.model === void 0 ? "" : ` on ${member.model}`;
		if (parsed.agentOptions !== void 0 && member.model !== parsed.agentOptions.model) {
			return {
				kind: "success",
				text: `spawned teammate "${member.name}"${actual}, but this host did not apply ${parsed.agentOptions.provider}/${parsed.agentOptions.model} — it needs the model-selection patch; switch it from the panel instead.`
			};
		}
		return { kind: "success", text: `spawned teammate "${member.name}"${actual}` };
	} catch (error) {
		return { kind: "error", text: error instanceof Error ? error.message : String(error) };
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
			description: "Add an Agent Team member from the conversation-header Team panel.",
			input: { hint: "add <name> [--fork] [--model <provider>/<model>] -- <prompt>" },
			handler: (invocation) => addTeammate(ctx, providers, invocation)
		});
	});
}

export { Config, apply, inject, name };
