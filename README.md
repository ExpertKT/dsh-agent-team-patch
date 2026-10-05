# DSH Agent Teams 补丁：退休队友 + 每成员模型选择 + 团队面板

给 DSH 的 Agent Teams 加三样东西：

1. **退休（retire）状态** —— 老队友退场后不再占席位、不再占名字、从客户端投影里消失，但 durable 名册、任务归属、消息历史都保留；
2. **每成员模型选择** —— 面板上每个队友一行模型下拉，创建新队友时可以指定模型（`provider/model`），选择最终落到该队友会话的模型路由上；
3. **会话标题栏的团队面板** —— 名册（状态点、当前模型、退休按钮）、任务板、加人表单（名字 / 任务 / 模型 / `--fork`）。

顺带修了两个客户端真机故障（都是错误边界先把它变可见、再定位的）：模型下拉为空（读 `ctx.remote.session` 在未声明 dotted inject token 时抛错、被兜底吞掉）、**新建队友后面板整个消失**（新队友的 `modelSelection.next` 是 `null`，读数时抛 `Cannot read properties of null (reading 'provider')`）。

本仓库同时是一份**可复现的修补包**：`patches/` 是能直接喂给上游的 unified diff，`apply.mjs` 是幂等的安装器（7 个文件 / 3 个包），`checks/` 是 6 个可离线跑的最小验证脚本，`tools/` 负责重生成补丁集与「未打补丁」的验证根目录。

> 真机环境：DSH 桌面版 `resources/app`（`dsh-plugin-desktop` 2.0.17），`@deepseek-ai/*` 全部 `0.2.0-rc.2`，Windows 11，Node `v24.20.0`。
> **这是对发行代码（`node_modules`）的热补丁，DSH 一升级就失效。** 正确的修法在上游，见 [`ISSUE.md`](ISSUE.md)。

---

## 1. 问题

团队满员后 `spawn_teammate` 直接失败：

```
Error: Team member limit 8 reached
```

名册里**没有「移除」这个状态** —— `stopTeammates` 只停运行时、不改名册。任何待过的队友都永久占着一个席位和一个名字，哪怕它早就停手、任务早已交接。同时队友名字被永久占用（`teammate name "..." was already used in this Team`），而且一旦允许同名，durable 日志重放又会直接抛 `teammate name "..." is reused by another member`。

补丁引入的终态 `retired` 解决的正是这两件事：**席位是配额，不是历史成员个数；名字唯一性只在在役范围内成立。**

## 2. 改了什么

| 包 | 文件 | 改动 |
|---|---|---|
| `@deepseek-ai/dsh-experimental-agent-team` | `lib/index.js` | 相位枚举加 `retired`；转换守卫 `active\|failed → retired`；席位判据只数非 retired；名字守卫/重放不变量忽略 retired；名册遍历跳过 retired；新增 Lead-only `retire()`；façade `retireTeammate()`；`spawnAdmitted` 转发 `request.agentOptions`（选模型用） |
| 同上（发行包里无 importer 的同源拷贝，为语义一致一起改） | `lib/invariant.js`、`lib/types/index.js`、`lib/types/projection.js`、`lib/types/roster.js` | 同样的枚举/守卫/投影过滤 + `resolveActiveMember` 只解析在役成员 |
| `@deepseek-ai/dsh-experimental-tool-agent-team` | `lib/index.js` | 注册 Lead-only 工具 `retire_teammate`；system prompt 的 POLICY 文案补退休语义；`spawn_teammate` 加可选 `model`（`provider/model` → `agentOptions`）；新增 `/team` 斜杠命令（`list \| retire <name> \| add <name> [--fork] [--model p/m] -- <prompt>`，`--` 之后的原文照传给任务提示） |
| `@deepseek-ai/dsh-experimental-client-ui-agent-team` | `lib/client.js` | 新增会话标题栏团队面板（名册 / 任务卡 / 加人表单 / 每成员模型下拉 / 退休按钮）；用 `ctx.get("remote.<ns>")` 取 Remote 命名空间（**不**声明 dotted inject token）；面板外包错误边界；文案注册与挂载标记全部容错 |

补丁规模：`patches/` 三个文件（agent-team 379 行、client-ui-agent-team 507 行、tool-agent-team 219 行 diff）。逐行位置见 `patches/*.patch` 与 [`HANDOFF.md`](HANDOFF.md) 第 3 节。

设计约束（踩过的坑，写进任何后续改动）：**往 DSH durable 事件里写对象，绝不能带值为 `undefined` 的键。** 第一次实调 `retire_teammate` 时事件里带了 `{ error: undefined }`，`dsh-session` 的 `snapshotJsonValue` 闸门直接拒收，报 `session event "team/member" carries non-JSON-serializable data`，且不指名是哪个字段。

## 3. 快速开始

```powershell
cd F:\dsh-team

node apply.mjs --check      # 只看状态，不写盘；7 个文件全打上**且 profile 已接线**才 exit 0
node apply.mjs              # 应用：写 7 个文件 + 把团队 bundle 加进 profile（都幂等）
node apply.mjs --revert     # 从 .dsh-retire.bak / profile 备份还原
node apply.mjs --root "D:\path\to\DSH Desktop\resources\app" `
               --dsh-home "D:\dsh-home" --profile "D:\dsh-home\profiles\web"

# 7 个离线检查（都接受 DSH_APP_ROOT 覆盖根目录，默认 F:/DSHDesktop/DSH Desktop/resources/app）
node checks\retire-check.mjs
node checks\retire-event-check.mjs
node checks\reuse-check.mjs
node checks\team-command-check.mjs
node checks\team-ui-check.mjs
node checks\remote-namespace-check.mjs
node checks\profile-wiring-check.mjs
```

`apply.mjs` 除文件外还会做一件事：确认 `<profile>/package.json` 的 `dsh.profile.bundles` 里有 `@deepseek-ai/dsh-experimental-agent-team-profile`，没有就加上（留 `package.json.dsh-team.bak`，`--revert` 还原）。**没有这一行，组合里根本没有 Agent Teams，补丁打上了也不会加载** —— 这是我们真踩过的坑。

**装完必须重启 DSH**：服务端插件没有热重载（客户端插件在 `pnpm run dev:web` 跑着时可以热重载，服务端不行）。不重启会看到「补丁明明打上了却报 tool not found」。

`apply.mjs` 在动任何字节之前先做两道闸门，任一不满足就拒绝并 `exit 2`：

1. **版本闸门** —— 目标包的 `package.json` 版本必须是 `0.2.0-rc.2`（补丁就是对这个版本做的）；
2. **哈希闸门** —— 每个目标文件必须**要么**等于 pristine 哈希（可打）**要么**等于 patched 哈希（已打过，幂等跳过）；两者都不是（drift，比如被 DSH 升级或第三方改过）就拒绝覆盖。

改动前会留 `*.dsh-retire.bak`，`--revert` 靠它还原；`--check` 适合放进你的「DSH 升级后自检」流程。

## 4. 目录

| 路径 | 作用 |
|---|---|
| `apply.mjs` | 幂等安装/卸载器（版本 + sha256 双闸门，带 backup）；`--check` 可当升级后自检 |
| `manifest.json` | 每个文件的 pristine / patched sha256；`apply.mjs` 的唯一依据（7 条） |
| `patched/` | 补丁后的字节快照（7 个文件），`apply.mjs` 拷贝的源 |
| `patches/*.patch` | unified diff（**不含** `package.json`），给上游 / 人看 |
| `baseline/` | 只放**不能从 npm 得到**的基线：桌面 app 自带那次构建的 `client.js`（见第 7 节） |
| `checks/*.mjs` | 6 个离线检查；`who-runs-what.mjs` 是机器状态探针 |
| `tools/build-manifest.mjs` | 由 npm pristine tarball + 盘上 app 重生成 `manifest.json` / `patched/` / `patches/` / `baseline/` |
| `tools/build-verify-root.mjs` | 造一个「未打补丁但依赖可解析」的根目录，用于端到端对照实验 |
| `HANDOFF.md` | 原始现场笔记：P1–P10 痛点 + 逐行补丁位置 + 附录 A |
| `ISSUE.md` | 上游 issue 草案（三份） |
| `wip/` | 临时快照，与 `patched/` 重复（已 gitignore） |
| `.cache/` | 构建脚手架：npm pristine tarball、派生基线、验证根目录（已 gitignore） |

`patched/` 与 `patches/` 的一致性不是靠人眼：`patches/` 应用到 npm 上 `0.2.0-rc.2` 的 pristine tarball 后，产出的 6 个文件**逐字节等于**盘上文件（sha256 全等，见下节）。

## 5. 它到底是怎么验证的（硬证据）

以下每条都是本次复核**亲自跑/亲自读**得到的结果，命令原样可复现。

**a. 七个离线检查全绿**

```
$ node checks/retire-check.mjs           → RETIRE-CHECK OK: retired 可写入、投影隐藏、三条非法转换仍被拒            EXIT=0
$ node checks/retire-event-check.mjs     → RETIRE-EVENT-CHECK OK: 事件可序列化 + 状态机接受 + 投影隐藏（旧写法已被证伪）  EXIT=0
$ node checks/reuse-check.mjs            → REUSE-CHECK OK（失败 0 项）  ← 7/7 PASS                              EXIT=0
$ node checks/team-command-check.mjs     → TEAM-COMMAND-CHECK OK（失败 0 项）  ← 37/37 PASS                    EXIT=0
$ node checks/team-ui-check.mjs          → TEAM-UI-CHECK OK（失败 0 项）  ← 含真渲染烟囱，见下                     EXIT=0
$ node checks/remote-namespace-check.mjs → REMOTE-NAMESPACE-CHECK OK                                      EXIT=0
$ node checks/profile-wiring-check.mjs   → PROFILE-WIRING-CHECK OK（失败 0 项）  ← 16/16 PASS                 EXIT=0
```

`reuse-check` 的 7 项：退休后同名重建重放无 failure（5 个事件全接受）；状态里留下两个成员（含退休的 a1）；投影里有新 b1；投影里没有退休 a1；两个在役同名仍被拒（`teammate name "zzz" is reused by another member`）；同名解析到在役的 b1；只剩退休成员时不可寻址（`THREW: TEAM_MEMBER_NOT_FOUND`）。

`team-ui-check` 里有一条**真渲染烟囱**：Node 里没有 `react-dom`（只有 `react`），所以检查用「假 react hooks + 直接调用组件函数」把面板渲染一遍，并断言遍历确实走到了 `TeamMemberRow` 与 `TaskCard`（否则会假绿）。它同时覆盖：**新队友的 `modelSelection.next` 为 `null` 时面板仍要能渲染** —— 修之前它复现真机那条 `TypeError: Cannot read properties of null (reading 'provider')`，修之后全绿。

**b. 补丁可字节复现**

下载 npm 上 `0.2.0-rc.2` 的 pristine tarball → 用 `tools/build-verify-root.mjs` 造一个未打补丁的根目录 → `apply.mjs` 应用 → 与盘上文件比 sha256：**7/7 SAME，0 mismatch**（`apply.mjs --check` 逐文件报 `patched`）。

| 文件（`...\node_modules\@deepseek-ai\`） | 字节 | patched sha256 |
|---|---|---|
| `dsh-experimental-agent-team\lib\index.js` | 74936 | `2f4d5f534ae9bd8d5ef9a6905711e583530c7c4d35a3290a0d627bb4a77586d8` |
| `dsh-experimental-agent-team\lib\invariant.js` | 18504 | `fe223b36a3b9087f3c979018e40406f99aacd85fb214afef190e7549466b30f5` |
| `dsh-experimental-agent-team\lib\types\index.js` | 10067 | `d737e78744fce5a040970f6c4057f1135a99e9c9c11fbefd0d93fbafc6bf8da4` |
| `dsh-experimental-agent-team\lib\types\projection.js` | 14100 | `682fb4f0268e94446c120763a7cd4681c7e10a7a395f3979773a85e62556c6ba` |
| `dsh-experimental-agent-team\lib\types\roster.js` | 22487 | `b42c523afc796fbf3a0a7f610d862c4c50db64f4d404e0500467ee1f2c63bc4c` |
| `dsh-experimental-client-ui-agent-team\lib\client.js` | 37895 | `825313ffa16276e2c84869886cf53f50f0cc669b3ccffb7e672cd888b4f4bbe5` |
| `dsh-experimental-tool-agent-team\lib\index.js` | 25249 | `c8220026830b81b3a611fd38b80512e3e6eead7d6a8b32469a13074a4c8a149e` |

完整哈希（含 pristine）见 [`manifest.json`](manifest.json)。

**c. 因果对照（patch → 检查由红转绿 → revert 转红）**

`tools/build-verify-root.mjs` 造一个「未打补丁但依赖可解析」的根目录：真实 `resources/app/node_modules` 全部 junction 进去，只有 3 个目标包是从 `.cache/pristine`（npm tarball）拷贝的原始文件，其中 `client.js` 用 `baseline/` 里的 app 侧派生基线。然后做对照实验：

| 叠加根状态 | `apply.mjs --check` | 6 个补丁行为检查（`profile-wiring-check` 另有自己的 fixture，见上） |
|---|---|---|
| pristine（未打补丁） | `NOT-PATCHED patched=0 pristine=7 drift=0 missing=0`，EXIT=1 | 5 个 EXIT=1 失败（`retire-check`、`retire-event-check`、`reuse-check`、`team-command-check`、`team-ui-check`）；`remote-namespace-check` EXIT=0（它测 Cordis 语义，与补丁无关） |
| `node apply.mjs --root <叠加根>` | `APPLIED 7 个文件`，随后 `--check` = `PATCHED patched=7`，EXIT=0 | **6 个全 EXIT=0 OK** |
| `node apply.mjs --root <叠加根> --revert` | 回到 `NOT-PATCHED patched=0 pristine=7`，EXIT=1 | `reuse-check` 又 EXIT=1 |

原始日志留在 `.cache/verify-logs/{pristine,patched}-<check>.log`。这一组同时证明了两件事：**是补丁本身（不是这台机器的偶然状态）让检查通过**，以及 **`patched/` 的字节可以从公开 npm tarball 精确复现**。

**d. 闸门本身被测过**

- 在 pristine 叠加根上 `--check` → `NOT-PATCHED patched=0 pristine=6`，EXIT=1；`apply` 后 → `PATCHED patched=6`，EXIT=0；再 `apply` → `ALREADY-APPLIED`，未写盘。
- 人为改一个目标文件 → `apply` 拒绝：`[FAIL] 有 1 个文件既不是原始版本、也不是打过补丁的版本`，EXIT=2。
- 人为把某包版本改成 `9.9.9` → `[FAIL] 1 个包版本不符，补丁是按 0.2.0-rc.2 做的`，EXIT=2。

**e. 关键代码逐行读过**（不是转述）

`dsh-experimental-agent-team\lib\index.js`：

```js
:596  if (state.members.filter((member) => member.phase !== "retired").length >= this.maxMembers)
        throw new TeamError(`Team member limit ${this.maxMembers} reached`, "TEAM_MEMBER_LIMIT");
:595  if (state.members.some((member) => member.name === name && member.phase !== "retired"))
        throw new TeamError(`teammate name "${name}" was already used in this Team`, "TEAM_MEMBER_NAME_TAKEN");
:1330 const named = state.members.find((c) => c.name === member.name && c.phase !== "retired");
      if (named !== void 0 && named.id !== member.id)
        throw new Error(`teammate name "${member.name}" is reused by another member`);
:1336 const settles = prior.phase === "provisioning" && (member.phase === "active" || member.phase === "failed");
      const retires = member.phase === "retired" && (prior.phase === "active" || prior.phase === "failed");
      if (!settles && !retires) throw new Error(...);
:526  async retire(caller, targetName) // Lead-only；拒 self-retire；append {version:2, teamId, member:{...prior, phase:"retired"}}（无 error 键）
:1708 const DEFAULT_MAX_MEMBERS = 16;
```

`dsh-session\lib\types\index.js:573-575`（durable 事件闸门）：

```js
const dataSnapshot = snapshotJsonValue(data);
if (dataSnapshot === undefined) throw new Error(`session event "${type}" carries non-JSON-serializable data`);
```

`dsh-experimental-tool-agent-team\lib\index.js`：`:35-71` `MEMBER_VIEW_SCHEMA.status` 枚举是 `["running","inactive","provisioning","failed"]`（**没有 `retired`**）；`:242-266` `spawn_teammate` 参数只有 `name`/`description`/`prompt`/`context`；`:367-376` 注册 Lead-only `retire_teammate`。

## 6. 证据分级：哪些是硬证据，哪些只是推断

接手时最值钱的一栏。**上节 a–e 是硬证据。下面是本会话没有独立坐实的部分** —— 它们写在下游文档里，但请当成「待验证」对待。

| 结论 | 状态 | 说明 |
|---|---|---|
| 退休后不占席位、不占名字、投影隐藏、非法转换仍被拒 | ✅ 硬证据（离线） | 三个 check + 上面的因果对照 |
| **退休能力的真机端到端**（满员 → 退休 → 新 spawn 成功） | ⚠️ 用户自述 | `HANDOFF.md` P1 记「连续退休 5 个成员、第 4 个席位 spawn 成功」。本会话**没有重跑真机**：需要重启 DSH + 造一个满员团队 |
| **名字复用的真机验证** | ⚠️ 未验证 | `HANDOFF.md` 自己也标了「真机尚未重启验证」。本会话只做到离线 7/7 |
| 「子会话模型跟创建者、不跟 profile 的 `agent-default-model`」 | ⚠️ 非受控观测 | 来自 `who-runs-what.mjs` 的历史输出；本会话**没跑**该脚本（它是机器状态探针，不是补丁检查）。`HANDOFF.md` P7 自己承认这是非受控的，建议做一次受控实验 |
| P6「provider 的 `models:` 是整体替换」 | ⚠️ 配置证据 + 用户自述 | 本会话确认了 `cordis.patch.yml` 里确实列着 12 个模型；「不列全其余就消失」的行为未实测 |
| P4「客户端对未知状态静默空白」 | ⚠️ 代码证据，未见 UI | 读到了 `client.js:64-78` 对未知 status 返回 `undefined`；实际 UI 表现未观测 |
| P8「`list_agents` 对 inactive 成员回退成 Lead 的模型」 | ⚠️ 代码证据 | 读到了 `lib/index.js:436-464` 的 `live?.options.model ?? root.options.model`；未真机对照 |
| P9「服务端改动必须重启」 | ⚠️ 用户自述 | 本会话未重启 DSH，未验证 |
| 附录 A（`start-shudong.ps1`）全部结论 | ⚠️ 本会话未复核 | 与团队状态机无关，原样保留 |

### 一处对 `HANDOFF.md` 的更正（硬证据）

`HANDOFF.md` P1/P10 写「队友上限 `maxMembers = 8`，证据 `agent-team\lib\index.js:596`」。**半对。** `:596` 确实是席位判据，但**代码默认值是 16**：

```
dsh-experimental-agent-team\lib\index.js:1708   const DEFAULT_MAX_MEMBERS = 16;
dsh-experimental-agent-team\lib\types\index.js:15  同上
```

生效的 `8` 来自 **profile 接线层**：

```yaml
# ...\dsh-experimental-agent-team-profile\cordis.patch.yml:20
maxMembers: 8
```

也就是说 **`8` 属于 profile wiring，不属于状态机**。上游若要改配额语义，改的是状态机判据；若要改这个部署的数字，改的是 profile。两者别混。

## 7. 已知限制与风险

- **热补丁会被 DSH 升级覆盖。** 升级后 `apply.mjs --check` 会因版本/哈希闸门而 `exit 1`，不会静默出错。届时按第 9 节重新生成。
- **必须重启 DSH**（服务端插件没有热重载）；客户端插件改完至少整页刷新（`Ctrl+F5`），否则看到的还是旧 bundle。
- **`--revert` 依赖 `.dsh-retire.bak`。** 没有 backup 时无法还原（manifest 里的 pristine 哈希只能用来**验证**还原结果，不含原始内容）。
- **`client.js` 的 pristine 哈希是「派生基线」**：桌面 app 自带的是**另一次构建**的浏览器 bundle，它的生成型 CSS 脚手架（builder 路径注释、CSS-module 类名前缀、整块 `TeamAction_module_css_default`）与 npm 上发布的 CI 构建不同。`tools/build-manifest.mjs` 只把这几段生成型内容换成 app 的写法、其余取 npm 字节，产物放在 `baseline/`。因此：**如果目标机器的 app 构建在这几段之外还有差异**，`apply.mjs` 会判成 `drift` 并拒绝 —— 这是对的，别用 `--force` 蒙过去。
- 上了 `retired` 之后，客户端**完全看不到**退休成员（服务端投影过滤）。这是本补丁有意选的兜底：`client.js` 对未知 status 返回 `undefined`，直接把 `retired` 透到前端只会得到一行空白。代价是「历史成员」在 UI 上不可见。
- **`lib/types/*.js` 与 `lib/invariant.js` 在本机没有任何 importer**（发行包只跑 bundled `lib/index.js`），补丁改它们只为语义一致；但它们**确实**在 `package.json` 的 `exports` 里（`./invariant`），外部消费者仍可能 import。改的时候要一起改，别只改 bundle。
- **模型下拉的选项来自 host 报上来的模型目录**（`remote.session.modelCatalog()`）：能不能选到某个模型取决于那台机器自己的 provider 配置（本机是 profile 的 `cordis.patch.yml` → `llm-pi-ai.providers`）。面板不做白名单、也不知道有哪些 provider。
- 面板的**创建表单**只把这些交给 `/team add`：名字、任务、`--fork`、`--model provider/model`；任务文本从第一个独立 `--` 之后原文照传。
- `checks/team-ui-check.mjs` 用「假 react hooks + 直接调用组件函数」渲染，**不是**真 React 渲染：它能抓渲染期抛错，抓不到 DOM/样式问题。
- 队友在会话树里就是 Lead 的 continuable 子会话（上游设计，本补丁没改），所以 DSH 的**会话列表里它看起来像子智能体**；把它和普通子智能体区分开的**唯一界面是团队面板**。

## 8. 在别人的机器上应用（贴给 agent 就行）

把本仓库地址丢给你的 agent，让它做两件事：

```powershell
node apply.mjs --check     # 先自检：会报 PATCHED/NOT-PATCHED 和 WIRED/NOT-WIRED
node apply.mjs             # 装：7 个文件 + profile 接线（都不静默覆盖，都会留备份）
# 然后完全退出 DSH 再打开（服务端插件没有热重载；客户端插件至少 Ctrl+F5）
```

**门槛只有三条，任何一条不满足都会明确拒绝而不是猜：**

| 门槛 | 谁在把关 | 不满足时的表现 |
|---|---|---|
| 三个包必须是 `0.2.0-rc.2` | `apply.mjs` 读每个包的 `package.json` | `[FAIL] N 个包版本不符`，exit 2，不写盘 |
| 目标文件必须是**这份构建**的原始字节 | `apply.mjs` 拿 sha256 对 `manifest.json` | 逐文件报 `drift`：`--check` exit 1、`apply` 拒绝并 exit 2（升级过、或不是同一个 app 构建，就按第 9 节重新生成） |
| profile 必须能定位到 | `--dsh-home` / `--profile`，否则读 `$DSH_HOME` / `$DSH_PROFILE` | 报 `profile (unresolved …)`，跳过接线 —— 这时团队不会出现在组合里，补一条参数再来一次即可 |

前两条是「这份补丁不适用」的硬信号；第三条只是路径提示。装完之后，**能不能选到某个模型取决于那台机器自己的 provider 配置**（面板照 host 报上来的模型目录列，不做白名单）。

`apply.mjs` 的四种文件状态：`pristine` = 可打；`patched` = 已打过（幂等跳过）；`drift`/`missing` = 停下人工核对。

## 9. 怎么重新生成这个补丁（升级 DSH 后）

```powershell
cd F:\dsh-team
$v = '0.2.0-rc.2'   # 换成新版本

# 1) 拉三个包的 pristine tarball，解到 .cache\pristine\<pkg>\package\
foreach ($p in 'dsh-experimental-agent-team','dsh-experimental-tool-agent-team','dsh-experimental-client-ui-agent-team') {
  Invoke-WebRequest "https://registry.npmjs.org/@deepseek-ai/$p/-/$p-$v.tgz" -OutFile ".cache\$p.tgz"
  New-Item -ItemType Directory ".cache\pristine\$p" -Force | Out-Null
  tar -xzf ".cache\$p.tgz" -C ".cache\pristine\$p"
}

# 2) 从「盘上改好的 app」重生成 manifest / patched / baseline / patches
node tools\build-manifest.mjs          # 先看报告：应当只有 7 个文件、package.json 被跳过
node tools\build-manifest.mjs --write

# 3) 拿一个未打补丁的根目录做端到端对照
node tools\build-verify-root.mjs
node apply.mjs --root .cache\verify --check     # 期望 NOT-PATCHED pristine=7，exit 1
node apply.mjs --root .cache\verify             # 期望 APPLIED 7
$env:DSH_APP_ROOT = "$PWD\.cache\verify"
foreach ($c in Get-ChildItem checks\*.mjs) { node $c.FullName }
Remove-Item Env:\DSH_APP_ROOT
node apply.mjs --root .cache\verify --revert    # 回到 pristine
```

`tools/build-manifest.mjs` 自动处理两件容易错的事：`package.json` 只差依赖键顺序（跳过、不进 manifest），以及 `client.js` 的生成型 CSS 脚手架差异（派生基线写进 `baseline/`）。`patches/*.patch` 用 `git diff --no-index` 生成并强制 `core.autocrlf=false`，否则会被行尾转换污染。
