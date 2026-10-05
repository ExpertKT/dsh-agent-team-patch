// 离线证明（团队休息 / resting 相位）：
//  * active -> resting 与 resting -> active 是合法转换，别的来源不合法；
//  * 休息中的队友不可寻址（resolveActiveMember 抛 TEAM_MEMBER_RESTING），所以 send_message
//    这一类"从消息开始一轮"的入口天然被拦；
//  * 休息的队友仍占名字、仍占席位（不会被别人顶掉，也不会被投影藏起来）；
//  * TeamRoster.rest()/wake() 真的翻相位，并打断在跑的 turn。
// 事件形状沿用 F:\dsh-team\checks\reuse-check.mjs：apply 不抛，失败写进 state.failure。
import { pathToFileURL } from 'node:url';

const APP_ROOT = process.env.DSH_APP_ROOT ?? 'F:/DSHDesktop/DSH Desktop/resources/app';
const base = pathToFileURL(`${APP_ROOT}/node_modules/@deepseek-ai/dsh-experimental-agent-team/lib/types/`).href;
const { teamProjectionDefinition, teamProjectionView } = await import(`${base}projection.js`);
const { resolveActiveMember, TeamRoster } = await import(`${base}roster.js`);

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

// ── 1. 休息 / 开工 的转换合法，日志重放无 failure
const slept = feed(teamProjectionDefinition.init({ id: 'root' }), [
  ev(member('a1', 'bond-luna', 'provisioning')),
  ev(member('a1', 'bond-luna', 'active')),
  ev(member('a1', 'bond-luna', 'resting')),
]);
ok('active -> resting 合法', slept.failure === undefined, slept.failure ?? '接受');
const woke = feed(slept, [ev(member('a1', 'bond-luna', 'active'))]);
ok('resting -> active 合法（开工）', woke.failure === undefined, woke.failure ?? '接受');

// ── 2. 不合法的转换必须被拒
const fromProvisioning = feed(teamProjectionDefinition.init({ id: 'root' }), [
  ev(member('b1', 'qc-luna', 'provisioning')),
  ev(member('b1', 'qc-luna', 'resting')),
]);
ok('provisioning -> resting 被拒', typeof fromProvisioning.failure === 'string' && fromProvisioning.failure.includes('invalid'), fromProvisioning.failure ?? '（没有 failure！）');
const fromRetired = feed(teamProjectionDefinition.init({ id: 'root' }), [
  ev(member('c1', 'ui-luna', 'provisioning')),
  ev(member('c1', 'ui-luna', 'active')),
  ev(member('c1', 'ui-luna', 'retired')),
  ev(member('c1', 'ui-luna', 'resting')),
]);
ok('retired -> resting 被拒', typeof fromRetired.failure === 'string' && fromRetired.failure.includes('invalid'), fromRetired.failure ?? '（没有 failure！）');

// ── 3. 休息中的队友不可寻址（＝消息进不来），错误码要说得清
let restLookup;
try {
  restLookup = resolveActiveMember({ id: 'root' }, slept, 'bond-luna');
} catch (e) {
  restLookup = 'THREW: ' + e.code;
}
ok('休息中的队友不可寻址', restLookup === 'THREW: TEAM_MEMBER_RESTING', String(restLookup));

// ── 4. 休息的人仍占名字、占席位，且投影里看得见（状态就是 resting）
const takenWhileResting = feed(slept, [ev(member('d1', 'bond-luna', 'provisioning'))]);
ok('休息中的名字不能被别人顶掉', typeof takenWhileResting.failure === 'string' && takenWhileResting.failure.includes('reused'), takenWhileResting.failure ?? '（没有 failure！）');
const view = teamProjectionView(slept);
const rested = view.members.find(m => m.name === 'bond-luna');
ok('投影里休息成员还在（phase=resting，没被藏起来）', rested !== undefined && rested.phase === 'resting', JSON.stringify(rested));

// ── 5. rest()/wake() 真翻相位，并打断在跑的 turn
const LEAD_ID = 'session-rest-check-lead';
const leadAgent = { id: LEAD_ID, session: { header: {}, snapshotEvents: () => [] }, options: {}, status: undefined };
const liveChild = { id: uuid('e1'), options: {} };
const teamState = { members: [member('e1', 'foreman', 'active'), member('e2', 'baren-luna', 'active')], tasks: [] };
const interrupted = [];
const journal = {
  state: () => teamState,
  appendAndFlush: async (_root, _type, data) => {
    teamState.members = teamState.members.map(m => (m.id === data.member.id ? data.member : m));
  },
};
const rosterCtx = {
  agents: { get: id => (id === LEAD_ID ? leadAgent : id === liveChild.id ? liveChild : undefined), list: () => [] },
  sessions: { get: () => undefined },
  sessionProjections: { stateOf: (s, key) => (s === leadAgent.session && key === 'agentTeam' ? teamState : undefined) },
  subagents: { interrupt: id => interrupted.push(id) },
};
const roster = new TeamRoster(rosterCtx, journal, {}, 16);
const restResult = await roster.rest(leadAgent);
ok('rest() 报出被按下去的人', Array.isArray(restResult.resting) && restResult.resting.length === 2, JSON.stringify(restResult));
ok('rest() 后两个成员都是 resting', teamState.members.every(m => m.phase === 'resting'), teamState.members.map(m => `${m.name}:${m.phase}`).join(','));
ok('rest() 打断了在跑的那一轮', interrupted.length === 1 && interrupted[0] === liveChild.id, JSON.stringify(interrupted));
const rows = roster.list(roster.membership(leadAgent));
const foremanRow = rows.find(r => r.name === 'foreman');
ok('面板看到的成员状态是 resting（listMembers 口径）', foremanRow !== undefined && foremanRow.status === 'resting', JSON.stringify(foremanRow));
const wakeResult = await roster.wake(leadAgent);
ok('wake() 报出被叫醒的人', Array.isArray(wakeResult.woken) && wakeResult.woken.length === 2, JSON.stringify(wakeResult));
ok('wake() 后回到 active', teamState.members.every(m => m.phase === 'active'), teamState.members.map(m => `${m.name}:${m.phase}`).join(','));
ok('休息后再派活不会再打断（没有在跑的）', interrupted.length === 1, JSON.stringify(interrupted));

console.log(`\n${failures === 0 ? 'REST-CHECK OK' : 'REST-CHECK FAILED'}（失败 ${failures} 项）`);
process.exit(failures === 0 ? 0 : 1);
