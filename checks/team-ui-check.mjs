// Verifies the patched `dsh-experimental-client-ui-agent-team` browser bundle:
//   1. it loads through the `window.__ModuleLoader__.load({id, factory})` contract;
//   2. the declared `inject` list matches what `registerAgentTeamUi` actually uses;
//   3. both dictionaries carry the same key set (no untranslated key);
//   4. the three new panel actions speak the exact Host remote contract;
//   5. capability namespaces resolve through the ungated `ctx.get`, with the
//      `ctx.remote.<space>` fallback, and a composition that publishes neither
//      degrades instead of throwing during plugin activation.
// Renders nothing and touches no DOM service.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const APP_ROOT = process.env.DSH_APP_ROOT ?? "F:/DSHDesktop/DSH Desktop/resources/app";
const CLIENT = path.join(APP_ROOT, "node_modules", "@deepseek-ai", "dsh-experimental-client-ui-agent-team", "lib", "client.js");
const requireFromApp = createRequire(path.join(APP_ROOT, "package.json"));

const failures = [];
const check = (name, condition, detail = "") => {
	if (condition) console.log(`  PASS  ${name}`);
	else failures.push(`${name}${detail === "" ? "" : ` — ${detail}`}`);
};

let entry;
globalThis.window = { __ModuleLoader__: { load: (value) => { entry = value; } } };
// The panel portals its body into `document.body`, and the bundle injects its
// stylesheet through `document` at module init; a non-null `querySelector` keeps
// the check out of that branch.
globalThis.document = {
	body: {},
	head: { appendChild: () => void 0 },
	activeElement: null,
	querySelector: () => ({}),
	createElement: () => ({ dataset: {}, setAttribute: () => void 0, appendChild: () => void 0 }),
	addEventListener: () => void 0,
	removeEventListener: () => void 0
};
await import(pathToFileURL(CLIENT).href);
check("bundle announces itself through __ModuleLoader__", entry?.id === "@deepseek-ai/dsh-experimental-client-ui-agent-team", JSON.stringify(entry?.id));
check("factory is a function", typeof entry?.factory === "function");

// `react-dom` and the primitives package come from the browser ModuleLoader host
// (the primitives import `.css`, which Node cannot load). `react` exists in the
// app checkout, but its hooks need a renderer, so this check wraps it with a
// callable-stub version: that lets the real component bodies run as plain
// functions and catches render-time throwers — the failure mode that silently
// removed the panel entry point in the field.
const realReact = requireFromApp("react");
let hookOverrides = null;
let hookCursor = 0;
const reactStub = {
	...realReact,
	useState: (initial) => {
		const override = hookOverrides?.[hookCursor];
		hookCursor += 1;
		return [override === void 0 ? initial : override, () => void 0];
	},
	useRef: (initial) => ({ current: initial === void 0 ? null : initial }),
	useEffect: () => void 0,
	useLayoutEffect: () => void 0
};
const stubs = new Map([
	["react", reactStub],
	["react-dom", { createPortal: (node) => node }],
	["@deepseek-ai/dsh-client-ui-primitives", new Proxy({}, { get: () => () => null })]
]);
const requireShim = (id) => stubs.has(id) ? stubs.get(id) : requireFromApp(id);

/** Walk an element tree by calling every component body once. */
const visited = [];
const walk = (node, props, overrides) => {
	if (node === null || node === void 0 || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, props, overrides);
		return;
	}
	const own = { ...props, ...node.props };
	const type = node.type;
	if (typeof type === "function") {
		if (typeof type.name === "string" && type.name !== "") visited.push(type.name);
		hookCursor = 0;
		hookOverrides = overrides?.[type.name];
		walk(type.prototype?.isReactComponent === void 0 ? type(own) : new type(own).render(), own, overrides);
		return;
	}
	// Host elements and fragments (`react/jsx-runtime` exports the latter as a
	// symbol type) both carry their children in props.
	walk(node.props?.children, own, overrides);
};

let remote;
const mod = entry.factory(requireShim);
check("exports apply/inject", typeof mod.apply === "function" && Array.isArray(mod.inject));
// The patch reads capability namespaces through the ungated `ctx.get`, so it
// declares no Remote token at all. `remote.session` / `remote.commands` are
// dotted service keys (the gateway's RemoteNamespaceService is constructed as
// `super(ctx, "remote.session")`): a declared dotted token parks this fiber on
// any composition that does not publish it — the panel entry point then
// silently disappears — while reading `ctx.remote.<space>` without the token
// throws during `apply` and fails the whole renderer boot with no message.
const expectedInject = ["sessions", "uiWorkspace", "slots", "locale"];
check("inject declares every service the patch uses", expectedInject.every((token) => mod.inject.includes(token)), JSON.stringify(mod.inject));
check("inject keeps only proven services", mod.inject.every((token) => expectedInject.includes(token)), JSON.stringify(mod.inject));

// A real Client Context resolves a dotted namespace through the same `ctx.get`
// the patch uses; `remote` stays mutable so each case drives the stub.
const methods = {
	session: {
		modelCatalog: async () => remote.catalog,
		selectModel: async (request) => { remote.select = request; return remote.selectResult; }
	},
	commands: {
		execute: async (agentId, line, attachments) => { remote.executed = { agentId, line, attachments }; return remote.executeResult; }
	}
};
// `ctx.get("remote.<space>")` is the ungated key the patch uses. `ctx.remote`
// still exists on the stub, as it does in the app, but the patch never reads it.
const namespaces = () => ({ "remote.session": methods.session, "remote.commands": methods.commands });

let dictionary;
let slot;
let opened;
const context = (extra) => ({
	effect: (fn) => fn(),
	locale: { register: (namespace, dictionaries) => { dictionary = { namespace, dictionaries }; } },
	sessions: {
		binding: () => void 0,
		retainInfo: () => ({ getSnapshot: () => ({ retainedBy: { mainView: 1 } }) })
	},
	uiWorkspace: { openSession: (value) => { opened = value; } },
	slots: {
		inject: (name, callback) => callback(),
		register: (definition, component) => { slot = { definition, component }; }
	},
	get: (name) => namespaces()[name],
	remote: methods,
	...extra
});

// The patch records a mount marker through `localStorage` (diagnostics only, and
// guarded), so the check drives a recording stub here.
const stored = new Map();
globalThis.localStorage = { setItem: (key, value) => { stored.set(key, value); }, getItem: (key) => stored.get(key) ?? null };

const ctx = context();
mod.apply(ctx);
check("mount marker recorded for page diagnostics", (() => {
	const marker = JSON.parse(stored.get("dsh.agent-team.mount") ?? "null");
	return marker !== null && typeof marker.at === "number" && JSON.stringify(marker.inject) === JSON.stringify(mod.inject);
})(), stored.get("dsh.agent-team.mount"));
check("registers the agent-team header slot", slot?.definition?.id === "agent-team" && slot?.definition?.name === "conversation.session.header.actions", JSON.stringify(slot?.definition));
check("slot keeps its locale namespace and order", slot?.definition?.locale === "agent-team" && slot?.definition?.order === -20);
check("slot owns a component", slot?.component !== void 0);
// react-dom is only supplied by the browser ModuleLoader, so the boundary is
// exercised through its own contract instead of a render.
const wrapper = slot.component({ sessionId: "s1" });
check("header action is wrapped in an error boundary", wrapper?.type?.name === "TeamActionBoundary" && wrapper?.props?.children?.type?.name === "TeamAction", String(wrapper?.type?.name));
const boundary = new wrapper.type(wrapper.props);
check("boundary renders its child while healthy", boundary.render() === wrapper.props.children);
boundary.state = { error: new Error("boom") };
check("boundary renders the message instead of losing the entry point", String(boundary.render()?.props?.children).includes("agent-team: boom"));
check("boundary derives its state from the thrown error", wrapper.type.getDerivedStateFromError(new Error("x"))?.error?.message === "x");

// --- the panel must render a freshly created member (no prior model choice) ---
// A brand-new member has `modelSelection.next === null`; the roster used to read
// `.provider` off it, which threw while rendering and unmounted the whole action
// (the field report: "agent-team: Cannot read properties of null (reading 'provider')").
const leadId = "session-5d5c0225-a805-4ab5-bac8-eacb7e4fb866";
const teamView = {
	members: [
		{ id: "lead", name: "lead", role: "lead", phase: "active" },
		{ id: "m1", name: "1", role: "teammate", phase: "active", description: "测试，无需回复" }
	],
	tasks: [{
		id: "t1",
		subject: "probe",
		description: "probe",
		status: "pending",
		ownerName: "1",
		ready: true,
		blockedBy: [],
		writeScopes: [],
		writeScopeWarnings: []
	}]
};
const viewProps = {
	sessionId: leadId,
	useSession: (selector) => selector({ subagent: void 0, openState: "ready" }),
	useSessions: (selector) => selector({
		phase: "ready",
		byId: {},
		projectionsBySession: {
			[leadId]: { values: { agentTeam: teamView } },
			m1: { values: { agentTeam: { members: [], tasks: [] }, modelSelection: { next: null } } }
		}
	}),
	useSessionStatus: (selector) => selector({ get: () => void 0 }),
	openTeammate: () => void 0,
	loadModels: async () => [],
	setMemberModel: async () => void 0,
	runTeamCommand: async () => ({ kind: "success", text: "ok" }),
	t: (key) => key
};
let renderError;
try {
	walk(slot.component(viewProps), viewProps, {
		TeamAction: [true, null, [], true, false, { name: "", task: "", model: "", fork: false }]
	});
} catch (error) { renderError = error; }
check("the panel renders a member with no model selection", renderError === void 0, String(renderError));
check("the render walk reached the roster rows", visited.includes("TeamAction") && visited.includes("TeamMemberRow"), JSON.stringify([...new Set(visited)]));
check("the render walk reached the task cards", visited.includes("TaskCard"), JSON.stringify([...new Set(visited)]));
check("locale dictionaries registered", dictionary?.namespace === "agent-team" && dictionary?.dictionaries?.zh !== void 0 && dictionary?.dictionaries?.en !== void 0);

const zhKeys = Object.keys(dictionary.dictionaries.zh).sort();
const enKeys = Object.keys(dictionary.dictionaries.en).sort();
check("zh/en key sets match", zhKeys.join("|") === enKeys.join("|"), `${zhKeys.length} vs ${enKeys.length}`);
for (const key of ["addOpen", "addClose", "addName", "addTask", "addModel", "addModelDefault", "addFork", "addSubmit", "addBusy", "addMissing", "memberModel", "memberModelDefault", "memberRetire", "memberRetiring"]) {
	check(`dictionary has "${key}"`, zhKeys.includes(key) && enKeys.includes(key));
}

const actions = slot.definition.inject();
check("panel actions exposed", ["openTeammate", "loadModels", "setMemberModel", "runTeamCommand"].every((name) => typeof actions[name] === "function"), JSON.stringify(Object.keys(actions)));

// --- loadModels ---
remote = {};
remote.catalog = { ok: true, value: { groups: [{ id: "openai", models: [{ id: "gpt-5.6-luna" }] }] } };
const groups = await actions.loadModels();
check("loadModels returns the catalog groups", groups?.[0]?.id === "openai", JSON.stringify(groups));
remote.catalog = { ok: false, error: { code: "session/unavailable", message: "nope" } };
check("loadModels degrades to an empty list", Array.isArray(await actions.loadModels()) && (await actions.loadModels()).length === 0);

// --- setMemberModel ---
remote = { selectResult: { ok: true, value: { selected: { provider: "zai", model: "glm-5.3" } } } };
check("setMemberModel succeeds", (await actions.setMemberModel("m1", { provider: "zai", model: "glm-5.3" })) === void 0);
check("setMemberModel targets the member session", remote.select?.sessionId === "m1" && remote.select?.provider === "zai" && remote.select?.model === "glm-5.3", JSON.stringify(remote.select));
check("setMemberModel sends no stray keys", JSON.stringify(Object.keys(remote.select).sort()) === JSON.stringify(["model", "provider", "sessionId"]), JSON.stringify(Object.keys(remote.select)));
remote.selectResult = { ok: false, error: { code: "session/model-unavailable", message: "bad route" } };
check("setMemberModel reports the host error", (await actions.setMemberModel("m1", { provider: "zai", model: "x" })) === "session/model-unavailable: bad route");

// --- runTeamCommand ---
remote = { executeResult: { ok: true, value: { commandId: "c1", result: { kind: "success", text: "ok" } } } };
check("runTeamCommand forwards a success result", (await actions.runTeamCommand("s1", "/team list"))?.text === "ok");
check("runTeamCommand passes the Lead session, line, and empty attachments", remote.executed?.agentId === "s1" && remote.executed?.line === "/team list" && JSON.stringify(remote.executed?.attachments) === "[]", JSON.stringify(remote.executed));
remote.executeResult = { ok: true, value: void 0 };
check("an unmatched line becomes a command error", (await actions.runTeamCommand("s1", "/nope"))?.text === "unknown command: /nope");
remote.executeResult = { ok: true, value: { commandId: "c2", result: { kind: "error", text: "team says no" } } };
check("runTeamCommand forwards a command-level error", (await actions.runTeamCommand("s1", "/team retire x"))?.kind === "error");
remote.executeResult = { ok: false, error: { code: "remote/transport", message: "offline" } };
check("a transport failure becomes a command error", (await actions.runTeamCommand("s1", "/team list"))?.text === "remote/transport: offline");

// --- openTeammate is untouched by the patch ---
remote = {};
actions.openTeammate("s1", "s1");
check("openTeammate still opens the Lead session", opened === "s1", JSON.stringify(opened));
actions.openTeammate("s1", "child1");
check("openTeammate still opens a continuable child", opened?.childSessionId === "child1" && opened?.mode === "continuable", JSON.stringify(opened));

// --- the patch must not depend on the Remote service object at all ---
// The panel entry point disappears when the plugin's fiber parks on a service the
// composition does not publish, and `ctx.remote.<space>` throws without its
// dotted token, so the namespaces are reached only through `ctx.get`.
check("patch declares no Remote token", !mod.inject.some((token) => token === "remote" || token.startsWith("remote.")), JSON.stringify(mod.inject));
const noRemoteCtx = context({ remote: void 0 });
mod.apply(noRemoteCtx);
const noRemote = slot.definition.inject();
remote = { catalog: { ok: true, value: { groups: [{ id: "zai", models: [{ id: "glm-5.3" }] }] } } };
check("models resolve while `ctx.remote` is absent", (await noRemote.loadModels())?.[0]?.id === "zai");
remote = { executeResult: { ok: true, value: { commandId: "c3", result: { kind: "success", text: "no remote ok" } } } };
check("commands resolve while `ctx.remote` is absent", (await noRemote.runTeamCommand("s1", "/team list"))?.text === "no remote ok");

// --- the panel degrades instead of failing when a remote namespace is absent ---
const bareCtx = context({ get: () => void 0, remote: {} });
mod.apply(bareCtx);
const bare = slot.definition.inject();
check("loadModels degrades when the remote session is absent", Array.isArray(await bare.loadModels()) && (await bare.loadModels()).length === 0);
check("setMemberModel reports an absent remote session", typeof (await bare.setMemberModel("m1", { provider: "a", model: "b" })) === "string");
check("runTeamCommand reports an absent remote namespace", (await bare.runTeamCommand("s1", "/team list"))?.kind === "error");

// --- a re-apply must not be able to cost the header action ---
// The client-modules loader can re-apply a plugin when the module graph changes;
// the header entry point is the one registration that must survive it.
const duplicateLocaleCtx = context({
	locale: { register() { throw new Error("agent-team: locale namespace is already registered"); } }
});
slot = void 0;
mod.apply(duplicateLocaleCtx);
check("a duplicate locale registration cannot cost the header action", slot?.definition?.id === "agent-team");
globalThis.localStorage = { setItem() { throw new Error("QuotaExceededError"); }, getItem: () => null };
slot = void 0;
mod.apply(context());
check("a failing localStorage cannot cost the header action", slot?.definition?.id === "agent-team");
globalThis.localStorage = { setItem: (key, value) => { stored.set(key, value); }, getItem: (key) => stored.get(key) ?? null };

// --- a throwing service lookup must not break plugin activation ---
// Regression guard for the renderer boot failure: a throw inside `apply` takes
// the whole plugin down while the host only reports "did not provide an error
// message".
const throwingCtx = context({
	get() { throw new Error('cannot get required service "remote.session" in inactive context'); }
});
Object.defineProperty(throwingCtx, "remote", {
	get() { throw new Error('cannot get property "remote" without inject'); }
});
slot = void 0;
let activationError;
try { mod.apply(throwingCtx); } catch (error) { activationError = error; }
check("a throwing service lookup cannot break plugin activation", activationError === void 0, String(activationError));
check("a throwing service lookup still leaves the panel mounted", slot !== void 0);
const guarded = slot?.definition.inject();
check("a throwing service lookup degrades model selection", typeof (await guarded.setMemberModel("m1", { provider: "a", model: "b" })) === "string");
check("a throwing service lookup degrades roster commands", (await guarded.runTeamCommand("s1", "/team list"))?.kind === "error");

console.log(failures.length === 0 ? "TEAM-UI-CHECK OK（失败 0 项）" : `TEAM-UI-CHECK FAILED（${failures.length} 项）`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
