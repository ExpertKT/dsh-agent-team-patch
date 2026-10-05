# DSH Agent Teams 补丁包：退休 · 每成员模型 · 团队面板

给 DSH 桌面版的 Agent Teams 补三件事：

1. **队友能退休** —— 退场后不再占席位、名字可复用，但 durable 名册 / 任务归属 / 消息历史保留；
2. **每个队友单独选模型** —— 面板里每人一行下拉，加人时也能指定 `provider/model`；
3. **会话标题栏的团队面板** —— 名册（状态、当前模型、退休按钮）、任务板、加人表单（名字 / 任务 / 模型 / `--fork`）。

适用范围：DSH 桌面版，`@deepseek-ai/*` 版本必须是 **`0.2.0-rc.2`**。
这是**对发行代码（`resources/app/node_modules`）的热补丁，DSH 升级后失效**（重新生成见第 7 节）。正确的修法在上游，见 [`ISSUE.md`](ISSUE.md)。

> **给 agent 的指令**（可整段复制）：
> 克隆本仓库，先跑 `node apply.mjs --check`。输出里必须同时有 `PATCHED` 和 `WIRED`（exit 0）；若不是或报 `drift`，把完整输出贴回来，不要加 `--force`。确认后跑 `node apply.mjs`，然后让用户**完全退出 DSH 再打开**。

---

## 安装（插件方式，推荐）

这个仓库本身就是一个 DSH 插件包 —— 根目录的 `package.json` 声明了 `dsh.bundle`：

```powershell
dsh plugin add https://github.com/ExpertKT/dsh-agent-team-patch
# 加完在插件列表里启用它（启用会把它写进 profile 的 dsh.profile.bundles），然后重启 DSH
```

它给的是**会话标题栏的团队面板**：看当前小队名册、加队友（名字 / 任务 / `--fork` / 可选模型）、给每个队友换模型。前提是你的 DSH 里已有官方那三个实验包（Agent Teams）。

**这一半不含「退休」**：退休要改官方名册的状态机，那是下面热补丁那一半的事（也在向上游提 issue），所以这个面板里没有退休按钮。

改动就是四个文件：`package.json`、`cordis.patch.yml`（关掉官方同名 UI、插入本包）、`lib/panel/index.js`（宿主侧注册 `/teammates` 命令）、`lib/panel/client.js`（浏览器侧面板，由 `tools/build-plugin.mjs` 从 `patched/` 生成）。

## 1. 安装（热补丁方式）

```powershell
cd <本仓库目录>
node apply.mjs --check     # ① 自检，只读不写盘
node apply.mjs             # ② 装：7 个文件 + profile 接线，都会留备份
                           # ③ 完全退出 DSH，再打开（服务端插件没有热重载）
```

装完在任意会话里，鼠标移到**标题栏右侧**：出现「团队」入口 → 点开就是面板。

**`apply.mjs` 的参数**（通常一个都不用给）：

| 参数 | 什么时候需要 |
|---|---|
| `--root <DSH 的 resources/app>` | 自动探测失败，或机器上有多个安装 |
| `--dsh-home <DSH_HOME>` | 你的 DSH 家目录不是 `~/.dsh` |
| `--profile <profile 目录>` | profile 不在 `<DSH_HOME>/profiles/<名字>` |
| `--check` / `--revert` / `--force` | 自检 / 卸载 / 明知文件被改过仍要覆盖 |

安装位置自动探测顺序：`$DSH_APP_ROOT` → `%LOCALAPPDATA%\Programs\*` → `%ProgramFiles%\*` → `%ProgramFiles(x86)%\*` → `C:\DSHDesktop\*`、`D:\…`、`E:\…`、`F:\DSHDesktop\*`（每个基目录只看一层，认 `package.json` 里 `name` 以 `dsh-plugin-desktop` 开头的那个）。**找到第一个就用，并把其余候选打印出来。**

## 2. 卸载

```powershell
node apply.mjs --revert    # 还原 7 个文件 + profile 里加的那一行
# 重启 DSH
```

## 3. 装不上时（一律明确拒绝，不会只做半套）

| 输出 | 含义 | 处理 |
|---|---|---|
| `[FAIL] N 个包版本不符`，exit 2 | 你的 DSH 不是 `0.2.0-rc.2` | 这份补丁不适用；按第 7 节用你的版本重新生成 |
| 逐文件 `drift`，`apply` 拒绝，exit 2 | 目标文件不是**这份构建**的原始字节（升级过/换过构建） | 同上。别用 `--force` 蒙 |
| `profile (unresolved …)` | 找不到 profile | 用 `--dsh-home` / `--profile` 指过去 |

三条门槛里前两条是「这份补丁不适用」的硬信号，第三条只是路径提示。

## 4. 装完没变化？按顺序排查

1. **重启了吗**：服务端插件没有热重载；客户端插件至少 `Ctrl+F5`；
2. `node apply.mjs --check` 是否 `PATCHED` + `WIRED`；
3. 入口在**会话标题栏右侧**，面板只列**当前会话自己那支小队**（在队友的会话里看到的是那支队友的小队）；
4. **模型下拉是空的**：说明那台机器的 provider 没配（面板照 host 报上来的模型目录列，不做白名单）；
5. 还是不行：`Ctrl+F5` 后看 `agent-team: …` 那行字（面板的错误边界会把渲染异常显示出来，而不是默默消失）。

## 5. 这个补丁改了什么（7 个文件 / 3 个包）

| 包 | 文件 | 改动 |
|---|---|---|
| `dsh-experimental-agent-team` | `lib/index.js` | 相位加 `retired`；`active\|failed → retired` 守卫；席位只数非 retired；名字唯一性只在在役范围；名册/投影跳过退休成员；Lead-only `retire()`；`spawnAdmitted` 转发 `agentOptions`（选模型） |
| 同上 | `lib/invariant.js`、`lib/types/index.js`、`lib/types/projection.js`、`lib/types/roster.js` | 同源拷贝，为语义一致一起改（发行包内无 importer，但 `exports` 里有） |
| `dsh-experimental-tool-agent-team` | `lib/index.js` | 注册 `retire_teammate`；`spawn_teammate` 加可选 `model`（`provider/model`）；新增 `/team` 命令（`list \| retire <name> \| add <name> [--fork] [--model p/m] -- <prompt>`） |
| `dsh-experimental-client-ui-agent-team` | `lib/client.js` | 团队面板（名册 / 任务卡 / 加人表单 / 每成员模型下拉 / 退休按钮）；Remote 命名空间统一走 `ctx.get`；面板外包错误边界 |

`package.json` 不补（registry 安装只改了依赖键顺序，是噪声）。逐行 diff 见 `patches/*.patch`，完整哈希见 [`manifest.json`](manifest.json)。

## 6. 它怎么被验证的

**7 个离线检查，全部 exit 0**（`node checks/<名字>.mjs`）：

| 检查 | 覆盖 |
|---|---|
| `retire-check` / `retire-event-check` / `reuse-check` | 退休可写入、投影隐藏、三条非法转换仍被拒；同名重建重放不报 failure（7/7） |
| `team-command-check` | `/team` 的 list / add / retire、`--model`、`--` 后原文照传、各类畸形输入不抛（37/37） |
| `team-ui-check` | 面板动作的调用契约 + **真渲染烟囱**（假 react hooks 直接调组件）覆盖「新队友还没选模型」这条崩溃 |
| `remote-namespace-check` | 用发行包里的真 Cordis 复刻命名空间形状，实测 `ctx.get` 无需声明、`ctx.remote.<ns>` 未声明会抛 |
| `profile-wiring-check` | 临时 fixture 里跑完 `--check → apply → --check → --revert`，含「不重写 app 文件」「逐字节还原」「自动探测安装位置」(18/18) |
| `bundle-check` | 插件那一半：`dsh.bundle`/`dsh.client` 清单、bundle patch 的形状、宿主插件注册 `/teammates` 并真的跑一次 add（含"宿主忽略模型时不静默"分支）、浏览器 bundle 能按 `__ModuleLoader__` 契约加载、且生成物与 `tools/build-plugin.mjs` 一致 |

**端到端对照**（`tools/build-verify-root.mjs` 造一个「未打补丁但依赖可解析」的根）：

| 根目录状态 | `apply.mjs --check` | 6 个补丁检查 |
|---|---|---|
| 未打补丁 | `NOT-PATCHED pristine=7` + `NOT-WIRED`，exit 1 | 5 个失败 |
| `apply` 之后 | `PATCHED` + `WIRED`，exit 0 | **全部 exit 0** |
| `--revert` 之后 | 回到 `NOT-PATCHED` + `NOT-WIRED`，exit 1 | 又失败 |

`patched/` 的字节可以从公开 npm tarball（`@deepseek-ai/*@0.2.0-rc.2`）+ 一个派生基线精确复现（远端 tree 与本地 tree 相同）。真机上还实测过：加人、退休、每成员模型下拉、队友用 `send_message` 给 Lead 发消息。

**保留（没有独立坐实的部分，请当待验证）**：满员 → 退休 → 再 spawn 的端到端（离线证明，未在满员团队上复跑）；`client.js` 的 pristine 是**派生基线**（桌面 app 自带的是另一次构建，只差生成型 CSS 脚手架）；本仓库**没有在第二台机器上跑过**（能否适用由第 3 节的两条硬门槛把关）。

## 7. DSH 升级后重新生成

```powershell
$v = '0.2.0-rc.2'   # 换成你的版本
foreach ($p in 'dsh-experimental-agent-team','dsh-experimental-tool-agent-team','dsh-experimental-client-ui-agent-team') {
  Invoke-WebRequest "https://registry.npmjs.org/@deepseek-ai/$p/-/$p-$v.tgz" -OutFile ".cache\$p.tgz"
  New-Item -ItemType Directory ".cache\pristine\$p" -Force | Out-Null
  tar -xzf ".cache\$p.tgz" -C ".cache\pristine\$p"
}
node tools\build-manifest.mjs          # 先看报告：应当只有 7 个文件、package.json 被跳过
node tools\build-manifest.mjs --write  # 重写 manifest.json / patched / baseline / patches
node tools\build-verify-root.mjs       # 造未打补丁的根，跑上面第 6 节的对照
```

## 8. 目录

| 路径 | 作用 |
|---|---|
| `package.json` / `cordis.patch.yml` / `lib/panel/` | **插件那一半**：`dsh.bundle` 清单、组合补丁、宿主侧 `/teammates`、浏览器侧面板 |
| `tools/build-plugin.mjs` | 由 `patched/` 生成 `lib/panel/client.js`（`--check` 可验证生成物是否过期） |
| `apply.mjs` | 安装/卸载器：版本 + sha256 双闸门、幂等、带备份、自动探测安装位置、profile 接线 |
| `manifest.json` | 7 个文件的 pristine / patched sha256（`apply.mjs` 的唯一依据） |
| `patched/` | 补丁后的字节快照（`apply.mjs` 拷贝的源） |
| `patches/*.patch` | 三份 unified diff（给人看 / 给上游） |
| `baseline/` | 只放不能从 npm 得到的基线：桌面 app 自带那次构建的 `client.js` |
| `checks/` | 7 个离线检查（外加 `who-runs-what.mjs` 机器状态探针） |
| `tools/` | `build-manifest.mjs` 重生成补丁集；`build-verify-root.mjs` 造验证根 |
| `README.md` / `ISSUE.md` / `HANDOFF.md` | 本文 / 上游 issue 草案（A–D）/ 原始现场笔记 |
| `.cache/`、`wip/` | 构建脚手架与临时快照（已 gitignore） |

## 9. 已知限制

- 热补丁会被 DSH 升级覆盖（`--check` 会因此 exit 1，不会静默出错）；
- 必须重启 DSH 才生效；客户端插件至少 `Ctrl+F5`；
- `--revert` 依赖 `.dsh-retire.bak` / profile 的 `.dsh-team.bak`；
- 退休成员在客户端**不可见**（服务端投影过滤，这是有意选的兜底）；
- 队友在会话树里是 Lead 的 continuable 子会话（上游设计），所以**会话列表里它看起来像子智能体**；把它和普通子智能体区分开的唯一界面是团队面板；
- 模型下拉的选项来自 host 报上来的模型目录，取决于那台机器自己的 provider 配置；
- `checks/team-ui-check.mjs` 是「假 react hooks + 直接调组件」的渲染，不是真 React 渲染：能抓渲染期抛错，抓不到 DOM/样式问题。

## 10. 许可与出处

补丁改的是 DeepSeek Harness 的 `@deepseek-ai/*` 包（各包自带 MIT `LICENSE`），`patched/` 与 `baseline/` 里保留其产物只为可复现；本仓库只提供补丁、安装器和验证脚本。
