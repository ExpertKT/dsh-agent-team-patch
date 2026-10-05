// Answers one question against the REAL Cordis the app ships: how does a client
// plugin reach a Remote capability namespace (`remote.session`)?
//
// `dsh-api-gateway` creates every namespace as its own Cordis service named
// `remote.<namespace>` inside a child fiber (`createNamespace`), so the value is
// NOT a property of the `remote` service object. This check reproduces that shape
// with minimal `Service` subclasses and probes the two consumer paths:
//
//   1. `ctx.remote.<space>`      — the path every shipped client plugin uses
//   2. `ctx.get("remote.<space>")` — the ungated store lookup
//
// plus what each requires of the consumer's `inject` list. It renders nothing and
// talks to no host; it only loads cordis from the app checkout.
import { pathToFileURL } from "node:url";
import path from "node:path";

const APP_ROOT = process.env.DSH_APP_ROOT ?? "F:/DSHDesktop/DSH Desktop/resources/app";
const { Context, Service } = await import(pathToFileURL(path.join(APP_ROOT, "node_modules", "@deepseek-ai", "cordis", "lib", "index.js")).href);

const failures = [];
const check = (name, condition, detail = "") => {
	if (condition) console.log(`  PASS  ${name}`);
	else failures.push(`${name}${detail === "" ? "" : ` — ${detail}`}`);
};

class RemoteService extends Service {
	constructor(ctx) { super(ctx, "remote"); }
}
class NamespaceService extends Service {
	constructor(ctx, space) {
		super(ctx, `remote.${space}`);
		this.space = space;
	}
	async ping() { return { ok: true, value: this.space }; }
}

const observed = new Map();
const probe = (ctx, label) => {
	const record = {};
	const read = (key, thunk) => {
		try {
			const value = thunk();
			record[key] = value === void 0 ? "undefined" : typeof value;
		} catch (error) {
			record[key] = `THREW ${error.message}`;
		}
	};
	read("ctx.get('remote.session')", () => ctx.get("remote.session"));
	read("ctx.get('remote.commands')", () => ctx.get("remote.commands"));
	read("ctx.remote.session", () => ctx.remote?.session);
	read("ctx.remote.commands", () => ctx.remote?.commands);
	read("ctx.remote", () => ctx.remote);
	observed.set(label, record);
};

const root = new Context();
const app = root.plugin({
	name: "app",
	apply: async (ctx) => {
		// Mirror `dsh-api-gateway`: one gateway fiber owns the `remote` service and
		// creates one child fiber per namespace service.
		const gateway = ctx.plugin({
			name: "gateway",
			apply: (gatewayCtx) => {
				new RemoteService(gatewayCtx);
				gatewayCtx.plugin({
					name: "remote.session",
					apply: (namespaceCtx) => { new NamespaceService(namespaceCtx, "session"); }
				});
				gatewayCtx.plugin({
					name: "remote.commands",
					apply: (namespaceCtx) => { new NamespaceService(namespaceCtx, "commands"); }
				});
			}
		});
		await gateway;
		// Sibling consumers, exactly like two independent client plugins.
		await ctx.plugin({ name: "consumer-bare", apply: (consumer) => probe(consumer, "no inject") });
		await ctx.plugin({
			name: "consumer-remote-only",
			inject: ["remote"],
			apply: (consumer) => probe(consumer, 'inject ["remote"]')
		});
		await ctx.plugin({
			name: "consumer-declared",
			inject: ["remote", "remote.session", "remote.commands"],
			apply: (consumer) => probe(consumer, 'inject ["remote","remote.session","remote.commands"]')
		});
	}
});
await app;

for (const [label, record] of observed) {
	console.log(`\n  consumer: ${label}`);
	for (const [key, value] of Object.entries(record)) console.log(`    ${key.padEnd(26)} -> ${value}`);
}

const bare = observed.get("no inject");
const remoteOnly = observed.get('inject ["remote"]');
const declared = observed.get('inject ["remote","remote.session","remote.commands"]');

check("ctx.get finds a namespace without any inject declaration", bare["ctx.get('remote.session')"] === "object", bare["ctx.get('remote.session')"]);
check("ctx.remote itself throws without the `remote` token", String(bare["ctx.remote"]).startsWith("THREW cannot get property \"remote\" without inject"), bare["ctx.remote"]);
check("ctx.remote.<space> throws without the dotted token", String(remoteOnly["ctx.remote.session"]).startsWith("THREW cannot get property \"remote.session\" without inject"), remoteOnly["ctx.remote.session"]);
check("ctx.remote.<space> resolves when the dotted token is declared", declared["ctx.remote.session"] === "object", declared["ctx.remote.session"]);
check("both namespaces follow the same rule", declared["ctx.remote.commands"] === "object" && bare["ctx.get('remote.commands')"] === "object", `${declared["ctx.remote.commands"]} / ${bare["ctx.get('remote.commands')"]}`);

console.log(failures.length === 0 ? "\nREMOTE-NAMESPACE-CHECK OK" : `\nREMOTE-NAMESPACE-CHECK FAILED（${failures.length} 项）`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
