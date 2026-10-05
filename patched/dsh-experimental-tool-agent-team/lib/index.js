import z from "@deepseek-ai/schemastery";
import { TeamTaskId } from "@deepseek-ai/dsh-experimental-agent-team";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { CommandDefinitionId } from "@deepseek-ai/dsh-commands/brand";
//#region lib/types/index.js
/** Scoped model-facing tools for the opt-in Agent Teams runtime. */
/** Cordis plugin name. */
const name = "tool-agent-team";
/** Services required by the Team tool plugin. */
const inject = [
	"agents",
	"agentTeams",
	"tools",
	"systemPrompt"
];
/** Loader schema for the opt-in Team tool plugin. */
const Config = z.object({
	freshProvider: z.string().default("spawn"),
	forkProvider: z.string().default("fork")
});
/** Model-facing collaboration guidance shared by Lead and teammates. */
const POLICY = `Agent Teams is available in this session, but create teammates only when the user explicitly asks to use Agent Teams or teammates.

The Team Lead and all teammates share the same working directory and filesystem. Edits are immediately visible to every member. Split write work into disjoint scopes, record expected write scopes on shared tasks, and use task dependencies when work must be ordered. Write-scope overlap is advisory, not a lock.

Prefer read/edit/write for file changes. If a file operation returns FS_STALE_VERSION, read the current file, rebase your intended change onto the new content, and retry. Bash, formatters, code generators, and scripts are not fully protected by the filesystem version guard; coordinate them explicitly and have the Lead review the final diff and run tests.

Use the target returned by spawn_teammate or list_agents for send_message, interrupt_agent, and retire_teammate, or as owner when assigning or filtering shared tasks. retire_teammate releases a teammate's roster seat while keeping its durable record, tasks, and messages; retire a teammate only once its work is handed off or superseded, and never to silence one that has unfinished work. send_message steers a running target at its nearest step boundary and starts or resumes an inactive target. inactive means no turn is executing; it does not describe task completion, success, failure, or waiting for other agents. provisioning means member creation is in progress; failed means member creation failed. A delivered peer item starts with its stable message id and sender name. A successful send is already durable even when its result says queued; do not resend it. Shared-task workflow is list, get, claim with the current revision, perform the work, then complete. Task readiness never starts an owner. Before wait_agent, use list_agents and make sure another required member is running or provisioning; use send_message first when the required member is inactive. wait_agent observes only changes after that call starts, never wakes a member, and returns noProgress immediately when no other member can produce a change. Re-list after wakeup or timeout. The Lead must wait for required teammates before giving the final answer.`;
const ACTIVE_WAIT_STATUSES = new Set(["running", "provisioning"]);
const NO_ACTIVE_PEER_MESSAGE = "No other Team member is running or provisioning. wait_agent cannot make progress or wake inactive teammates. Re-list with list_agents and team_task_list, then use send_message to wake each required inactive teammate before waiting again.";
/**
* One model-facing roster row. The Lead pseudo-row omits the
* teammate-only provisioning fields, so only identity, role, status, and
* diagnostics are required.
*/
const MEMBER_VIEW_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		target: {
			type: "string",
			required: true
		},
		role: {
			type: "string",
			required: true,
			enum: ["lead", "teammate"]
		},
		status: {
			type: "string",
			required: true,
			enum: [
				"running",
				"inactive",
				"provisioning",
				"failed"
			]
		},
		description: { type: "string" },
		provider: { type: "string" },
		context: {
			type: "string",
			enum: ["fresh", "fork"]
		},
		model: { type: "string" },
		diagnostics: {
			type: "array",
			required: true,
			items: { type: "string" }
		}
	}
};
/** Expose the member name as its model-facing target. */
function modelMember(member) {
	const { id: _id, name, ...details } = member;
	return {
		target: name,
		...details
	};
}
/** The system reminder every newly created teammate starts with. */
function teammateReminder(name) {
	return `<system-reminder>
You are teammate "${name}".
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
	return {
		provider: route.slice(0, separator),
		model: route.slice(separator + 1)
	};
}
/** One shared task, matching the public `TeamTaskView`. */
const TASK_VIEW_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			type: "string",
			required: true
		},
		revision: {
			type: "integer",
			required: true
		},
		subject: {
			type: "string",
			required: true
		},
		description: {
			type: "string",
			required: true
		},
		status: {
			type: "string",
			required: true,
			enum: [
				"pending",
				"in_progress",
				"completed",
				"deleted"
			]
		},
		ownerName: { type: "string" },
		blockedBy: {
			type: "array",
			required: true,
			items: { type: "string" }
		},
		writeScopes: {
			type: "array",
			required: true,
			items: { type: "string" }
		},
		ready: {
			type: "boolean",
			required: true
		},
		writeScopeWarnings: {
			type: "array",
			required: true,
			items: { type: "string" }
		}
	}
};
const SPAWN_VALUE_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: { member: {
		...MEMBER_VIEW_SCHEMA,
		required: true
	} }
};
const MEMBER_LIST_VALUE_SCHEMA = {
	type: "array",
	items: MEMBER_VIEW_SCHEMA
};
const SEND_VALUE_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		messageId: {
			type: "string",
			required: true
		},
		status: {
			type: "string",
			required: true,
			enum: ["accepted", "queued"]
		}
	}
};
/** `noProgress` is present only on the model-only shortcut that skips the wait. */
const WAIT_VALUE_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		timedOut: {
			type: "boolean",
			required: true
		},
		noProgress: {
			type: "object",
			additionalProperties: false,
			properties: {
				reason: {
					type: "string",
					required: true,
					const: "no-active-peer"
				},
				message: {
					type: "string",
					required: true
				}
			}
		}
	}
};
const INTERRUPT_VALUE_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: { previousStatus: {
		type: "string",
		required: true,
		enum: ["running", "inactive"]
	} }
};
const TASK_LIST_VALUE_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		tasks: {
			type: "array",
			required: true,
			items: TASK_VIEW_SCHEMA
		},
		nextCursor: { type: "integer" }
	}
};
/**
* Declare one canonical output schema with compact model-facing JSON. Every
* Team result is a fixed record, so the declared schema is what makes the
* compiler check `execute` against the value the model is promised.
* @param schema - canonical value schema for one tool.
* @returns the `output` declaration accepted by {@link defineTool}.
*/
function jsonOutput(schema) {
	return {
		schema,
		render: (_args, value) => [{
			type: "text",
			text: JSON.stringify(value)
		}]
	};
}
/** Recover the exact caller guaranteed by Agent-scoped tool discovery. */
function callingAgent(agent, toolName) {
	/* v8 ignore next 2 -- Team tools are registered only in an exact Agent scope, so discovery supplies this carrier. */
	if (agent === void 0) throw new Error(`${toolName} requires a calling Agent`);
	return agent;
}
/** Register the complete Team tool set in one exact Agent scope. */
function install(agent, ctx, config) {
	const scoped = agent.ctx;
	const disposers = [];
	const register = (disposer) => {
		disposers.push(disposer);
	};
	try {
		register(scoped.systemPrompt.section({
			name: "team:policy",
			order: scoped.systemPrompt.getSectionOrder("TEAM_POLICY"),
			text: POLICY
		}));
		register(scoped.tools.register(defineTool({
			name: "spawn_teammate",
			description: "Create one named, durable teammate. Only the Team Lead may call this tool.",
			parameters: {
				name: {
					type: "string",
					required: true,
					description: "Unique lower-kebab-case teammate name."
				},
				description: {
					type: "string",
					required: true,
					description: "Short description of the delegated responsibility."
				},
				prompt: {
					type: "string",
					required: true,
					description: "Complete initial task for the teammate."
				},
				context: {
					type: "string",
					enum: ["fresh", "fork"],
					description: "fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh."
				},
				model: {
					type: "string",
					description: "Optional `<provider>/<model>` LLM route for the teammate. Defaults to the Lead's route."
				}
			},
			output: jsonOutput(SPAWN_VALUE_SCHEMA),
			async execute(args, exec) {
				const agent = callingAgent(exec.agent, "spawn_teammate");
				const context = args.context ?? "fresh";
				const model = args.model === void 0 ? void 0 : parseModelRoute(args.model);
				if (args.model !== void 0 && model === void 0) throw new Error(`model must be "<provider>/<model>", got "${args.model}"`);
				return { member: modelMember((await ctx.agentTeams.spawnTeammate(agent, {
					name: args.name,
					description: args.description,
					prompt: [{
						type: "text",
						text: teammateReminder(args.name.trim())
					}, {
						type: "text",
						text: args.prompt
					}],
					context,
					provider: context === "fork" ? config.forkProvider : config.freshProvider,
					...model === void 0 ? {} : { agentOptions: model },
					signal: exec.signal
				})).member) };
			}
		})));
		register(scoped.tools.register(defineTool({
			name: "send_message",
			description: "Send one durable message to another Team member. A running target receives it at the nearest step boundary; an inactive target starts or resumes a turn.",
			parameters: {
				target: {
					type: "string",
					required: true,
					description: "Member target returned by spawn_teammate or list_agents, including lead."
				},
				message: {
					type: "string",
					required: true,
					description: "Self-contained message for the target."
				}
			},
			output: jsonOutput(SEND_VALUE_SCHEMA),
			execute(args, exec) {
				return ctx.agentTeams.sendMessage(callingAgent(exec.agent, "send_message"), {
					target: args.target,
					content: [{
						type: "text",
						text: args.message
					}],
					signal: exec.signal
				});
			}
		})));
		register(scoped.tools.register(defineTool({
			name: "list_agents",
			description: "List the Lead and every durable teammate with an addressable target and current availability. inactive means no turn is executing, not a task result. provisioning and failed describe member creation.",
			parameters: {},
			output: jsonOutput(MEMBER_LIST_VALUE_SCHEMA),
			execute(_args, exec) {
				return Promise.resolve(ctx.agentTeams.listMembers(callingAgent(exec.agent, "list_agents")).map(modelMember));
			}
		})));
		register(scoped.tools.register(defineTool({
			name: "wait_agent",
			description: "Wait for the next teammate status, mailbox, or shared-task change after this call starts. This never wakes inactive members and returns noProgress immediately when no other member is running or provisioning. Re-list after wakeup or timeout instead of polling.",
			parameters: { timeout_ms: {
				type: "integer",
				description: "Wait duration in milliseconds, from 10000 through 3600000. Defaults to 30000."
			} },
			output: jsonOutput(WAIT_VALUE_SCHEMA),
			async execute(args, exec) {
				const caller = callingAgent(exec.agent, "wait_agent");
				const timeoutMs = args.timeout_ms ?? 3e4;
				if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1e4 || timeoutMs > 36e5) return await ctx.agentTeams.waitForChange(caller, timeoutMs, exec.signal);
				if (!ctx.agentTeams.listMembers(caller).some((member) => member.id !== caller.id && ACTIVE_WAIT_STATUSES.has(member.status))) return {
					timedOut: false,
					noProgress: {
						reason: "no-active-peer",
						message: NO_ACTIVE_PEER_MESSAGE
					}
				};
				return await ctx.agentTeams.waitForChange(caller, timeoutMs, exec.signal);
			}
		})));
		register(scoped.tools.register(defineTool({
			name: "interrupt_agent",
			description: "Interrupt one teammate's current turn while preserving its pending inbox. Team Lead only.",
			parameters: { target: {
				type: "string",
				required: true,
				description: "Teammate target returned by spawn_teammate or list_agents."
			} },
			output: jsonOutput(INTERRUPT_VALUE_SCHEMA),
			execute(args, exec) {
				return Promise.resolve(ctx.agentTeams.interrupt(callingAgent(exec.agent, "interrupt_agent"), args.target));
			}
		})));
		register(scoped.tools.register(defineTool({
			name: "retire_teammate",
			description: "Retire one teammate: it stops holding a roster seat and leaves list_agents, while its durable record, tasks, and messages stay. Team Lead only.",
			parameters: { target: {
				type: "string",
				required: true,
				description: "Teammate target returned by spawn_teammate or list_agents."
			} },
			output: jsonOutput(INTERRUPT_VALUE_SCHEMA),
			async execute(args, exec) {
				return await ctx.agentTeams.retireTeammate(callingAgent(exec.agent, "retire_teammate"), args.target);
			}
		})));
		register(scoped.tools.register(defineTool({
			name: "team_task_create",
			description: "Create one unowned pending task on the shared Team task board.",
			parameters: {
				subject: {
					type: "string",
					required: true,
					description: "Concise task title."
				},
				description: {
					type: "string",
					required: true,
					description: "Complete task details and acceptance criteria."
				},
				blocked_by: {
					type: "array",
					items: { type: "string" },
					description: "Task ids that must complete first."
				},
				write_scopes: {
					type: "array",
					items: { type: "string" },
					description: "Advisory workspace-relative file or directory prefixes this task expects to modify."
				}
			},
			output: jsonOutput(TASK_VIEW_SCHEMA),
			async execute(args, exec) {
				return await ctx.agentTeams.createTask(callingAgent(exec.agent, "team_task_create"), {
					subject: args.subject,
					description: args.description,
					...args.blocked_by === void 0 ? {} : { blockedBy: args.blocked_by.map(TeamTaskId) },
					...args.write_scopes === void 0 ? {} : { writeScopes: args.write_scopes }
				});
			}
		})));
		register(scoped.tools.register(defineTool({
			name: "team_task_list",
			description: "List shared tasks, including readiness, owner, revision, blockers, and write-scope warnings.",
			parameters: {
				status: {
					type: "string",
					enum: [
						"pending",
						"in_progress",
						"completed"
					],
					description: "Optional exact status filter."
				},
				owner: {
					type: "string",
					description: "Optional member target from spawn_teammate or list_agents, matching ownerName; use unowned for tasks without an owner."
				},
				ready: {
					type: "boolean",
					description: "Optional readiness filter."
				},
				cursor: {
					type: "integer",
					description: "Zero-based result offset. Defaults to 0."
				},
				limit: {
					type: "integer",
					description: "Number of rows, 1 through 100. Defaults to 50."
				}
			},
			output: jsonOutput(TASK_LIST_VALUE_SCHEMA),
			execute(args, exec) {
				const status = args.status;
				const filtered = ctx.agentTeams.listTasks(callingAgent(exec.agent, "team_task_list")).filter((task) => (status === void 0 || task.status === status) && (args.owner === void 0 || (args.owner === "unowned" ? task.ownerName === void 0 : task.ownerName === args.owner)) && (args.ready === void 0 || task.ready === args.ready));
				const cursor = args.cursor ?? 0;
				const limit = args.limit ?? 50;
				if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("cursor must be a non-negative safe integer");
				if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be an integer from 1 through 100");
				return Promise.resolve({
					tasks: filtered.slice(cursor, cursor + limit),
					...cursor + limit < filtered.length ? { nextCursor: cursor + limit } : {}
				});
			}
		})));
		register(scoped.tools.register(defineTool({
			name: "team_task_get",
			description: "Read the complete latest value of one shared task before changing or executing it.",
			parameters: { task_id: {
				type: "string",
				required: true,
				description: "Shared task id."
			} },
			output: jsonOutput(TASK_VIEW_SCHEMA),
			async execute(args, exec) {
				return Promise.resolve(ctx.agentTeams.getTask(callingAgent(exec.agent, "team_task_get"), TeamTaskId(args.task_id)));
			}
		})));
		register(scoped.tools.register(defineTool({
			name: "team_task_update",
			description: "Compare-and-set a shared task action using the latest revision from team_task_get or team_task_list.",
			parameters: {
				task_id: {
					type: "string",
					required: true,
					description: "Shared task id."
				},
				expected_revision: {
					type: "integer",
					required: true,
					description: "Current task revision used as the CAS precondition."
				},
				action: {
					type: "string",
					required: true,
					enum: [
						"claim",
						"release",
						"edit",
						"set_dependencies",
						"complete",
						"reopen",
						"reassign",
						"delete"
					],
					description: "Task transition to apply."
				},
				subject: {
					type: "string",
					description: "Replacement title for edit."
				},
				description: {
					type: "string",
					description: "Replacement details for edit."
				},
				blocked_by: {
					type: "array",
					items: { type: "string" },
					description: "Complete blocker list for set_dependencies."
				},
				write_scopes: {
					type: "array",
					items: { type: "string" },
					description: "Replacement advisory write scopes for edit."
				},
				owner: {
					type: "string",
					description: "Member target from spawn_teammate or list_agents for Lead-only reassign; omit to unassign."
				}
			},
			output: jsonOutput(TASK_VIEW_SCHEMA),
			async execute(args, exec) {
				return await ctx.agentTeams.updateTask(callingAgent(exec.agent, "team_task_update"), {
					taskId: TeamTaskId(args.task_id),
					expectedRevision: args.expected_revision,
					action: args.action,
					...args.subject === void 0 ? {} : { subject: args.subject },
					...args.description === void 0 ? {} : { description: args.description },
					...args.blocked_by === void 0 ? {} : { blockedBy: args.blocked_by.map(TeamTaskId) },
					...args.write_scopes === void 0 ? {} : { writeScopes: args.write_scopes },
					...args.owner === void 0 ? {} : { owner: args.owner }
				});
			}
		})));
	} catch (error) {
		for (const dispose of disposers.reverse()) dispose();
		throw error;
	}
	return () => {
		for (const dispose of disposers.reverse()) dispose();
	};
}
/**
* Parse one `/team` line. Grammar:
* `list` | `retire <name>` | `model <name> <provider>/<model>` |
* `add <name> [--fork] [--model <provider>/<model>] -- <prompt>`.
* @param rawInput - text after the command name.
* @returns a parsed request, or `{ error }` with usage text.
*/
function parseTeamCommand(rawInput) {
	const raw = rawInput.trim();
	// Everything after a standalone `--` is the prompt, kept verbatim (newlines included).
	const separates = /(?:^|\s)--(?=\s|$)/u.exec(raw);
	const prompt = separates === null ? "" : raw.slice(separates.index + separates[0].length).trim();
	const tokens = (separates === null ? raw : raw.slice(0, separates.index)).split(/\s+/u).filter((token) => token !== "");
	const addUsage = 'usage: /team add <name> [--fork] [--model <provider>/<model>] -- <prompt>';
	if (tokens.length === 0 || tokens[0] === "help")
		return { error: `usage: /team list | /team retire <name> | /team model <name> <provider>/<model> | ${addUsage}` };
	const [action, ...rest] = tokens;
	if (action === "list") return separates === null && rest.length === 0 ? { action } : { error: "usage: /team list" };
	if (action === "retire")
		return separates === null && rest.length === 1 ? { action, name: rest[0] } : { error: "usage: /team retire <name>" };
	if (action === "model") {
		const usage = "usage: /team model <name> <provider>/<model>";
		if (separates !== null || rest.length !== 2) return { error: usage };
		const route = parseModelRoute(rest[1]);
		return route === void 0 ? { error: `${usage} — got "${rest[1]}"` } : { action, name: rest[0], agentOptions: route };
	}
	if (action !== "add") return { error: `unknown Team subcommand "${action}"; use list, add, retire, or model` };
	const parsed = { action, context: "fresh" };
	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index];
		if (token === "--fork") { parsed.context = "fork"; continue; }
		if (token === "--model") {
			const value = rest[index + 1];
			const route = value === void 0 ? void 0 : parseModelRoute(value);
			if (route === void 0) return { error: `--model needs <provider>/<model>, got "${value ?? ""}"` };
			parsed.agentOptions = route;
			index += 1;
			continue;
		}
		if (parsed.name === void 0 && !token.startsWith("--")) { parsed.name = token; continue; }
		return { error: `unexpected /team argument "${token}"` };
	}
	if (parsed.name === void 0) return { error: addUsage };
	if (prompt === "") return { error: `the new teammate needs an initial task: /team add ${parsed.name} -- <prompt>` };
	return { ...parsed, description: describeTask(prompt), prompt };
}
/**
* Run one parsed `/team` request against the Team runtime. Every rejection is
* reported as a command error so the panel can surface it in place.
* @param ctx - the plugin Context carrying the injected Team service.
* @param providers - configured fresh/fork subagent provider names.
* @param invocation - the executing command invocation.
* @returns the command result.
*/
async function executeTeamCommand(ctx, providers, invocation) {
	const parsed = parseTeamCommand(invocation.rawInput);
	if (parsed.error !== void 0) return { kind: "error", text: parsed.error };
	const agent = invocation.agent;
	try {
		if (parsed.action === "list") {
			const rows = ctx.agentTeams.listMembers(agent).map((member) => `${member.name} · ${member.role} · ${member.status}${member.model === void 0 ? "" : ` · ${member.model}`}`);
			return { kind: "success", text: rows.length === 0 ? "No Team members." : rows.join("\n") };
		}
		if (parsed.action === "retire") {
			const { previousStatus } = await ctx.agentTeams.retireTeammate(agent, parsed.name);
			return { kind: "success", text: `retired teammate "${parsed.name}" (was ${previousStatus})` };
		}
		if (parsed.action === "model") {
			// A teammate's model is frozen into its subagent descriptor at creation and
			// the child Session is owned by subagent routing, so the only supported way
			// to re-route one is to retire it and materialize it again under the same
			// name with the new route.
			const target = ctx.agentTeams.listMembers(agent).find((member) => member.name === parsed.name);
			if (target === void 0) return { kind: "error", text: `teammate "${parsed.name}" is not in this Team` };
			if (target.role === "lead") return { kind: "error", text: `"${parsed.name}" is the Team Lead; pick a teammate` };
			const route = `${parsed.agentOptions.provider}/${parsed.agentOptions.model}`;
			const { previousStatus } = await ctx.agentTeams.retireTeammate(agent, parsed.name);
			const fork = target.context === "fork";
			const { member } = await ctx.agentTeams.spawnTeammate(agent, {
				name: parsed.name,
				description: target.description ?? `Teammate ${parsed.name}`,
				prompt: [{
					type: "text",
					text: teammateReminder(parsed.name)
				}, {
					type: "text",
					text: `The Team Lead re-routed you to ${route}, so this teammate Session was created fresh. Your previous Session (${target.id}, ${previousStatus}) is retired and its history is not in your context. Call team_task_list and wait_agent to pick your work back up, and send_message to the Lead if you need context it has not sent yet.`
				}],
				context: fork ? "fork" : "fresh",
				provider: fork ? providers.forkProvider : providers.freshProvider,
				agentOptions: parsed.agentOptions,
				signal: invocation.signal
			});
			return { kind: "success", text: `rebuilt teammate "${member.name}" on ${route} (was ${target.model ?? "the Lead's model"}); previous Session ${target.id} retired` };
		}
		const context = parsed.context;
		const { member } = await ctx.agentTeams.spawnTeammate(agent, {
			name: parsed.name,
			description: parsed.description,
			prompt: [{
				type: "text",
				text: teammateReminder(parsed.name)
			}, {
				type: "text",
				text: parsed.prompt
			}],
			context,
			provider: context === "fork" ? providers.forkProvider : providers.freshProvider,
			...parsed.agentOptions === void 0 ? {} : { agentOptions: parsed.agentOptions },
			signal: invocation.signal
		});
		return { kind: "success", text: `spawned teammate "${member.name}"${member.model === void 0 ? "" : ` on ${member.model}`}` };
	} catch (error) {
		return { kind: "error", text: error instanceof Error ? error.message : String(error) };
	}
}
/** Install Team tools in every live or subsequently published Team member scope. */
function apply(ctx, config = {}) {
	const resolved = {
		freshProvider: config.freshProvider ?? "spawn",
		forkProvider: config.forkProvider ?? "fork"
	};
	const installed = /* @__PURE__ */ new Map();
	const maybeInstall = (agent) => {
		if (installed.has(agent) || ctx.agentTeams.tryMembership(agent) === void 0) return;
		installed.set(agent, install(agent, ctx, resolved));
	};
	for (const agent of ctx.agents.list()) maybeInstall(agent);
	ctx.on("agent/created", ({ agent }) => {
		maybeInstall(agent);
	});
	ctx.on("agent/disposed", ({ agent }) => {
		installed.get(agent)?.();
		installed.delete(agent);
	});
	ctx.effect(() => () => {
		for (const dispose of installed.values()) dispose();
		installed.clear();
	}, "tool-team.scopedTools()");
	ctx.inject(["commands"], (commandCtx) => {
		commandCtx.commands.register({
			definitionId: CommandDefinitionId("@deepseek-ai/dsh-experimental-tool-agent-team"),
			name: "team",
			description: "Manage Agent Team members: list the roster, add a teammate, retire one, or re-route one to another model.",
			input: { hint: "list | retire <name> | model <name> <provider>/<model> | add <name> [--fork] [--model <provider>/<model>] -- <prompt>" },
			handler: (invocation) => executeTeamCommand(ctx, resolved, invocation)
		});
	});
}
//#endregion
export { Config, apply, inject, name };
