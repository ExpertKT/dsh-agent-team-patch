// 离线证明（退休 + 名字复用）：
//  * 退休成员的名字可以被重新使用，且整条日志重放不会抛；
//  * 投影里只留新的那个（退休的藏起来）；
//  * 老规矩仍在：两个在役成员同名必须失败；只剩退休成员时不可寻址。
// 事件形状来自 lib/types/projection.js:157-175（applyProjectionEvent 先做 selector 校验，
// 失败不抛、而是写进 state.failure），所以断言看 state.failure，不看 try/catch。
import { pathToFileURL } from 'node:url';

// 安装根默认取本机 DSH 桌面版资源目录；换成别的机器/别的版本时设 DSH_APP_ROOT 即可。
const APP_ROOT = process.env.DSH_APP_ROOT ?? 'F:/DSHDesktop/DSH Desktop/resources/app';
const base = pathToFileURL(`${APP_ROOT}/node_modules/@deepseek-ai/dsh-experimental-agent-team/lib/types/`).href;
const { teamProjectionDefinition, teamProjectionView } = await import(`${base}projection.js`);
const { resolveActiveMember } = await import(`${base}roster.js`);

let failures = 0;
const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!cond) failures++;
};
const uuid = tail => `00000000-0000-4000-8000-0000000000${tail}`;
const member = (tail, name, phase) => ({
  id: uuid(tail), name, description: name + ' desc', provider: 'spawn', context: 'fresh', phase,
});
const ev = m => ({ type: 'team/member', data: { version: 2, teamId: 'root', member: m } });
const feed = (state, events) => events.reduce((s, e) => teamProjectionDefinition.apply(s, e), state);

// ── 1. 退休后同名重建：整条日志重放必须无 failure
const rebuilt = feed(teamProjectionDefinition.init({ id: 'root' }), [
  ev(member('a1', 'ui-luna', 'provisioning')),
  ev(member('a1', 'ui-luna', 'active')),
  ev(member('a1', 'ui-luna', 'retired')),
  ev(member('b1', 'ui-luna', 'provisioning')),
  ev(member('b1', 'ui-luna', 'active')),
]);
ok('退休后同名重建，日志重放无 failure', rebuilt.failure === undefined, rebuilt.failure ?? '5 个事件全部接受');
ok('状态里确实留下两个成员（含退休的 a1）', rebuilt.members.length === 2, `members=${rebuilt.members.length}`);

// ── 2. 投影：只留新的，退休的藏起来
const view = teamProjectionView(rebuilt);
const names = view.members.map(m => `${m.name}#${m.id.slice(-2)}`).join(',');
ok('投影里有新成员 b1', view.members.some(m => m.id === uuid('b1')));
ok('投影里没有退休成员 a1（只有 lead + b1）', view.members.length === 2 && !view.members.some(m => m.id === uuid('a1')), names);

// ── 3. 老规矩还在：两个在役成员同名必须失败
const dup = feed(teamProjectionDefinition.init({ id: 'root' }), [
  ev(member('c1', 'zzz', 'provisioning')),
  ev(member('d1', 'zzz', 'provisioning')),
]);
ok('两个在役成员同名仍被拒', typeof dup.failure === 'string' && dup.failure.includes('reused'), dup.failure ?? '（没有 failure！）');

// ── 4. 名字解析：同名时指向在役的那个；只剩退休成员时不可寻址
let resolved;
try {
  resolved = resolveActiveMember({ id: 'root' }, rebuilt, 'ui-luna');
} catch (e) {
  resolved = 'THREW: ' + e.message;
}
ok('同名时解析到在役的 b1', resolved && resolved.id === uuid('b1'), JSON.stringify(resolved));

let onlyRetired;
try {
  onlyRetired = resolveActiveMember({ id: 'root' }, { members: [member('a1', 'ui-luna', 'retired')], tasks: [] }, 'ui-luna');
} catch (e) {
  onlyRetired = 'THREW: ' + e.code;
}
ok('只剩退休成员时不可寻址', typeof onlyRetired === 'string' && onlyRetired.startsWith('THREW'), String(onlyRetired));

// ── 5. 回归：Lead 的 Agent 被闲置回收后，队友仍属于本队（曾静默变成"自己的空队"）
// 现场：队友 foreman（5c102838…）在 Lead 会话空闲时调 team_task_list 得到 {"tasks":[]}，
// 而真 Lead 的投影里有 46 条任务 —— 因为 tryMembership 找不到活跃的 Lead agent 就把它
// 当成"自己的 Lead"。修法：回退到 Lead 的 Session（ctx.sessions.get），Team 状态就投影在它上面。
const { TeamRoster } = await import(`${base}roster.js`);
const LEAD_ID = 'session-5d6b7461-9ddc-4558-8634-d98d2c40b78e';
const leadSession = { id: LEAD_ID };
const teamState = {
  members: [member('c9', 'foreman', 'active')],
  tasks: [{ id: 't1', status: 'pending' }],
};
const childAgent = {
  id: uuid('c9'),
  session: { header: { parentSession: LEAD_ID }, snapshotEvents: () => [] },
};
const rosterCtx = {
  agents: { get: (id) => (id === childAgent.id ? childAgent : undefined) }, // Lead 的 agent 不活跃
  sessions: { get: (id) => (id === LEAD_ID ? leadSession : undefined) },
  sessionProjections: { stateOf: (s, key) => (s === leadSession && key === 'agentTeam' ? teamState : undefined) },
};
const roster = new TeamRoster(rosterCtx, { state: (root) => rosterCtx.sessionProjections.stateOf(root.session, 'agentTeam') }, {}, 16);
let membership;
try {
  membership = roster.tryMembership(childAgent);
} catch (e) {
  membership = 'THREW: ' + e.message;
}
ok('Lead agent 不活跃时，队友仍解析到本队（不再变成自己的空队）', membership !== undefined && membership.role === 'teammate' && membership.root.id === LEAD_ID, JSON.stringify(membership));
ok('该队友仍能读到本队任务板', membership !== undefined && membership.root !== childAgent && (rosterCtx.sessionProjections.stateOf(membership.root.session, 'agentTeam').tasks ?? []).length === 1);

console.log(`\n${failures === 0 ? 'REUSE-CHECK OK' : 'REUSE-CHECK FAILED'}（失败 ${failures} 项）`);
process.exit(failures === 0 ? 0 : 1);
