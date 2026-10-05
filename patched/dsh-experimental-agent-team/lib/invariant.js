import { z } from "zod";
import { brandString } from "@deepseek-ai/dsh-brand";
//#region lib/types/types.js
/** Public Agent Teams identities, durable records, and service request values. */
/**
* Brand one root Session identity as its implicit Team identity.
* @param id - Root Session identity.
* @returns the same string branded as a Team identity.
*/
function TeamId(id) {
	return id;
}
/**
* Brand a validated task id.
* @param id - Team-local task identity.
* @returns the same string branded as a Team task identity.
*/
function TeamTaskId(id) {
	return id;
}
/**
* Brand a generated peer-message id.
* @param id - Durable mailbox message identity.
* @returns the same string branded as a Team message identity.
*/
function TeamMessageId(id) {
	return id;
}
//#endregion
//#region lib/types/task-graph.js
/** Complete dependency validation for current Team task snapshots. */
/** Package-private task dependency failure retained for command error mapping. */
var TeamTaskGraphError = class extends Error {
	violation;
	/**
	* @param message - concrete invalid dependency relation.
	* @param violation - stable relation category used by Team commands.
	*/
	constructor(message, violation) {
		super(message);
		this.violation = violation;
		this.name = "TeamTaskGraphError";
	}
};
/**
* Validate the complete active task graph after replacing one candidate snapshot.
* @param current - current task snapshots before the candidate event.
* @param candidate - new or next-revision task snapshot.
* @throws {TeamTaskGraphError} when an active dependency is missing, duplicated, self-referential, or cyclic.
*/
function assertTaskGraphCandidate(current, candidate) {
	const tasks = new Map(current.map((task) => [task.id, task]));
	tasks.set(candidate.id, candidate);
	for (const task of tasks.values()) {
		if (task.status === "deleted") continue;
		const seen = /* @__PURE__ */ new Set();
		for (const blockerId of task.blockedBy) {
			if (blockerId === task.id) throw new TeamTaskGraphError(`team task "${task.id}" cannot block itself`, "cycle");
			if (seen.has(blockerId)) throw new TeamTaskGraphError(`team task "${task.id}" repeats blocker "${blockerId}"`, "duplicate");
			const blocker = tasks.get(blockerId);
			if (blocker === void 0 || blocker.status === "deleted") throw new TeamTaskGraphError(`blocker task "${blockerId}" for "${task.id}" is missing or deleted`, "missing");
			seen.add(blockerId);
		}
	}
	const visiting = /* @__PURE__ */ new Set();
	const visited = /* @__PURE__ */ new Set();
	const visit = (id) => {
		if (visiting.has(id)) throw new TeamTaskGraphError(`task dependency cycle includes "${id}"`, "cycle");
		if (visited.has(id)) return;
		const task = tasks.get(id);
		if (task === void 0 || task.status === "deleted") return;
		visiting.add(id);
		for (const blockerId of task.blockedBy) visit(blockerId);
		visiting.delete(id);
		visited.add(id);
	};
	for (const task of tasks.values()) visit(task.id);
}
//#endregion
//#region lib/types/task-view.js
/** Pure task-view derivation shared by the task board and the client projection. */
/**
* Whether two normalized file or directory prefixes overlap on path components.
* @param left - normalized write scope.
* @param right - normalized write scope.
* @returns whether either scope contains the other.
*/
function scopesOverlap(left, right) {
	return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
/**
* Whether every current blocker of one task completed.
* @param state - Team state supplying sibling tasks.
* @param task - durable task snapshot to test.
* @returns whether the task has no incomplete blockers.
*/
function taskReady(state, task) {
	return task.blockedBy.every((id) => state.tasks.find((candidate) => candidate.id === id)?.status === "completed");
}
/**
* Derive one task view with owner name, readiness, and advisory write overlaps.
* A committing caller may pass its pre-append state because `task` supplies the
* new value explicitly; owner names, blocker readiness, and other task scopes
* do not change when that snapshot is appended.
* @param state - Team state supplying members and sibling tasks.
* @param task - durable task snapshot to view.
* @returns a detached task view.
*/
function projectTaskView(state, task) {
	const ownerName = task.ownerId === void 0 ? void 0 : task.ownerId === brandString(state.id) ? "lead" : state.members.find((member) => member.id === task.ownerId)?.name;
	const warnings = /* @__PURE__ */ new Set();
	for (const other of state.tasks) {
		if (other.id === task.id || other.status !== "in_progress") continue;
		if (task.writeScopes.some((left) => other.writeScopes.some((right) => scopesOverlap(left, right)))) warnings.add(`write scopes overlap with ${other.id}`);
	}
	return {
		id: task.id,
		revision: task.revision,
		subject: task.subject,
		description: task.description,
		status: task.status,
		blockedBy: [...task.blockedBy],
		writeScopes: [...task.writeScopes],
		...ownerName === void 0 ? {} : { ownerName },
		ready: task.status === "pending" && taskReady(state, task),
		writeScopeWarnings: [...warnings]
	};
}
//#endregion
//#region lib/types/projection.js
/** Team state projected incrementally from committed Session events, with a durable-only client view. */
const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveSafeInteger = nonNegativeSafeInteger.min(1);
const sessionIdSchema = z.string().min(1).transform((value) => brandString(value));
const teamIdSchema = z.string().min(1).transform((value) => TeamId(value));
const numericTaskIdPattern = /^task-(\d+)$/u;
const teamTaskIdSchema = z.string().min(1).refine((value) => {
	const match = numericTaskIdPattern.exec(value);
	return match === null || Number.isSafeInteger(Number(match[1]));
}, { message: "numeric task id suffix must be a safe integer" }).transform((value) => TeamTaskId(value));
const teamMessageIdSchema = z.string().min(1).transform((value) => TeamMessageId(value));
const coreContentBlockTypes = new Set([
	"text",
	"reasoning",
	"image",
	"tool-call",
	"tool-result"
]);
const imageAttachmentSchema = z.object({
	attachmentId: z.string().min(1),
	mediaType: z.enum([
		"image/png",
		"image/jpeg",
		"image/webp",
		"image/gif"
	]),
	bytes: nonNegativeSafeInteger,
	width: positiveSafeInteger,
	height: positiveSafeInteger,
	name: z.string().optional()
}).strict();
const contentBlockSchema = z.lazy(() => z.union([
	z.object({
		type: z.literal("text"),
		text: z.string()
	}).strict(),
	z.object({
		type: z.literal("reasoning"),
		text: z.string()
	}).strict(),
	z.object({
		type: z.literal("image"),
		attachment: imageAttachmentSchema
	}).strict(),
	z.object({
		type: z.literal("tool-call"),
		id: z.string().min(1),
		name: z.string(),
		arguments: z.string()
	}).strict(),
	z.custom((value) => {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
		const type = value.type;
		return typeof type === "string" && type.length > 0 && !coreContentBlockTypes.has(type);
	})
]));
const teamMemberSnapshotSchema = z.object({
	id: sessionIdSchema,
	name: z.string(),
	description: z.string(),
	provider: z.string(),
	context: z.enum(["fresh", "fork"]),
	phase: z.enum([
		"provisioning",
		"active",
		"failed",
		"retired",
		"resting"
	]),
	error: z.string().optional()
}).strict();
const teamTaskSnapshotSchema = z.object({
	id: teamTaskIdSchema,
	revision: positiveSafeInteger,
	subject: z.string(),
	description: z.string(),
	status: z.enum([
		"pending",
		"in_progress",
		"completed",
		"deleted"
	]),
	ownerId: sessionIdSchema.optional(),
	blockedBy: z.array(teamTaskIdSchema),
	writeScopes: z.array(z.string())
}).strict();
const teamMessageSnapshotSchema = z.object({
	id: teamMessageIdSchema,
	senderId: sessionIdSchema,
	senderName: z.string(),
	targetId: sessionIdSchema,
	content: z.array(contentBlockSchema)
}).strict();
const teamEventSelectorSchema = z.object({
	version: nonNegativeSafeInteger,
	teamId: teamIdSchema
}).loose();
const teamMemberEventSchema = z.object({
	version: z.literal(2),
	teamId: teamIdSchema,
	member: teamMemberSnapshotSchema
}).strict();
const teamTaskEventSchema = z.object({
	version: z.literal(2),
	teamId: teamIdSchema,
	task: teamTaskSnapshotSchema
}).strict();
const teamMessageQueuedEventSchema = z.object({
	version: z.literal(2),
	teamId: teamIdSchema,
	message: teamMessageSnapshotSchema
}).strict();
const teamMessageDeliveredEventSchema = z.object({
	version: z.literal(2),
	teamId: teamIdSchema,
	messageId: teamMessageIdSchema,
	targetId: sessionIdSchema
}).strict();
/**
* Construct empty state for one Team identity.
* @param rootId - root Session identity.
* @returns empty Team state.
*/
function emptyTeamState(rootId) {
	return {
		id: TeamId(rootId),
		members: [],
		tasks: [],
		messages: [],
		delivered: [],
		nextTaskNumber: 1
	};
}
const teamProjectionEntrySchema = z.object({
	id: teamIdSchema,
	members: z.array(teamMemberSnapshotSchema),
	tasks: z.array(teamTaskSnapshotSchema),
	messages: z.array(teamMessageSnapshotSchema),
	delivered: z.array(teamMessageIdSchema),
	nextTaskNumber: positiveSafeInteger,
	failure: z.string().optional()
}).strict();
/**
* Test whether a Session event belongs to the Team domain.
* @param event - candidate Session event.
* @returns whether the event has a Team-owned type.
*/
function isTeamEvent(event) {
	return event.type === "team/member" || event.type === "team/task" || event.type === "team/message/queued" || event.type === "team/message/delivered";
}
/** Decode one persisted Team value and retain the schema failure as its cause. */
function parsePersisted(type, schema, value) {
	try {
		return schema.parse(value);
	} catch (error) {
		throw new Error(`persisted Agent Teams ${type} payload is invalid`, { cause: error });
	}
}
/** Decode the complete current-version payload selected by one Team event type. */
function parseCurrentTeamEvent(event) {
	switch (event.type) {
		case "team/member": return {
			...event,
			data: parsePersisted(event.type, teamMemberEventSchema, event.data)
		};
		case "team/task": return {
			...event,
			data: parsePersisted(event.type, teamTaskEventSchema, event.data)
		};
		case "team/message/queued": return {
			...event,
			data: parsePersisted(event.type, teamMessageQueuedEventSchema, event.data)
		};
		case "team/message/delivered": return {
			...event,
			data: parsePersisted(event.type, teamMessageDeliveredEventSchema, event.data)
		};
		/* v8 ignore next 2 -- TeamEventType is closed and every member is handled above. */
		default: return event;
	}
}
function applyProjectionEvent(state, event) {
	if (state.failure !== void 0) return state;
	if (!isTeamEvent(event)) return state;
	try {
		const selector = parsePersisted(event.type, teamEventSelectorSchema, event.data);
		if (selector.teamId !== state.id) return state;
		if (selector.version !== 2) throw new Error(`unsupported Agent Teams event version ${String(selector.version)}`);
		return applyCurrentTeamEvent(state, parseCurrentTeamEvent(event));
	} catch (error) {
		/* v8 ignore next -- the owned Team transition throws Error instances. */
		return {
			...state,
			failure: error instanceof Error ? error.message : String(error)
		};
	}
}
function replaceAt(items, index, item) {
	const next = [...items];
	if (index < 0) next.push(item);
	else next[index] = item;
	return next;
}
function applyCurrentTeamEvent(state, event) {
	switch (event.type) {
		case "team/member": {
			const member = event.data.member;
			const index = state.members.findIndex((candidate) => candidate.id === member.id);
			const prior = state.members[index];
			const named = state.members.find((candidate) => candidate.name === member.name && candidate.phase !== "retired");
			if (named !== void 0 && named.id !== member.id) throw new Error(`teammate name "${member.name}" is reused by another member`);
			if (prior === void 0) {
				if (member.phase !== "provisioning") throw new Error(`teammate "${member.name}" must begin provisioning`);
			} else {
				if (prior.name !== member.name || prior.provider !== member.provider || prior.context !== member.context) throw new Error(`teammate "${member.id}" changed immutable identity fields`);
				const settles = prior.phase === "provisioning" && (member.phase === "active" || member.phase === "failed");
				const retires = member.phase === "retired" && (prior.phase === "active" || prior.phase === "failed");
				const rests = member.phase === "resting" && prior.phase === "active";
				const wakes = member.phase === "active" && prior.phase === "resting";
				if (!settles && !retires && !rests && !wakes) throw new Error(`teammate "${member.name}" has an invalid ${prior.phase} -> ${member.phase} transition`);
			}
			return {
				...state,
				members: replaceAt(state.members, index, member)
			};
		}
		case "team/task": {
			const task = event.data.task;
			const index = state.tasks.findIndex((candidate) => candidate.id === task.id);
			const prior = state.tasks[index];
			if (prior === void 0 && task.revision !== 1) throw new Error(`team task "${task.id}" must begin at revision 1`);
			if (prior !== void 0 && task.revision !== prior.revision + 1) throw new Error(`team task "${task.id}" revision is not contiguous`);
			assertTaskGraphCandidate(state.tasks, task);
			let nextTaskNumber = state.nextTaskNumber;
			const match = numericTaskIdPattern.exec(task.id);
			if (match !== null) {
				const number = Number(match[1]);
				nextTaskNumber = Math.max(nextTaskNumber, number === Number.MAX_SAFE_INTEGER ? number : number + 1);
			}
			return {
				...state,
				tasks: replaceAt(state.tasks, index, task),
				nextTaskNumber
			};
		}
		case "team/message/queued": {
			const message = event.data.message;
			if (state.messages.some((candidate) => candidate.id === message.id)) throw new Error(`team message "${message.id}" was queued twice`);
			return {
				...state,
				messages: [...state.messages, message]
			};
		}
		case "team/message/delivered": {
			const queued = state.messages.find((message) => message.id === event.data.messageId);
			if (queued === void 0) throw new Error(`team message "${event.data.messageId}" was delivered before queueing`);
			if (queued.targetId !== event.data.targetId) throw new Error(`team message "${event.data.messageId}" target changed`);
			if (state.delivered.includes(event.data.messageId)) throw new Error(`team message "${event.data.messageId}" was delivered twice`);
			return {
				...state,
				delivered: [...state.delivered, event.data.messageId]
			};
		}
		/* v8 ignore next 2 -- TeamEventType is closed and every member is handled above. */
		default: return state;
	}
}
const teamMemberProjectionSchema = z.object({
	id: sessionIdSchema,
	name: z.string(),
	role: z.enum(["lead", "teammate"]),
	phase: z.enum([
		"provisioning",
		"active",
		"failed",
		"retired",
		"resting"
	]),
	error: z.string().optional()
}).strict();
const teamTaskViewSchema = z.object({
	id: teamTaskIdSchema,
	revision: positiveSafeInteger,
	subject: z.string(),
	description: z.string(),
	status: z.enum([
		"pending",
		"in_progress",
		"completed",
		"deleted"
	]),
	blockedBy: z.array(teamTaskIdSchema),
	writeScopes: z.array(z.string()),
	ownerName: z.string().optional(),
	ready: z.boolean(),
	writeScopeWarnings: z.array(z.string())
}).strict();
const teamProjectionSchema = z.object({
	members: z.array(teamMemberProjectionSchema),
	tasks: z.array(teamTaskViewSchema),
	failure: z.string().optional()
}).strict();
/** Client views keyed by the member and task collections they were derived from. */
const teamProjectionViews = /* @__PURE__ */ new WeakMap();
function buildTeamProjection(state) {
	const members = [{
		id: brandString(state.id),
		name: "lead",
		role: "lead",
		phase: "active"
	}];
	for (const member of state.members) {
		if (member.phase === "retired") continue;
		members.push({
			id: member.id,
			name: member.name,
			role: "teammate",
			phase: member.phase,
			...member.error === void 0 ? {} : { error: member.error }
		});
	}
	return {
		members,
		tasks: state.tasks.filter((task) => task.status !== "deleted").map((task) => projectTaskView(state, task)),
		...state.failure === void 0 ? {} : { failure: state.failure }
	};
}
/**
* Durable client view of one Team state. Mailbox-only state changes reuse the
* previous view reference, so the live drive publishes nothing for them.
* A failure is terminal: later events retain the failed state reference and
* do not republish its view.
* @param state - current Team state.
* @returns the roster and non-deleted task board, plus any projection failure.
*/
function teamProjectionView(state) {
	if (state.failure !== void 0) return buildTeamProjection(state);
	let byTasks = teamProjectionViews.get(state.members);
	if (byTasks === void 0) {
		byTasks = /* @__PURE__ */ new WeakMap();
		teamProjectionViews.set(state.members, byTasks);
	}
	let view = byTasks.get(state.tasks);
	if (view === void 0) {
		view = buildTeamProjection(state);
		byTasks.set(state.tasks, view);
	}
	return view;
}
/** Team projection selected by the projected Session identity; the wire view carries durable roster and task state only. */
const teamProjectionDefinition = {
	key: "agentTeam",
	stateVersion: 4,
	stateSchema: teamProjectionEntrySchema,
	init: (header) => emptyTeamState(header.id),
	apply: applyProjectionEvent,
	wire: {
		viewSchema: teamProjectionSchema,
		view: teamProjectionView
	}
};
//#endregion
//#region lib/types/invariant.js
/** Agent Teams runtime invariant companion. */
const PACKAGE_NAME = "@deepseek-ai/dsh-experimental-agent-team";
/** Cordis companion plugin name. */
const name = "team-invariant";
/** Invariant registry required by the companion. */
const inject = ["invariants"];
/** Validate candidate Team events against the projected committed prefix; `apply` never mutates the committed state. */
const install = Object.assign((ctx, fail) => {
	ctx.on("internal/dispatch", (_mode, eventName, args) => {
		if (eventName !== "session/event") return;
		const [session, event] = args;
		/* v8 ignore next -- non-Team Session events have no Agent Teams invariant. */
		if (!isTeamEvent(event)) return;
		const state = ctx.sessionProjections.stateOf(session, "agentTeam");
		const candidate = teamProjectionDefinition.apply(state, event);
		if (candidate.failure !== void 0) fail(`session event ${event.seq} violates the Agent Teams stream: ${candidate.failure}`);
	}, { global: true });
}, { inject: ["sessionProjections"] });
/** Register the package invariant companion. */
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
