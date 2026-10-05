# DSH 智能体团队管理 + 模型随时切换：痛点、补丁与交接

> 交接对象：另一个 DSH 对话（同一个 Lead 会话之外的接手者）。
> 本文件自包含：背景、已验证的事实、已打补丁的逐行位置、复现/验证方法、未完成项与建议。
> 所有事实都标注了证据来源与「已验证 / 未验证」。凡是没验证的，都写明没验证。
> 时间基线：2026-10-05（本机 DSH 桌面版，Windows 11）。
> 交接目录：`F:\dsh-team\`（`HANDOFF.md` + `checks\` 四个可跑的脚本）。

> **状态更新（2026-10-05 16:35，接手会话已经在动手改同一批文件了 —— 读第 3 节 sha 之前先读这里）**
> 两个文件在本文件写下之后被接手方改过，**且还在改**：
> - `dsh-experimental-agent-team\lib\index.js`：74826 B → **74936 B**（16:31），新 sha `2f4d5f534ae9bd8d5ef9a6905711e583530c7c4d35a3290a0d627bb4a77586d8`。
> - `dsh-experimental-tool-agent-team\lib\index.js`：19534 B → 25074 B（16:32）→ **25249 B**（16:35，几分钟内又动了一次）。
> ⇒ **这两个文件的 sha256 不要再当「冻结指纹」用**（其余四个仍是 `16:09` 那版）。要核对请现算，并注意它可能正在被写。
> 我已核（16:35）：**退休 / 名字复用逻辑一行没丢** —— 拿 `F:\dsh-team\.cache\pristine\` 的上游副本逐行对账，`phase === "active"`、`if (member.phase === "retired") continue;`、`async retire()`、`phase: "retired"`、席位判据 `filter(m => m.phase !== "retired")`、`retireTeammate`、tool 包的 `retire_teammate` 全在；`checks\` 三个离线检查仍 EXIT=0。
> 接手方在我上面**加了**：`spawn_teammate({model: "<provider>/<model>"})`（省略则继承 Lead 的路由）与 `/team` 斜杠命令（`list` / `retire <name>` / `add <name> [--fork] [--model <provider>/<model>] -- <prompt>`）⇒ **第 2 节的 P7「队友模型无法指定/事后切换」正在被修掉；读 P7 时以盘上代码为准，别照抄本文的「未修」**。
> 另：`F:\dsh-team\patches\*.patch` 生成于 16:16，**早于**上述两次编辑，可能未含最新的 `--model` 改动 —— 接手方需要自己核。

---

## 0. 给接手对话的起始提示词（直接粘贴）

```
读 F:\dsh-team\HANDOFF.md。这是上个会话对 DSH（F:\DSHDesktop\DSH Desktop\resources\app\）
团队管理能力打的补丁与痛点清单。目标：把它整理成可发表的开源项目（README + 可复现的最小修补 + 上游
issue 草案），不要重打一遍补丁 —— 盘上已经打好了。
先做三件事，只读、不改盘：
 1) 读 HANDOFF.md 第 2、3 节，用 F:\dsh-team\checks\*.mjs 复核补丁（node 直接跑，不许用 pnpm/npx）；
 2) 核对我列的 sha256 与当前文件是否一致，不一致就先停下报告；
 3) 报告：哪些结论有硬证据、哪些只是我的推断。
纪律：改 node_modules 是临时手段，DSH 更新会覆盖；任何"上游正确修法"的建议都要能说清放在哪个包/哪个状态机里。
新增行为要先写一句可观测的完成判据再动手；不许把没跑过的检查写成通过。
```

---

## 1. 环境事实（已验证）

| 项目 | 值 | 证据 |
|---|---|---|
| 安装根 | `F:\DSHDesktop\DSH Desktop\resources\app\` | 桌面版资源目录 |
| 团队真运行时入口 | `...\node_modules\@deepseek-ai\dsh-experimental-agent-team\lib\index.js` | 其 `package.json` 的 `main` / `exports` 指向 `lib/index.js`；`lib\types\*.js`、`lib\invariant.js` 在本机**无任何 importer**（死拷贝，但为了语义一致也一起打了补丁） |
| 工具注册处 | `...\node_modules\@deepseek-ai\dsh-experimental-tool-agent-team\lib\index.js` | 工具 `defineTool`/`register` 全在此 |
| 客户端 UI | `...\node_modules\@deepseek-ai\dsh-experimental-client-ui-agent-team\lib\client.js:64-78` | 对未知 status 返回 `undefined`（不崩，但空白） |
| 队友上限 | `maxMembers = 8` | `agent-team\lib\index.js:596` 的判据 |
| 会话记录（模型硬证据） | `C:\Users\Maverick\.dsh\storages\session_projcache\sessions\*.json` → 字段 `modelSelection.val.lastUsed` | `checks\who-runs-what.mjs` |
| Profile 补丁 | `C:\Users\Maverick\.dsh\profiles\web\cordis.patch.yml` | provider `openai` 的 `models` 列表 |
| 事件日志校验 | `...\node_modules\@deepseek-ai\dsh-session\lib\types\index.js:575` (`snapshotJsonValue`) | 见痛点 P3 |

---

## 2. 痛点清单

每条格式：**现象 → 证据 → 现状 → 建议的上游修法**。

### P1 席位只增不减：没有「退休 / 释放席位」能力
- 现象：团队满 8 人后，任何新 `spawn_teammate` 都失败：`Error: Team member limit 8 reached`。旧成员即使早已停手、任务早已交接，也永远占着席位 —— 因为名单里没有「移除」这个状态，`stopTeammates` 只停运行时、不改名册。
- 证据：`agent-team\lib\index.js:596` 的席位判据原来是 `state.members.length >= this.maxMembers`（含全部历史成员）；实机复现：8 人时 `spawn_teammate` 报上述错误。
- 现状：**已修（真机验证）**。新增成员相位 `retired` + `retire_teammate` 工具；席位判据改成只数非 retired 成员。实机验证：连续退休 5 个成员，每次返回 `{"previousStatus":"inactive"}`，随后第 4 个席位的 `spawn_teammate` 成功。
- 建议上游：把「退休」变成一等公民 —— 名册状态机加终态 `retired`（保留 durable 记录、任务归属、消息投递历史），并让工具层暴露 `retire_teammate`（Lead-only）；同时把「席位」定义成**配额**而不是「历史成员个数」。

### P2 队友名字被永久占用，且退休后重放日志会抛
- 现象：`retired` 补上之后，同名重建仍然被拒：`teammate name "ui-luna" was already used in this Team`。更隐蔽的是**日志重放不变量**：`teammate name "..." is reused by another member` —— 只要允许同名，重放历史事件就直接抛。
- 证据：`agent-team\lib\index.js:595`（创建守卫，`state.members.some(m => m.name === name)`）与 `agent-team\lib\index.js:1330`（重放不变量），两者都**不看相位** ⇒ 退休成员照样占名字；`lib\types\roster.js:22` 的 `resolveActiveMember` 同样按名字找、含退休成员 ⇒ 同名时指向退休的那个，`send_message` 会打到空号。
- 现状：**已修，离线验证通过**（`checks\reuse-check.mjs` 7/7 PASS），**真机尚未重启验证**。
- 建议上游：名字唯一性应只在「在役」范围内成立（`phase !== 'retired'`），并给「名字复用」写一条明确的重放规则（同名 = 不同 id 的先后两代成员，投影里只出现在役的那个）。

### P3 durable 事件日志只收无损 JSON，但报错信息不指出字段
- 现象：第一次实调 `retire_teammate` 时，工具「好像执行了」却报 `Error: session event "team/member" carries non-JSON-serializable data`，而名册**没变**。根因是我构造的 member 对象带了一个值为 `undefined` 的键（`{ ...prior, phase: 'retired', error: undefined }`）。
- 证据：`...\dsh-session\lib\types\index.js:575` 在 append 前用 `snapshotJsonValue` 校验；实测 `snapshotJsonValue({id:'a',name:'b',phase:'retired',error:undefined})` → REJECTED，去掉该键 → accepted。校验在写入前抛，所以日志没被写脏（这点是好设计）。
- 现状：**已修（删掉那个键）**，并有 `checks\retire-event-check.mjs` 覆盖。
- 建议上游：报错里点名**哪个字段**、哪种值（undefined / BigInt / 稀疏数组 / -0 / 特殊原型）；或提供 `stripUndefined()` 帮助函数。当前信息只给「event type」，调试成本很高。
- 教训（写进任何接手的规约）：**往 DSH durable 事件里写对象，绝不能带值为 `undefined` 的键。**

### P4 客户端对未知成员状态静默空白（协议无版本协商）
- 现象：服务端如果发出一个客户端不认识的状态，UI 不崩、也不报错，只是那一行空白 —— 加新状态时极易「服务端正确、界面莫名缺人」。
- 证据：`dsh-experimental-client-ui-agent-team\lib\client.js:64-78` 的状态映射对未知值返回 `undefined`。
- 现状：**未修**（选择在服务端过滤：`buildTeamProjection` 跳过 retired，客户端永远看不到它）。
- 建议上游：客户端对未知状态退化显示（显示原始字符串 + 提示版本不匹配），服务端投影 schema 加版本号协商，而不是靠「服务端替客户端兜底」。

### P5 补丁打在已安装的 node_modules 上：更新即丢，且没有插件扩展点
- 现象：任何对团队状态机的增强都必须直接改 `resources\app\node_modules\...` 的发行代码。DSH 一次更新就全部回滚；也没有 `./invariant` 之类的挂载点可以在 profile 层覆盖（本机 web profile 没挂它）。
- 证据：`lib\types\*.js` 与 `lib\invariant.js` 在本机无 importer（说明发行包只跑 bundled `lib/index.js`），profile 里也没有对应挂载。
- 现状：**已知代价，已告知用户**。
- 建议上游：给实验性插件一个可覆盖/可扩展的入口（例如 profile 可指定插件搜索路径、或把 `TeamState` 转换规则暴露成可注册的 handler），至少提供 `retired` 这类状态扩展的官方开关。暂时可接受的做法是把补丁脚本化（幂等 re-apply），并在 DSH 版本升级后自动校验。

### P6 模型选择器：provider 的 `models:` 是整体替换，不是追加
- 现象：为了把队友切到中转站的 luna，我在 profile 里给 provider 写了 `models:` 列表 —— 结果用户的选择器**只剩我列的那两个模型**，其余 10 个「跑哪去了」。用户逐字抱怨：「切好了，不过你干了什么，为什么我模型选择器只剩两个luna了，我其他的跑哪去了」。
- 证据：`C:\Users\Maverick\.dsh\profiles\web\cordis.patch.yml` 的 `openai.models` 覆盖了供应商目录；改为列全 12 个（codex-auto-review, gpt-5.5, gpt-5.6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-6-astra, gpt-6-luna, gpt-6-sol, gpt-6.1-sol, gpt-image-2, gpt-image-2.5-flare, gpt-image-2.5-sunburst）后恢复。
- 现状：**已修**（配置层，重启/重载即生效），但**这是设计陷阱**：一个「补充一个模型」的意图会静默删掉其余模型。
- 建议上游：`models:` 支持 `+`/追加语义或 `modelsAdd` 字段；覆盖时打印被替换掉的条目。

### P7 队友模型 = 继承创建者会话模型，且无法为单个队友指定/切换
- 现象：想让队友跑 luna，唯一办法是先把 **Lead 自己的模型芯片**切到 luna 再 `spawn_teammate` —— 子系统继承 spawner 当时的模型。`spawn_teammate` 没有模型参数，事后也没有「给这个队友换模型」的接口；子会话已经跑起来就改不动。
- 证据（硬证据）：`checks\who-runs-what.mjs` 读各队友会话记录的 `modelSelection.val.lastUsed` —— 在 Lead 是 luna 时建的三个队友是 `{"provider":"openai","model":"gpt-5.6-luna","reasoningEffort":"low"}`；在 Lead 是 deepseek 时建的 `ui-luna` 是 `{"provider":"deepseek-account","model":"deepseek-flash","reasoningEffort":"low"}`。另有更早一次观测（子会话是 deepseek 而 profile 的 `agent-default-model` 指向 `zai/glm-5.3-flash`）**指向**「跟创建者、不跟 profile 默认」，但那是一次非受控观测，建议接手者用一次受控实验坐实。
- 现状：**上游已修**（2026-10-05 另一会话给 `spawn_teammate` 加了可选 `model: "<provider>/<model>"`，实现走 `parseModelRoute`，并加了 `/team` 斜杠命令；`retire_teammate` 与名字复用补丁逻辑一行没丢，已逐行对账）。**但「事后给已有队友换模型」仍然没有**——只能退休 + 同名重建（正是本文件 P1/P2 补丁的用途）。选模型前的实测见第 7 节。
- 建议上游：`spawn_teammate` 加 `provider`/`model`/`reasoningEffort` 参数；`update_goal`-风格的工具加 `set_teammate_model`；模型切换应可热生效（或至少明确「只能对新建子会话生效」并在工具返回值里回显实际生效的模型）。

### P8 `list_agents` 的 `model` 字段对 inactive 成员会回退成 Lead 的模型（可观测性撒谎）
- 现象：队友停手后，`list_agents` 显示的模型变成 Lead 当前模型 —— 用它核对「队友跑在哪个模型上」会得到**错误结论**。
- 证据：`ui-luna` running 时 `list_agents.model` 大致可信；对 `inactive` 成员则等于 Lead 的模型（与 `who-runs-what.mjs` 读到的会话记录矛盾，以会话记录为准）。
- 现状：**未修**。
- 建议上游：`list_agents` 对 inactive 成员要么回显**最后一次记录的**模型，要么显式报 `null / unknown`，不要回退。

### P9 服务端插件改动必须重启 DSH 才生效（无热重载）
- 现象：`node --check` 通过、补丁正确，但当前进程里 `retire_teammate` 不存在；必须重启 DSH。相较之下，客户端插件在 `pnpm run dev:web` 跑着的时候可以热重载。
- 证据：三轮改动都是靠用户手动「重启了」才生效（第一次实调就是重启后 call 到的）。
- 现状：**已知行为，不是缺陷，但要写进任何交付说明**（否则会出现「补丁明明打了却报 tool not found」的误判）。

### P10 上限语义与计数边界不清
- 现象：`maxMembers = 8` 数的是什么？含 `provisioning`、含 `failed`、含已停手但未退休的成员 —— 只有 `retired` 不占位。团队满员时最需要「换人」的场景恰恰被卡死。
- 证据：`agent-team\lib\index.js:596`。
- 现状：**已修**（`filter(member => member.phase !== 'retired').length >= this.maxMembers`）。
- 建议上游：把配额、生命周期、可用性三个概念分开，并在工具报错里说明「当前 N 个席位被谁占用」。

---

## 3. 已打补丁（逐文件、逐行）

**生效前提：重启 DSH。** 三轮改动，`node --check` 六个文件全部 exit 0。
sha256 是本文件写下时的盘上状态（接手者请现算复核；不一致说明盘被改过）。

| 文件 | 字节 | sha256 |
|---|---|---|
| `...\dsh-experimental-agent-team\lib\index.js` | 74826 | `7bef7e59d30c6b866bb605c2804a3d824548b4cee37b712e04a28f709eea1824` |
| `...\dsh-experimental-agent-team\lib\invariant.js` | 18504 | `fe223b36a3b9087f3c979018e40406f99aacd85fb214afef190e7549466b30f5` |
| `...\dsh-experimental-agent-team\lib\types\roster.js` | 22487 | `b42c523afc796fbf3a0a7f610d862c4c50db64f4d404e0500467ee1f2c63bc4c` |
| `...\dsh-experimental-agent-team\lib\types\projection.js` | 14100 | `682fb4f0268e94446c120763a7cd4681c7e10a7a395f3979773a85e62556c6ba` |
| `...\dsh-experimental-agent-team\lib\types\index.js` | 10067 | `d737e78744fce5a040970f6c4057f1135a99e9c9c11fbefd0d93fbafc6bf8da4` |
| `...\dsh-experimental-tool-agent-team\lib\index.js` | 19534 | `f155264ea42ab66a876652dfaff582bf90b9331bf08ceb50caf2fdfce8df973e` |

### 3.1 退休能力（第一轮 + 第二轮）

`agent-team\lib\index.js`（真入口）：
- 两处相位枚举加 `"retired"`（`:1188`、`:1394`）。
- 转换守卫（`:1336-1338`）：
  ```js
  const settles = prior.phase === "provisioning" && (member.phase === "active" || member.phase === "failed");
  const retires = member.phase === "retired" && (prior.phase === "active" || prior.phase === "failed");
  if (!settles && !retires) throw new Error(`teammate "${member.name}" has an invalid ${prior.phase} -> ${member.phase} transition`);
  ```
- 名册遍历跳过退休成员（`:448`，以及公开 list 路径 `:1430`）。
- 席位判据（`:596`）：`state.members.filter(m => m.phase !== "retired").length >= this.maxMembers`。
- 新增 Lead-only `async retire(caller, targetName)`（`:526-549`）：校验 Lead、拒 `lead` 自己、写 durable 事件、若 live 则 `subagents.interrupt`：
  ```js
  await this.journal.appendAndFlush(root, "team/member", {
    version: 2, teamId: TeamId(root.id),
    member: { ...prior, phase: "retired" }   // 注意：绝不能带 error: undefined（见 P3）
  });
  ```
- façade（`:1876`）：`retireTeammate(caller, targetName) { ... }`。

`agent-team\lib\invariant.js`（死拷贝，同步改）：`:197`、`:403` 枚举；`:339` 名字；`:346-347` 转换守卫；`:439` 投影过滤。
`agent-team\lib\types\roster.js`：`:116` 跳过退休；`:217` retire 事件；`:273` 名字守卫；`:276` 席位判据。
`agent-team\lib\types\projection.js`：`:52`、`:255` 枚举；`:202-206` 转换守卫；`:281` `buildTeamProjection` 跳过 retired。
`agent-team\lib\types\index.js`：`:176` façade `retireTeammate`。
`tool-agent-team\lib\index.js`：`:366-378` 注册 Lead-only 工具 `retire_teammate`（复用 `INTERRUPT_VALUE_SCHEMA` = `{previousStatus: enum["running","inactive"]}`）；`:27` 的 POLICY 文案补了退休语义（这句已经在系统提示里生效，说明工具包确实重载了）。

### 3.2 名字复用（第三轮）

- `agent-team\lib\index.js:356`（`resolveActiveMember`）：`find(c => c.name === name && c.phase === "active")`。
- `agent-team\lib\index.js:595`（创建守卫）：`state.members.some(m => m.name === name && m.phase !== "retired")`。
- `agent-team\lib\index.js:1330`、`agent-team\lib\invariant.js:339`、`agent-team\lib\types\projection.js:190`（重放不变量/投影）：`find(c => c.name === member.name && c.phase !== "retired")`。
- `agent-team\lib\types\roster.js:22`（resolveActiveMember 副本）与 `:273`（创建守卫副本）同上。

---

## 4. 怎么验（都在这台机器上可跑）

### 4.1 离线（不需要重启，不改盘）
```
node F:\dsh-team\checks\retire-check.mjs        # 状态机：retired 可写入、投影消失、非法转换仍被拒
node F:\dsh-team\checks\retire-event-check.mjs  # 事件可序列化（证伪带 undefined 的写法）
node F:\dsh-team\checks\reuse-check.mjs         # 名字复用 7 项：重放不抛 / 投影只留在役 / 同名在役仍拒
```
2026-10-05 实测：三个脚本全绿（`reuse-check` 7/7 PASS，EXIT=0）。

写法要点（踩过的坑）：`teamProjectionDefinition.apply` 是 `applyProjectionEvent(state, event)`，它**先做 selector 校验**（`event.data` 必须含 `version: 2` 与 `teamId`，且 `teamId === state.id`），**失败不抛、写进 `state.failure`**。所以断言看 `state.failure`，别用 try/catch；投影读 `teamProjectionView(state)`。

### 4.2 真机端到端（需要重启 DSH 一次）
1. 重启 DSH 桌面版。
2. 确认工具在：工具列表里出现 `retire_teammate`（Lead-only）。
3. 确认问题：团队满 8 人时 `spawn_teammate` 应报 `Team member limit 8 reached`。
4. 退休一个已交接完的队友：`retire_teammate(target="<name>")` → 期望 `{"previousStatus":"inactive"|"running"}`；再 `list_agents()` 应看不到它；`retire` 自己（`lead`）应被拒。
5. 名字复用：退休后同名重建应成功（这是第三轮补丁，**尚未真机验证**）。
6. 模型核实（唯一可信源）：
```
node F:\dsh-team\checks\who-runs-what.mjs
```
它扫 `C:\Users\Maverick\.dsh\storages\session_projcache\sessions\*.json`，按 `You are teammate "<name>"` 定位文件，取 `modelSelection.val.lastUsed` 打印每个队友真实在跑的模型。**不要用 `list_agents.model` 判断 inactive 成员**（P8）。

---

## 5. 未完成 / 下一步

- **[未验证]** 名字复用补丁只过了离线测试，等下次重启做真机验证（退休 `<name>` → 同名 `spawn_teammate` → 核会话记录）。
- **[待办]** 把「退休」的补丁**脚本化**（幂等 re-apply + 版本校验），否则 DSH 一升级就全丢（P5）。
- **[待办]** 上游化：本文件的 P1~P10 可整理成 issue 草案；最该上游化的是 **P7（spawn 时指定/事后切换队友模型）** 与 **P1（退休语义）**，这两条是「团队管理 + 模型随时切换」两个痛点的根。
- **[待办]** 用一次受控实验坐实「子会话模型跟创建者、还是跟 profile 的 `agent-default-model`」（P7 的证据部分）。
- **[未定]** 发表形态：README（痛点 + 复现 + 补丁 diff）+ 上游 issue 草案 + 一个可跑的 `checks\` 目录，是本文件建议的最小集合。

## 6. 本目录文件

| 文件 | 作用 |
|---|---|
| `F:\dsh-team\HANDOFF.md` | 本文件 |
| `F:\dsh-team\checks\retire-check.mjs` | 离线：退休状态机 + 投影过滤 + 非法转换 |
| `F:\dsh-team\checks\retire-event-check.mjs` | 离线：durable 事件可序列化（undefined 会 REJECT） |
| `F:\dsh-team\checks\reuse-check.mjs` | 离线：名字复用 7 项断言 |
| `F:\dsh-team\checks\who-runs-what.mjs` | 真机：从会话记录读出每个队友真实模型 |

（本文件描述的所有改动都在 `resources\app\node_modules` 里，属**发行代码热补丁**，不是上游提交。）

---

## 7. 队友模型选型：实测与坑（2026-10-05，测于中转站 momoapi.asia）

**结论先说：队友和 Lead 都用 `gpt-5.6-luna`。** `gpt-6-luna`（更新一代）在本机实测**默认档约 3 倍慢、抖动大**，而且直接把两个队友会话跑挂。

### 7.1 延迟实测
脚本：`F:\tmp\lead-model-latency.mjs`（固定 prompt、`max_tokens: 32`、直连 `https://momoapi.asia/v1/chat/completions`，key 取 `C:\Users\Maverick\.dsh\.credentials.yaml` 的 `OPENAI_API_KEY`；provider `openai` 在 profile 里的 `baseURL` 是 `https://momoapi.asia/`）。两轮各两次采样（单位 ms）：

| 模型 / effort | 第一轮 | 第二轮 |
|---|---|---|
| `gpt-5.6-luna` / low | 1873 · 1798（均 1836） | 2579 · 1611（均 2095） |
| `gpt-6-luna` / low | 2481 · **16551**（均 9516） | 3192 · 2937（均 3065） |
| `gpt-6-luna` / effort 未设 | 5019 · 9814（均 7417） | **10669** · 6798（均 8734） |
| `gpt-5.6-luna` / effort 未设 | 3215 · 2905（均 3060，含 reasoning_tokens 16/18） | 2661 · 2898（均 2780） |

⇒ 单次最坏差 16551ms vs 1611ms。`gpt-6-luna` 在同题上还有「有时照搬 prompt 往事」的迹象（本文件 P7 更早的对照观察），综合判定：**不要为了「新一代」换 6**。

### 7.2 失败模式（换 6-luna 后真的事件）
两个队友会话（`9258a7c2`＝ui-luna、`3b3d7361`＝baren-luna）第一轮就死，后台通知是 `failed before it finished` / `It left no closing message`。日志原文（`C:\Users\Maverick\AppData\Roaming\DSH Desktop\logs\host\dsh-2026-10-05.error.log`）：

```
2026-10-05 18:25:16.405 [E] [dsh-agent-error] agent turn failed (session 9258a7c2-5328-4fb0-84bf-2d114a899169, turn 1, step 7) [PI_AI_ERROR]:
Gateway routing budget expired before an upstream attempt could start
```
栈：`resources\app\node_modules\@deepseek-ai\dsh-agent-loop\lib\index.js:1133:42` → `:978:22` → `:889:11`。
**排查入口**：那个 `logs\host\dsh-<date>.error.log` 里还有大量无害的 `[agent-registry] … agent/disposed listener threw: TypeError: Cannot read properties of undefined (reading 'catch')` —— 别被它带偏，真正的错误只有 `[dsh-agent-error] agent turn failed` 这一种。
**注意**：会话记录文件里**不含失败原因**（`"failure": null`，没有 error/message 字段），要看日志。

### 7.3 给队友换模型：现在唯一可行的路
- 建的时候可以指名：`spawn_teammate(name, …, model: "openai/gpt-5.6-luna")`（上游已加的 `parseModelRoute`）。
- **已经存在的队友换不了** ⇒ 只能 `retire_teammate` 退休 + **同名重建**（依赖本文件的 P1/P2 补丁：退休释放席位、名字可复用）。实测四个队友全部按这条路从 6-luna 回到 5.6-luna。
- **验证实际生效的模型**：读 `C:\Users\Maverick\.dsh\storages\session_projcache\sessions\*.json`（结构是 `{version, record:{version, val:{…}}}`）里的 `modelSelection.val.lastUsed`，或直接跑 `checks\who-runs-what.mjs`。**不要用 `list_agents.model` 判 inactive 成员**（会回退成 Lead 的模型，见 P8）。
- **Lead 自己的模型芯片只能由用户在界面里手动切**，没有任何工具能替它切；换队友模型前不必先切 Lead（`model:` 参数已可指名）。
- 模型切换的副作用是**当前那一轮会丢**：会话重建成新 id，旧会话的上下文不继承 —— 换模型要挑「手上活已交付」的空档。

---

## 附录 A：同属「改 DSH / 桌面集成」的残留缺陷（来自一次只读复核，未修）

这些不属于团队状态机，但属于同一个成本主题「在这台机器上改 DSH 有多贵」，一并交接。来源：`ui-luna` 对 `F:\shudong\tools\start-shudong.ps1`（sha256 `692D4912B9E6BEFFA7588522601D1BDFA0D756351F9D2AD8598EDF91DB1559CE`，6057 B）与 `start-shudong.cmd`（sha256 `329823C07378BFD2344306EB0F1F484070DD8B3532B2687883920E5C0750B30D`，450 B）的只读复核。

1. **中｜双击链仍会闪一个可见控制台。** `.url` → `start-shudong.cmd` → cmd.exe **自身**必分配控制台，`-WindowStyle Hidden` 只作用于它拉起的子解释器；而 `.cmd` 又是同步等 30s 的。状态：静态判断成立，但**没有实测证据**（无法从隐藏会话观测，需要人眼双击一次）。候选修法：`.vbs` + `WScript.Shell.Run(cmd, 0)`、`.cmd` 自我 detach、或改用 `.lnk` 并设 `WindowStyle=7`。
2. **低｜不按 `OwningProcess` 复核「监听者是不是我刚起的」。** 只看端口是否 LISTEN，理论上可能把别人的进程当成自己的。
3. **低｜清理只杀直接子进程、不递归子树。** 孙进程可能变孤儿。
4. **低｜`Start-Process` 失败时 `$p` 为 null、`$started` 记空 id。** 退出码仍为 1（不骗人），但记录里的 id 是空的。

另：本机**没装 `pwsh`**（`$PSVersionTable.PSVersion = 5.1.26100.9444`），`start-shudong.cmd` 永远走 Windows PowerShell 5.1 分支 —— 这条兜底是对的、已验证可用（`[Parser]::ParseFile` → `PARSE_ERRORS=0`；冷启动 exit 0 / 4s；二次运行幂等不重起：`8787 已经有人在听 —— 不动它。`）。

**未验证声明**：网上流传的「DSH 团队补丁已在真实项目里端到端跑通」不适用于本文件 P2（名字复用）—— 那条只过了离线断言，真机验证待下一次重启。

---

## 附录 B：团队级「开工 / 休息」开关 + 本地模型闸口上面板（2026-10-05 晚，同一批热补丁）

### B.0 需求与两条不同的「停」

用户在 20:5x 提出两件**不同**的事，别混为一谈：

1. **本地模型闸口**（`F:\shudong\tools\llm-gate.mjs`，状态 `F:\shudong\data\llm-gate.json`，三态 `off/product/on`，代理 `11499 → 11434`）：控制**述洞这个产品**能不能调本地推理。它管的是「跑模型把电脑跑卡」。
2. **团队休息**（本附录 B 的主体）：控制**DSH 队友还能不能干活**。用户原话（m14469）：「我指的休息是整个团队不工作，不是不调用本地模型，是不工作」⇒ Lead 自己那轮（用户与 Lead 的对话）不受影响，被停的是**所有队友**。

闸口的真 bug 也已修：原判据 `state.mode === 'on' || kind === 'readonly' ? allow : kind === 'infer' && modelAllowed ? allow : deny` 让 `off` 与 `product` 路由**完全一样**，「关闭」根本停不下来。现改成只读永远放行、`on` 全放行、`product` 只放行 `allow` 名单里的推理、`off` 全部推理拒（HTTP 503 +【休息】文案）。实测：`off + qwen3.5:9b → 503【休息】`、`GET /api/tags → 200`、`product + 不在名单的模型 → 503【只准产品】`。

闸口也上了 DSH 面板（`client.js` 的 `LocalModelGate`，`const GATE_BASE = "http://127.0.0.1:11499"`，5 秒轮询 `/gate/state`，三按钮 `开工 → on` / `只准产品 → product` / `休息 → off`）。因为面板页面源是 `http://127.0.0.1:43120`，`llm-gate.mjs` 的请求入口对 `p.startsWith('/gate')` 单独加了 `access-control-allow-origin: * / -headers: * / -methods: GET,POST,OPTIONS`，`OPTIONS` 直接 204 —— 只作用于 `/gate*`，代理路径不加头。已用 `curl -H "Origin: http://127.0.0.1:43120"` 验过响应带足三个 CORS 头。

### B.1 团队休息的机制（决定与理由）

加一个成员相位 `resting`，而不是新造一个「团队级开关」事件或外部状态文件。理由：退役（retired）补丁已经把**相位枚举 / 重放守卫 / 投影 / 席位与名字检查**这套机器铺好了，复用最省，而且状态随 journal 持久（重启后仍在休息）。

- 休息 = 把所有 `phase === 'active'` 的队友逐条翻成 `resting`，并 `ctx.subagents.interrupt(member.id, {kind:'ancestor', agent: caller})` 打断正在跑的那一轮（只对 live 的）。
- **机械闸门**：`resolveActiveMember` 只认 `phase === 'active'` ⇒ 休息成员**不可寻址**，`send_message` / `interrupt_agent` 的 target 解析直接抛 `TEAM_MEMBER_RESTING`（文案：`teammate "<name>" is resting — the Team is not working; the Lead must run /team work first`）⇒ 队友的 turn 根本起不来。即使有排队消息漏进来，`TeamRoster.tryMembership` 对队友只在 `phase === 'active' || 'provisioning'` 时给成员身份（`types\roster.js:88`）⇒ 它的 team 工具也用不了。**Lead 不受影响**（`tryMembership` 对 Lead 走 `types\roster.js:105` 直接返回 `{role:'lead'}`）。
- 名字与席位判据用的是 `phase !== 'retired'`（`types\roster.js:284/287`、`lib\index.js:607/608`）⇒ resting **仍占名字与席位**（有意：不能被别人顶掉，`/team add` 同名会被拒）。

### B.2 改动清单（七个文件，全部 `node --check` / 复制成 `.cjs` 后 `node --check` exit 0）

| 文件（`resources\app\node_modules\` 下） | 字节 | sha256（2026-10-05 晚） |
|---|---|---|
| `@deepseek-ai\dsh-experimental-agent-team\lib\index.js` | 78173 | `eb1bf4b18fe0910b3bb0355273a72f436149e9720ddd8267583c4d574226ce27` |
| `@deepseek-ai\dsh-experimental-agent-team\lib\invariant.js` | 18698 | `ebecdc80ea7e22c57622d0632be2df845b6500ab745262a3b3d01318e461ea14` |
| `@deepseek-ai\dsh-experimental-agent-team\lib\types\roster.js` | 25617 | `a46d4a5f438995888cdc1d951007fa26e3dc6f03cde74536ed97f2c5886cc739` |
| `@deepseek-ai\dsh-experimental-agent-team\lib\types\projection.js` | 14314 | `e211ddfe1f485762b458c2d8555afdb6d9aff4d5326114e7d279ec99b2dab059` |
| `@deepseek-ai\dsh-experimental-agent-team\lib\types\index.js` | 10515 | `501c697b1cd668b7dce85cab7c16f24034dc38a26347f6c6532ac2f75608fe6f` |
| `@deepseek-ai\dsh-experimental-tool-agent-team\lib\index.js` | 28368 | `11c801a7da9432e21e8e910c7fdb1f21ea57e3821d0f628ce7bb166455d2ac7a` |
| `@deepseek-ai\dsh-experimental-client-ui-agent-team\lib\client.js` | 48054 | `8a94196e39838fef40bee5d0488eeae684d78642fae62a1c75f2009276373f36` |

改了哪些地方：
1. `invariant.js`：两处 `phase: z.enum([...])` 各加 `"resting"`；`team/member` 重放守卫加两条合法边
   `const rests = member.phase === "resting" && prior.phase === "active";`、`const wakes = member.phase === "active" && prior.phase === "resting";`，判据变 `if (!settles && !retires && !rests && !wakes) throw ...`。
2. `agent-team\lib\index.js`：`resolveActiveMember` 找不到 active 时先查 resting 并抛 `TEAM_MEMBER_RESTING`；`list` 的 status 三级（running/inactive/failed 之外的 phase）增加 `resting`；两处 `z$1.enum` 加 `"resting"`；新增 `TeamRoster.rest(caller)` / `wake(caller)`（`retire` 之后）；facade 加 `restTeam`/`wakeTeam`。
3. `types\roster.js`：第 2 项的镜像（`resolveActiveMember` 同一句 + `list` 状态 + `rest`/`wake`）。
4. `types\projection.js`：两处单行 `phase: z.enum(['provisioning','active','failed','retired'])` 加 `'resting'`；replay 守卫同上。
5. `types\index.js`：facade `restTeam`/`wakeTeam` 委托 `this.roster.rest/wake`。
6. `tool-agent-team\lib\index.js`：`parseTeamCommand` 加 `rest` / `work`（必须无参数，带参报 usage）；usage 文案改成 `list | retire <name> | rest | work | model ...`；`executeTeamCommand` 两分支（成功文案 `the Team is resting: a, b — no teammate turn can start until /team work` / `the Team is working again: a, b`；空集时 `the Team was already at rest` / `... already working`）。
7. `client.js`：`//#region lead: 团队休息开关（休息 = 全队不干活）` 里的 `function TeamRestSwitch({ team, leadSessionId, runTeamCommand, t })`，两个按钮分别发 `/team work` / `/team rest`（走 `runTeamCommand(leadSessionId, "/team ...")`，与 `retireMember` 同路，`client.js:467-470`）；另加 `memberStatus.resting`（zh「休息中」/ en「Resting」）、`memberStatusKey` 的 `case "resting"`、`memberDotState` 的 `case "resting": return "warning"`，以及 zh/en 的 `team.title/work/rest/working/resting/fail/hint` 七对键。**面板的成员状态取自 `member.phase` 而不是 `member.status`**（`client.js:120`），所以判定必须用 `member.phase === "resting"`。

### B.3 验证状态

- **已验（离线）**：
  - `node F:\dsh-team\checks\rest-check.mjs` → `REST-CHECK OK`，**14/14 PASS，exit 0**。覆盖：`active -> resting` / `resting -> active` 合法；`provisioning -> resting`、`retired -> resting` 被拒；休息成员不可寻址（`TEAM_MEMBER_RESTING`）；休息成员的名字不能被别人顶；投影里 resting 成员仍在（没被藏起来）；`rest(lead)` 返回 `{resting:["foreman","baren-luna"]}` 且只打断 live 的那个（1 次 interrupt）；`roster.list(membership)` 里 `status === 'resting'`；`wake(lead)` 返回 `{woken:[...]}`、两人回 active、不再 interrupt。脚本可用 `DSH_APP_ROOT` 覆盖安装根。
  - `node F:\dsh-team\checks\team-command-check.mjs` → `TEAM-COMMAND-CHECK OK（失败 0 项）`，**64 项 PASS，exit 0**（在原有的 `/team list|add|retire|model` 覆盖上加了 `rest`/`work`：成功文案、把每个队友名列出来、`/team work` 提示、服务调用顺序 `rest,work`、usage hint 含 rest/work，以及 `rest now` / `rest --` / `work --` / `work b1` 四条拒绝路径）。
- **未验（真机）**：后端包只在 DSH 启动时装载 ⇒ 必须**重启 DSH** 才生效；`/team rest`、`/team work`、面板按钮与「休息中」徽标都还没有真机证据。重启会把述洞的 8787 / 5173 / 11499 一起带走，需按老办法复原（见附录 A 的启动器）。
- **面板渲染**：`http://127.0.0.1:43120` 带 authority 绑定签名 cookie 认证（无 cookie 是 401，`dsh-client-connection\lib\index.js:449`），launch token 只在桌面进程内 ⇒ headless 浏览器**验不了**，只能人眼看。

### B.4 已知代价

热补丁会在 DSH 更新时被覆盖；resting 写在 journal 里 ⇒ 重启后仍在休息；若降级回原版 DSH，journal 里的 resting 事件会让 replay 校验失败（这是「改 node_modules」这类补丁的通用代价，不是本功能独有）。


### B.5 交接提醒（Lead 停手前最后一条，2026-10-06 00:45）

**用户 2026-10-06 拍板**：团队「开工 / 休息」这类插件与团队管理改动，交给**负责开发这个插件的会话**（本仓库的主人）；Lead（另一个会话）停手，不再直接改 DSH 安装目录。所以下面这几条是给接手会话的：

1. **盘上是已经改完的状态**：真实安装目录 `F:\DSHDesktop\DSH Desktop\resources\app\node_modules\` 下的七个文件已含 resting 改动，字节数与 sha256 见 B.2；DSH 主进程已于 **00:31:53** 重启（晚于最后改动 20:40:51）⇒ 新代码已装载。
2. **本仓库的 `patched\` 与 `patches\` 是旧的**：`patched\` 七个文件 mtime 16:01–19:54、`patches\*.patch` 三个都 19:56:19，都生成于 resting 改动（20:40）之前 ⇒ **不含 resting**。接手时要么用 `tools\` 里的脚本重新生成，要么直接以安装目录为准。Lead 有意**没有**碰 `patched\`、`patches\`、`baseline\`、`tools\`、`lib\`，避免与并发工作撞车。
   - **（接手会话 2026-10-06 补）已并入**：`node tools\build-manifest.mjs --write` 已按安装目录重生成 `patched\`/`patches\`/`manifest.json`/`baseline\`（7 文件、3 包）—— 收进了 B.0–B.2 的 resting 与本地模型闸口，也收进了 B.6 那次 `StateDot` 小修（冻结的就是 `00861893dac8…` / 48137 B 那一版）；`lib/panel/client.js` 重新生成并把这些控件切掉；真机安装目录上 `apply.mjs --check` = `PATCHED patched=7 pristine=0 drift=0 missing=0` + `WIRED`（exit 0），9 个检查全绿。上面第 2、3 条里「旧 / 只有两个检查」的描述已被这次重生成覆盖。
3. **离线检查可以直接跑**：`node F:\dsh-team\checks\rest-check.mjs` → `REST-CHECK OK`（14/14，exit 0）；`node F:\dsh-team\checks\team-command-check.mjs` → 64/64（exit 0）。两个都在本仓库 `checks\` 里。
4. **还没验的只有两件**：真机打 `/team rest` / `/team work`（Lead 没有替用户发斜杠命令的工具，斜杠命令只能从输入框或面板走 `runTeamCommand`）与面板渲染人眼看（`http://127.0.0.1:43120` 是签名 cookie 认证，headless 打是 401）。
5. **已知代价**：热补丁会被 DSH 更新覆盖；resting 写在 journal 里 ⇒ 重启后仍在休息；若降级回原版 DSH，journal 里的 resting 事件会让 replay 校验失败。
6. 同一批里的**本地模型闸口面板**（`/gate` 三态 + DSH 面板三个按钮）也在 B.0/B.2 里，同样移交。

### B.6 面板「一直在转」的小修（Lead 2026-10-06 00:5x，同样要重新生成才进补丁）

用户反馈「开工中一直在转，这样没开始干活啊」。查清是**纯显示问题**，不是功能坏了：

- 原因：我给两块面板的状态行用了 `StateDot state="ongoing"`，而 `ongoing` 在 `dsh-client-ui-primitives` 里**是唯一的转圈状态**（`StateDot.module.css`：`ongoing` = SVG + `dsh-state-dot-spin` 无限旋转；其余 `idle/done/warning/error` 都是静态点）。所以只要模式不是休息，那个点就永远转 —— 看着像"没干完/在加载"。
- 改法（`@deepseek-ai\dsh-experimental-client-ui-agent-team\lib\client.js`，改后 48137 B sha256 `00861893dac814687b393812db983a3f7b36166c573ebdb28dce36e71e82d02d`，`node --check` exit 0）：
  1. 闸口面板：`state: error !== null ? "error" : mode === "off" || mode === void 0 ? "warning" : "ongoing"` → 末项 `"done"`（静态绿点）。
  2. 团队面板：`state: error !== null ? "error" : allRest ? "warning" : "ongoing"` → `... allRest ? "warning" : teammates.length === 0 ? "idle" : "done"`。
  3. 文案诚实化：zh `team.working` = 「开工中 —— {count} 位队友在岗（有派活才动手）」、en = `"Working — {count} teammate(s) on duty (they only move when assigned)"` —— 「在岗」不等于「在干活」，避免再被误读。
- 这一条在 `patched\`/`patches\` 里同样**不存在**，重生成时一并以安装目录为准。
- 另：`ongoing` 在该 bundle 里还剩 3 处，都是原包自带的，不是我加的（我只动了上面两处）。
