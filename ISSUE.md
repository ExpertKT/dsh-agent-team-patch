# 上游 issue 草案

三份草案，按「最该上游化」排序。全部来自对本机 `@deepseek-ai/*` `0.2.0-rc.2` 发行代码的只读复核 + 一份已跑通的本地热补丁（见同目录 [`README.md`](README.md)、[`patches/`](patches)）。

> 环境（三份通用）
> - DSH 桌面版 `resources/app`（`dsh-plugin-desktop` v2.0.17），Windows 11
> - `@deepseek-ai/dsh-experimental-agent-team` `0.2.0-rc.2`
> - `@deepseek-ai/dsh-experimental-tool-agent-team` `0.2.0-rc.2`
> - `@deepseek-ai/dsh-session` `0.2.0-rc.2`

---

## Issue A — Agent Teams 没有「释放席位」的语义：终态 `retired` 缺失，席位与名字都按**历史成员数**计数

**归属包**：`@deepseek-ai/dsh-experimental-agent-team`（名册状态机）

### 现象

团队满员后无法再引入新队友，即使老队友早已停手、任务早已交接：

```
Error: Team member limit 8 reached
```

`stopTeammates` 只停运行时、**不改名册**，因此没有任何 API 能把一个成员从「占用席位 / 占用名字」里释放出来。同时队友名字被永久占用：

```
Error: teammate name "ui-luna" was already used in this Team
```

### 复现（无需真机，两个断言即可）

1. 起满 `maxMembers` 个队友（本机 profile 把 `maxMembers` 设成 8）；
2. 再 `spawn_teammate` → `Team member limit 8 reached`；
3. `stop_teammates` 停掉其中任意一个，再 `spawn_teammate` → 仍然失败。

名字问题更隐蔽：**一旦让同名重建通过，durable 日志重放会直接抛** `teammate name "..." is reused by another member`。所以在当前设计下「允许同名」不是补一个判断就能了事的，它牵动重放不变量。

### 根因（`...\dsh-experimental-agent-team\lib\index.js`，bundle 内可 grep 到）

```js
// 席位判据：数的是「历史成员个数」
:596  if (state.members.length >= this.maxMembers)                                  // 打补丁前
        throw new TeamError(`Team member limit ${this.maxMembers} reached`, "TEAM_MEMBER_LIMIT");

// 名字判据：不看相位
:595  if (state.members.some((member) => member.name === name))
        throw new TeamError(`teammate name "${name}" was already used in this Team`, "TEAM_MEMBER_NAME_TAKEN");

// 重放不变量：同样不看相位，于是「同名」直接让整条日志重放失败
:1330 const named = state.members.find((candidate) => candidate.name === member.name);
      if (named !== void 0 && named.id !== member.id)
        throw new Error(`teammate name "${member.name}" is reused by another member`);

// 相位转换守卫：只有 provisioning -> active|failed
:1336 const settles = prior.phase === "provisioning" && (member.phase === "active" || member.phase === "failed");
      if (!settles) throw new Error(`teammate "${member.name}" has an invalid ${prior.phase} -> ${member.phase} transition`);
```

即：**名册没有终态**，`active`/`inactive` 都还占着配额；**名字唯一性没有作用域**；**配额语义被绑死在「历史成员个数」上**。

另外，`maxMembers` 的实际生效值是 profile 给的，不是代码默认值：

```js
dsh-experimental-agent-team\lib\index.js:1708        const DEFAULT_MAX_MEMBERS = 16;
dsh-experimental-agent-team\lib\types\index.js:15    同上
```
```yaml
# ...\dsh-experimental-agent-team-profile\cordis.patch.yml:20
maxMembers: 8
```

所以「为什么是 8」这个问题的答案在 profile wiring，不在状态机。

### 建议的上游修法

1. **把 `retired` 变成一等终态**：`active | failed → retired`（`provisioning → retired` 仍应拒绝），并写进相位枚举。durable 记录、任务归属、消息历史全部保留 —— 退休的是**席位和可见性**，不是历史。
2. **席位改成配额**：`state.members.filter(m => m.phase !== "retired").length >= maxMembers`。
3. **名字唯一性限定在在役范围**：三处判据（创建守卫 `:595`、重放不变量 `:1330`、投影）统一成 `m.name === name && m.phase !== "retired"`；并给「同名复用」补一条明确的重放规则（同名 = 不同 id 的先后两代，投影只出现在役的那个）。
4. **`resolveActiveMember` 只解析在役成员**（现在按名字找会命中退休的那个，`send_message` 会打到空号）。
5. **工具层**：`@deepseek-ai/dsh-experimental-tool-agent-team` 暴露 Lead-only `retire_teammate(target)`，返回 `{previousStatus}`。
6. 更一般地：把**配额 / 生命周期 / 可用性**三个概念分开，并让 `TEAM_MEMBER_LIMIT` 报错说明「当前 N 个席位被谁占用」。

### 本仓库对应实现

`patches/dsh-experimental-agent-team.patch`（`132 insertions / 34 deletions`）+ `patches/dsh-experimental-tool-agent-team.patch`。改后的字节由 `checks/retire-check.mjs`、`checks/retire-event-check.mjs`、`checks/reuse-check.mjs` 三个离线脚本覆盖（全绿）；对照实验证明 revert 后立刻转红，见 README 第 5c 节。

---

## Issue B — `spawn_teammate` 无法指定模型，也无法事后切换；且 `list_agents.model` 对 inactive 成员会回退成 Lead 的模型

**归属包**：`@deepseek-ai/dsh-experimental-tool-agent-team`（工具签名）+ `@deepseek-ai/dsh-experimental-agent-team`（子会话模型解析与 `list_agents` 投影）

> 这是「团队管理 + 模型随时切换」这条主线的第二个根。**本条的实机证据等级低于 Issue A** —— 见下方「证据强度」。

### 现象

1. `spawn_teammate` **没有** `provider` / `model` / `reasoningEffort` 参数；想让队友跑某个模型，唯一办法是先把 **Lead 自己的模型芯片**切过去再 spawn。
2. 子会话跑起来之后**没有任何**「给这个队友换模型」的接口。
3. `list_agents()` 返回的 `model` 对**已停手（inactive）**的成员会变成 Lead 当前的模型 —— 用它核对「队友跑在哪个模型上」会得到错误结论。

### 根因

工具签名（`...\dsh-experimental-tool-agent-team\lib\index.js`）：

```js
:242-266  spawn_teammate 的参数只有 name / description / prompt / context
```

`list_agents` 的模型投影（`...\dsh-experimental-agent-team\lib\index.js`）：

```js
:436-464  // Lead 行
          ...(root.options.model === void 0 ? {} : { model: root.options.model })
          // 每个队友行
          const model = live?.options.model ?? root.options.model;   // ← inactive 时 live 为空，回退成 Lead 的模型
```

`live` 为空就回退，于是「查不到」被静默表达成「等于 Lead 的模型」。

### 证据强度（请按此定级）

- **硬证据（代码）**：`spawn_teammate` 的参数列表里确实没有模型参数；`:436-464` 的 `?? root.options.model` 回退确实存在。
- **较弱**：`checks/who-runs-what.mjs` 扫会话记录 `modelSelection.val.lastUsed`，历史输出显示「Lead 是 luna 时建的三个队友都是 `gpt-5.6-luna`，Lead 是 deepseek 时建的 `ui-luna` 是 `deepseek-flash`」，**指向**「子会话继承创建者当时的模型」。这是**非受控观测**（变量没控住），还没有排除「跟 profile 的 `agent-default-model`」。
- **复现建议**：做一次受控实验 —— 固定 profile 的 `agent-default-model` 为 A，把 Lead 切到 B，spawn 一个队友，读该队友会话记录的 `modelSelection.val.lastUsed`；A≠B 时结论才干净。

### 建议的上游修法

1. `spawn_teammate` 增加 `provider` / `model` / `reasoningEffort` 参数；
2. 增加 `set_teammate_model(target, provider, model)`（`update_goal` 风格），并明确它是只对新建子会话生效、还是能热生效；
3. **无论能否热生效，返回值里回显实际生效的模型**；
4. `list_agents` 对 inactive 成员要么回显**最后一次记录的**模型，要么显式 `null`/`unknown`，**不要回退成 Lead 的模型**；
5. 若确定「继承创建者」是设计，请写进文档 —— 现在它只能靠读代码和翻会话记录才知道。

---

## Issue C — durable 事件拒收时不说**哪个字段**有问题

**归属包**：`@deepseek-ai/dsh-session`

### 现象

`retire_teammate` 第一次实调时报：

```
Error: session event "team/member" carries non-JSON-serializable data
```

工具「看起来执行了」，但名册**没变**。根因是事件对象里带了一个值为 `undefined` 的键：`{ ...prior, phase: 'retired', error: undefined }`。

### 根因（`...\dsh-session\lib\types\index.js`）

```js
:573-575  const dataSnapshot = snapshotJsonValue(data);
          if (dataSnapshot === undefined)
            throw new Error(`session event "${type}" carries non-JSON-serializable data`);
```

闸门本身的位置是**对的**（写入前抛，日志不会被写脏 —— 这点是好设计），但错误信息只给了 event type，**不指出是哪个字段、哪种值**。

### 建议的上游修法

- 报错里点名**字段路径**与**值的种类**（`undefined` / `BigInt` / `Symbol` / 稀疏数组 / `-0` / 非平凡原型）；
- 或提供一个 `stripUndefined()` 之类的辅助函数。

复现成本极低、收益明确：现在调试这个问题只能靠二分法删字段。

> 教训（值得写进文档）：**往 DSH durable 事件里写对象，绝不能带值为 `undefined` 的键。**

---

## Issue D — 客户端插件读 `ctx.remote.<namespace>` 的报错误导，且**渲染器引导失败不带任何错误信息**

### 现象

一个客户端插件（`@deepseek-ai/dsh-experimental-client-ui-*`）只要**没有**把 `remote.session` 写进 `inject` 就读 `ctx.remote.session`，就会在插件激活期抛：

```
cannot get property "remote.session" without inject
```

而桌面端只把它报成：

```
dsh-plugin-desktop: renderer boot failed (plugins: @deepseek-ai/<plugin>): The client Loader did not provide an error message.
RendererStartupFailure: Renderer boot failed for 1 plugin(s)
```

真实原因（缺 inject token）在这一行里完全看不到。我们最后是靠「把插件从 profile 里摘掉 → 引导恢复」二分才定位的。

### 复现（不需要 DSH，用发行包里的 Cordis 即可）

`checks/remote-namespace-check.mjs` 用最简 `Service` 子类复刻 `dsh-api-gateway` 的命名空间形状，实测三种消费者：

| 消费者 `inject` | `ctx.get("remote.session")` | `ctx.remote.session` |
|---|---|---|
| `[]` | object | `THREW cannot get property "remote" without inject` |
| `["remote"]` | object | `THREW cannot get property "remote.session" without inject` |
| `["remote","remote.session"]` | object | object |

即：命名空间是**独立服务** `remote.<namespace>`（`dsh-api-gateway\lib\client.js:1919-1930` 的 `RemoteNamespaceService` 调 `super(ctx, remoteServiceKey(name))`），`ctx.remote.<ns>` 依赖 `cordis\lib\index.js:130` 的 `tracker.associate` 改写，而那条改写最终仍要过带 inject 闸门的代理。**`ctx.get` 则完全不受闸门约束**（`cordis\lib\index.js:755-772`）。

### 建议的上游修法（两条，独立可做）

1. **错误信息**：把引导失败的真实异常带出来（哪怕是 `String(error)`，或插件 id + 栈），至少让 host 日志能落到 `warn`；现在「did not provide an error message」等于零信息。
2. **文档/类型**：在客户端插件文档里写清读 Remote 命名空间的两种合法写法 —— 要么在 `inject` 里声明 `"remote.<namespace>"`，要么用不受闸门约束的 `ctx.get("remote.<namespace>")`；并明确 `ctx.remote.<ns>` 在未声明时会**抛错**，而不是返回 `undefined`。

### 本仓库对应实现

`patches/dsh-experimental-client-ui-agent-team.patch`：`inject` 退回上游那四个服务不动，命名空间统一走 `ctx.get("remote." + space)`，并给所有注册加了兜底 —— 事故之后定的规矩是「**任何注册失败都不能连累面板入口**」。

---

## Issue E — Lead 空闲时，队友静默变成「自己那支空队」的 Lead（任务板变成 0）

### 现象

一个 19 人、46 条任务的团队里，队友 `foreman`（会话 `5c102838…`，就是用户正在对话的那个）调 `team_task_list` **连续 3 次**得到 `{"tasks":[]}`（`isError:false`，是"成功但空"而不是报错），而 Lead 会话的面板/投影里有全部 46 条任务（已完成 38 / 待办 7 / 进行中 1）。

### 现场证据（读会话日志与投影得到）

- `foreman` 自己的 `agentTeam` 投影是 `{"id":"5c102838…","members":[],"tasks":[]}` —— 它认为自己是一支空队的 Lead；
- 它的会话头完整：`parentSession: session-5d6b7461…`、`origin: subagent`、`delegationDepth: 1`；
- 它的 `subagent/descriptor` 在 seq 0，`version: 3, mode: continuable`（描述符存在）；
- 同队另外 18 个成员会话里 `not a member of an active Agent Team` 出现 **0** 次 ⇒ 只有它落到了"自己当 Lead"这条兜底路径。

### 根因（`TeamRoster.tryMembership`，`dsh-experimental-agent-team\lib\index.js:397-424`）

它先用 `ctx.agents.get(parentSession)` 找 Lead；Lead 的 **Agent** 被闲置回收后取不到，于是落到兜底 `return { root: agent, role: "lead" }` —— 队友被当成新的 root，于是本队的任务板对它永远是空的，**而且不报错**（最危险的失败形态）。

### 建议的上游修法

当名册记录是 `active`/`provisioning`、而 Lead 的 **Agent** 不在时，改用 Lead 的 **Session**（`ctx.sessions.get(parentSessionId)`）继续解析 —— Team 状态本来就投影在 Lead 的 Session 上，不需要活的 Agent 对象。本仓库的实现见 `patches/dsh-experimental-agent-team.patch`，回归断言在 `checks/reuse-check.mjs` 第 5 节（「Lead agent 不活跃时，队友仍解析到本队」）。

---

## 附：为什么不直接提「退休」这个补丁？

本地的 `patches/` 是**发行代码热补丁**（改 `resources/app/node_modules`），只适合自用验证，不适合作为上游贡献形式：

- 它同时改了 bundled `lib/index.js` 和 4 个**在发行包内没有任何 importer** 的同源拷贝（`lib/invariant.js`、`lib/types/*.js`），只为语义一致 —— 上游应该只动源文件，由构建产出 bundle；
- `package.json` 的 diff 是 registry 安装造成的键顺序变化，是噪声，已从 `patches/` 里剔除。

所以上游的正确形式是 Issue A 描述的**源文件级改动**，而不是这份 bundle diff。
