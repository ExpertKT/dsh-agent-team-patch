// 复现 retire() 真正写进日志的那个事件：先过一遍 session 的「无损 JSON」闸门，再过一遍 durable 状态机
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const APP_ROOT = process.env.DSH_APP_ROOT ?? 'F:/DSHDesktop/DSH Desktop/resources/app';
const pkgUrl = (rel) => pathToFileURL(`${APP_ROOT}/node_modules/@deepseek-ai/${rel}`).href;

const { snapshotJsonValue } = await import(pkgUrl('dsh-util-values/lib/index.js'));
const { teamProjectionDefinition: def } = await import(pkgUrl('dsh-experimental-agent-team/lib/types/projection.js'));

const TEAM = 'root-1';
const prior = { id: 'sess-ui', name: 'ui', description: '前端', provider: 'spawn', context: 'fresh', phase: 'active' };
const event = (member) => ({ version: 2, teamId: TEAM, member });
const ev = (member, teamId = TEAM) => ({ type: 'team/member', data: event(member) });

// 1. 老写法（带 error: undefined）必须被拒 —— 这就是刚才真实失败的原因
assert.equal(snapshotJsonValue(event({ ...prior, phase: 'retired', error: undefined })), undefined, 'undefined 属性竟然被接受了');

// 2. 新写法（不带 undefined）必须过闸门
const clean = event({ ...prior, phase: 'retired' });
const snapshot = snapshotJsonValue(clean);
assert.notEqual(snapshot, undefined, '新写法被拒了');
assert.equal(snapshot.member.phase, 'retired');

// 3. 走一遍 durable 状态机：provisioning -> active -> retired 应被接受，且成员从投影消失
let s = def.init({ id: TEAM });
s = def.apply(s, ev({ ...prior, phase: 'provisioning' }));
s = def.apply(s, ev(prior));
s = def.apply(s, ev(snapshot.member));
assert.equal(s.failure, undefined, '状态机拒绝了退休事件: ' + s.failure);
assert.equal(s.members[0].phase, 'retired');
assert.deepEqual(def.wire.view(s).members, [{ id: TEAM, name: 'lead', role: 'lead', phase: 'active' }]);

console.log('RETIRE-EVENT-CHECK OK: 事件可序列化 + 状态机接受 + 投影隐藏（旧写法已被证伪）');
