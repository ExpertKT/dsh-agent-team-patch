// Verifies the patched `dsh-experimental-tool-agent-team` plugin:
//   1. the module imports and `apply()` registers the `/team` command;
//   2. the command parses `list` / `add` / `retire` and forwards the right
//      spawn request (name, context, provider, agentOptions, prompt blocks);
//   3. every rejection path returns `{ kind: "error" }` instead of throwing.
// Runs against the installed (patched) bundle — no DSH process, no agents.
import { pathToFileURL } from "node:url";
import path from "node:path";

const APP_ROOT = process.env.DSH_APP_ROOT ?? "F:/DSHDesktop/DSH Desktop/resources/app";
const PKG = path.join(APP_ROOT, "node_modules", "@deepseek-ai", "dsh-experimental-tool-agent-team", "lib", "index.js");

const failures = [];
const check = (name, condition, detail = "") => {
	if (condition) console.log(`  PASS  ${name}`);
	else failures.push(`${name}${detail === "" ? "" : ` — ${detail}`}`);
};

const plugin = await import(pathToFileURL(PKG).href);
console.log(`imported ${PKG}`);
check("exports apply/inject/Config", typeof plugin.apply === "function" && Array.isArray(plugin.inject) && plugin.Config !== void 0);

// --- capture the registered command through a scripted client-shaped Context ---
let registered;
const spawnCalls = [];
const retiredCalls = [];
const restWakes = [];
let spawnError = void 0;
const ctx = {
	agents: { list: () => [] },
	on: () => () => {},
	effect: (fn) => fn(),
	inject: (deps, callback) => {
		if (deps.includes("commands")) callback({ commands: { register: (definition) => { registered = definition; return () => {}; } } });
	},
	agentTeams: {
		tryMembership: () => void 0,
		listMembers: () => [
			{ name: "lead", role: "lead", status: "active", model: "gpt-5.6-luna" },
			{ id: "child-b1", name: "b1", role: "teammate", status: "running", model: "zai/glm-5.3", description: "修登录", context: "fresh" },
			{ id: "child-b2", name: "b2", role: "teammate", status: "inactive", model: "gpt-5.6-luna", description: "看日志", context: "fork" }
		],
		spawnTeammate: async (agent, request) => {
			spawnCalls.push(request);
			if (spawnError !== void 0) throw spawnError;
			return { member: { name: request.name, model: request.agentOptions?.model ?? "lead-route" } };
		},
		retireTeammate: async (agent, name) => {
			retiredCalls.push(name);
			return { previousStatus: name === "b1" ? "inactive" : "running" };
		},
		restTeam: async () => {
			restWakes.push("rest");
			return { resting: restWakes.includes("rest") ? ["b1", "b2"] : [] };
		},
		wakeTeam: async () => {
			restWakes.push("work");
			return { woken: ["b1", "b2"] };
		}
	}
};
const dispose = plugin.apply(ctx, {});
check("apply() completes", registered !== void 0 || dispose !== void 0);
check("registers the `/team` command", registered !== void 0 && registered.name === "team");
check("command declares a usage hint", typeof registered.input.hint === "string" && registered.input.hint.includes("add"));
check("command name matches the host grammar", /^[a-z][a-z0-9_-]*$/u.test(registered.name));

const agent = { id: "lead-agent" };
const run = (rawInput) => registered.handler({
	commandId: "test",
	agent,
	rawInput,
	attachments: [],
	signal: new AbortController().signal
});

// --- list ---
const listed = await run(" list ");
check("/team list succeeds", listed.kind === "success", JSON.stringify(listed));
check("/team list shows every member", ["lead", "b1", "b2"].every((name) => listed.text.includes(name)), listed.text);
check("/team list shows a member model", listed.text.includes("zai/glm-5.3"), listed.text);

// --- rest / work: the Team-wide work switch ---
const rested = await run("rest");
check("/team rest succeeds", rested.kind === "success" && rested.text.includes("the Team is resting"), JSON.stringify(rested));
check("rest names every teammate it put down", rested.text.includes("b1") && rested.text.includes("b2"), rested.text);
check("rest says no turn can start until /team work", rested.text.includes("/team work"), rested.text);
const worked = await run("work");
check("/team work succeeds", worked.kind === "success" && worked.text.includes("working again"), JSON.stringify(worked));
check("rest/wake reached the service in order", restWakes.join(",") === "rest,work", JSON.stringify(restWakes));
check("the usage hint mentions rest and work", registered.input.hint.includes("rest") && registered.input.hint.includes("work"), registered.input.hint);

// --- add with an explicit route ---
spawnCalls.length = 0;
const added = await run("add b3 --model openai/gpt-5.6-luna -- 修复登录流程\n再跑一遍测试");
check("/team add succeeds", added.kind === "success", JSON.stringify(added));
check("spawn name/context/provider forwarded", spawnCalls[0]?.name === "b3" && spawnCalls[0]?.context === "fresh" && spawnCalls[0]?.provider === "spawn", JSON.stringify(spawnCalls[0]));
check("model became agentOptions", spawnCalls[0]?.agentOptions?.provider === "openai" && spawnCalls[0]?.agentOptions?.model === "gpt-5.6-luna", JSON.stringify(spawnCalls[0]?.agentOptions));
check("prompt keeps the exact task text", spawnCalls[0]?.prompt?.[1]?.text === "修复登录流程\n再跑一遍测试", JSON.stringify(spawnCalls[0]?.prompt?.[1]?.text));
check("prompt carries the teammate reminder", spawnCalls[0]?.prompt?.[0]?.text?.includes('You are teammate "b3"'), JSON.stringify(spawnCalls[0]?.prompt?.[0]));
check("description collapses the task to one line", spawnCalls[0]?.description === "修复登录流程 再跑一遍测试", JSON.stringify(spawnCalls[0]?.description));
check("spawn passes the caller signal", spawnCalls[0]?.signal !== void 0);
check("success text names the spawned teammate", added.text.includes("b3"), added.text);

// --- add --fork without a route ---
spawnCalls.length = 0;
await run("add b4 --fork -- 继承上下文的任务");
check("--fork selects the fork provider", spawnCalls[0]?.provider === "fork" && spawnCalls[0]?.context === "fork", JSON.stringify(spawnCalls[0]?.provider));
check("omitting --model omits agentOptions", !("agentOptions" in spawnCalls[0]), JSON.stringify(Object.keys(spawnCalls[0] ?? {})));

// --- re-route: a teammate's model is frozen in its descriptor, so switching it
// --- retires the member and rebuilds it under the same name on the new route ---
spawnCalls.length = 0;
retiredCalls.length = 0;
const rerouted = await run("model b1 openai/gpt-5.6-sol");
check("/team model succeeds", rerouted.kind === "success", JSON.stringify(rerouted));
check("the old member is retired first", retiredCalls[0] === "b1" && retiredCalls.length === 1, JSON.stringify(retiredCalls));
check("the rebuild reuses the name and description", spawnCalls[0]?.name === "b1" && spawnCalls[0]?.description === "修登录", JSON.stringify(spawnCalls[0]));
check("the rebuild carries the new route", spawnCalls[0]?.agentOptions?.provider === "openai" && spawnCalls[0]?.agentOptions?.model === "gpt-5.6-sol", JSON.stringify(spawnCalls[0]?.agentOptions));
check("the rebuild keeps the member's context mode", spawnCalls[0]?.context === "fresh" && spawnCalls[0]?.provider === "spawn", JSON.stringify([spawnCalls[0]?.context, spawnCalls[0]?.provider]));
check("the rebuild keeps the teammate reminder", spawnCalls[0]?.prompt?.[0]?.text?.includes('You are teammate "b1"'), JSON.stringify(spawnCalls[0]?.prompt?.[0]));
check("the rebuild tells the teammate its Session is new", spawnCalls[0]?.prompt?.[1]?.text?.includes("openai/gpt-5.6-sol") && spawnCalls[0]?.prompt?.[1]?.text?.includes("child-b1"), JSON.stringify(spawnCalls[0]?.prompt?.[1]?.text));
check("the rebuild passes the caller signal", spawnCalls[0]?.signal !== void 0);
check("the success text names the route and the retired Session", rerouted.text.includes("openai/gpt-5.6-sol") && rerouted.text.includes("child-b1"), rerouted.text);

// a fork teammate is rebuilt through the fork provider, keeping its context mode
spawnCalls.length = 0;
await run("model b2 zai/glm-5.3");
check("a fork teammate is rebuilt as a fork", spawnCalls[0]?.context === "fork" && spawnCalls[0]?.provider === "fork", JSON.stringify([spawnCalls[0]?.context, spawnCalls[0]?.provider]));

for (const [input, needle] of [
	["model b1", "usage: /team model <name> <provider>/<model>"],
	["model b1 bogus", "<provider>/<model>"],
	["model b1 a/b extra", "usage: /team model"],
	["model nope openai/x", "is not in this Team"],
	["model lead openai/x", "Team Lead"],
	["model b1 openai/x -- x", "usage: /team model"]
]) {
	const result = await run(input);
	check(`/team ${input} is rejected`, result.kind === "error" && result.text.includes(needle), JSON.stringify(result));
}
check("a rejected re-route never touches the roster", retiredCalls[1] === "b2" && retiredCalls.length === 2, JSON.stringify(retiredCalls));

// --- retire ---
const retired = await run("retire b1");
check("/team retire succeeds", retired.kind === "success", JSON.stringify(retired));
check("retire reports the previous status", retired.text.includes("inactive"), retired.text);

// --- error paths ---
const cases = [
	["retire", "usage"],
	["retire b1 b2", "usage"],
	["rest now", "usage: /team rest"],
	["rest --", "usage: /team rest"],
	["work --", "usage: /team work"],
	["work b1", "usage: /team work"],
	["bogus", "unknown Team subcommand"],
	["add b5 --model bogus -- x", "<provider>/<model>"],
	["add b5", "initial task"],
	["add b5 --model", "<provider>/<model>"],
	["add b5 --model openai -- x", "<provider>/<model>"],
	["", "usage"]
];
for (const [input, needle] of cases) {
	const result = await run(input);
	check(`/team ${input === "" ? "(empty)" : input} is rejected`, result.kind === "error" && result.text.includes(needle), JSON.stringify(result));
}

// everything after `--` is the prompt, even tokens that look like flags
spawnCalls.length = 0;
const literal = await run("add b7 -- nope --model openai/gpt-5.6-luna");
check("post-`--` tokens stay in the prompt", literal.kind === "success" && spawnCalls[0]?.prompt?.[1]?.text === "nope --model openai/gpt-5.6-luna", JSON.stringify([literal, spawnCalls[0]?.prompt?.[1]?.text]));
check("post-`--` tokens do not set a route", spawnCalls[0]?.agentOptions === void 0, JSON.stringify(spawnCalls[0]?.agentOptions));

spawnError = new Error("Team member limit 8 reached");
const rejected = await run("add b9 -- 任务");
check("a runtime rejection surfaces as a command error", rejected.kind === "error" && rejected.text.includes("Team member limit 8 reached"), JSON.stringify(rejected));
spawnError = void 0;

// --- malformed raw input must not throw ---
for (const input of ["add", "add -- ", "add  -- x", "retire  ", "--", "add b1 --model a/b/c -- x"]) {
	let threw = false;
	let result;
	try {
		result = await run(input);
	} catch (error) {
		threw = true;
		result = error;
	}
	check(`malformed "${input}" does not throw`, !threw && result?.kind !== void 0, JSON.stringify(result));
}

if (typeof dispose === "function") dispose();
console.log(failures.length === 0 ? "TEAM-COMMAND-CHECK OK（失败 0 项）" : `TEAM-COMMAND-CHECK FAILED（${failures.length} 项）`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
