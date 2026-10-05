// 最小可运行检查：退休态能否被 durable 状态机接受、是否从投影消失、非法转换是否仍被拒
// 安装根默认取本机 DSH 桌面版资源目录；换成别的机器/别的版本时设 DSH_APP_ROOT 即可。
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export const APP_ROOT = process.env.DSH_APP_ROOT ?? 'F:/DSHDesktop/DSH Desktop/resources/app';
export const pkgUrl = (rel) => pathToFileURL(`${APP_ROOT}/node_modules/@deepseek-ai/${rel}`).href;

const { teamProjectionDefinition: def } = await import(pkgUrl('dsh-experimental-agent-team/lib/types/projection.js'));

const row = (phase, id = 'sess-ui', name = 'ui') => ({ id, name, description: 'd', provider: 'spawn', context: 'fresh', phase });
const ev = (teamId, member) => ({ type: 'team/member', data: { version: 2, teamId, member } });
const fresh = (teamId) => def.init({ id: teamId });

// 1. 正常路径：provisioning -> active -> retired
let s = fresh('root-1');
s = def.apply(s, ev('root-1', row('provisioning')));
s = def.apply(s, ev('root-1', row('active')));
assert.equal(s.members[0].phase, 'active');
assert.equal(s.failure, undefined);
s = def.apply(s, ev('root-1', row('retired')));
assert.equal(s.failure, undefined, 'retired 转换被拒: ' + s.failure);
assert.equal(s.members[0].phase, 'retired');

// 2. 退休成员从客户端投影里消失（只剩 lead）
const view = def.wire.view(s);
assert.deepEqual(view.members, [{ id: 'root-1', name: 'lead', role: 'lead', phase: 'active' }]);

// 3. 非法转换仍然被拒：active -> provisioning
let bad = fresh('root-2');
bad = def.apply(bad, ev('root-2', row('provisioning')));
bad = def.apply(bad, ev('root-2', row('active')));
bad = def.apply(bad, ev('root-2', row('provisioning')));
assert.equal(typeof bad.failure, 'string', 'active -> provisioning 竟然被接受了');

// 4. 退休是终态：retired -> active 被拒
let back = fresh('root-3');
back = def.apply(back, ev('root-3', row('provisioning')));
back = def.apply(back, ev('root-3', row('active')));
back = def.apply(back, ev('root-3', row('retired')));
back = def.apply(back, ev('root-3', row('active')));
assert.equal(typeof back.failure, 'string', 'retired -> active 竟然被接受了');

// 5. provisioning -> retired 被拒（只允许 active|failed -> retired）
let early = fresh('root-4');
early = def.apply(early, ev('root-4', row('provisioning')));
early = def.apply(early, ev('root-4', row('retired')));
assert.equal(typeof early.failure, 'string', 'provisioning -> retired 竟然被接受了');

console.log('RETIRE-CHECK OK: retired 可写入、投影隐藏、三条非法转换仍被拒');
