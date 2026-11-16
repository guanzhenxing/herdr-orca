# herdr-cowork skill 集成设计

日期：2026-11-16（同日经两遍独立审查修订）
状态：已确认（设计逐节过审 + 双遍独立审查发现已并入）

## 背景

[ninehills 的 cowork skill](https://gist.github.com/ninehills/eef70810238f779362a820786ae4a096)（v1.1.0）是一份多 Agent 协作流程协议：让运行在 Herdr 终端里的任一 CLI agent 担任 Commander，通过 `hc` CLI 启动、委派、核验、清理成员 agent，以 TEAM.md 为共享注册表。它编排 agent，而 herdr-orca 可视化 agent——两者互补。

**许可记录**：上游 gist 未声明任何许可证；维护者评估后决定将全文 vendor 入本 Apache-2.0 仓库。THIRD_PARTY.md 的 License 列如实写 "none stated"，NOTICE 增加署名行，不对此作法律结论。

### Agent 覆盖矩阵（经官方文档与源码核实）

`~/.agents/skills/` 是 [Agent Skills](https://agentskills.io/specification) 生态的跨 agent 标准枢纽：六个 agent 中**五个原生扫描它**，只有 Claude Code 例外。

| Agent | 发现机制（核实依据） | 动作 | 相对软链路径 |
|---|---|---|---|
| Claude Code | 仅 `~/.claude/skills/` 等，**不扫 `~/.agents`**（[官方文档](https://code.claude.com/docs/en/skills)） | 软链（**唯一必需**） | `../../.agents/skills/herdr-cowork` |
| Codex | 规范 USER 位置是 `~/.agents/skills`（[官方](https://learn.chatgpt.com/docs/build-skills)、[cli#14153](https://github.com/cli/cli/issues/14153)）；`~/.codex/skills` 为**弃用兼容路径** | 软链（**legacy-compat 保险**，标注弃用） | `../../.agents/skills/herdr-cowork` |
| Gemini | `~/.gemini/skills/`（[官方文档](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md)）；亦兼容扫描 `~/.agents/skills` | 软链（对冲老版本） | `../../.agents/skills/herdr-cowork` |
| OpenCode | `~/.config/opencode/skills/`（复数；[官方文档](https://opencode.ai/docs/skills)）；亦列 `~/.agents/skills` 为全局兼容位置 | 软链（对冲老版本） | `../../../.agents/skills/herdr-cowork` |
| pi | `~/.pi/agent/skills/`（[pi-mono 文档](https://upd.dev/badlogic/pi-mono/src/branch/main/packages/coding-agent/docs/skills.md)）；亦列 `~/.agents/skills` 为全局位置 | 软链（对冲老版本） | `../../../.agents/skills/herdr-cowork` |
| DeepSeek Harness | rank-500 用户根 `<agentsHome>/skills`，源码定死默认 `~/.agents/skills`（[skills.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md)、[home-paths](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/util/home-paths/src/index.ts)） | 零工作 | — |
| Cursor | 本机未安装 | 暂不处理，README 备注照矩阵补行 | — |

**软链策略：保险版（5 条）**——Claude 必需；Gemini/OpenCode/pi 建在各自当前合法位置对冲用户机器上的老版本；Codex 建在弃用路径对冲不扫 `~/.agents` 的老版本。本机五个目标目录均已有 `-> .agents/skills/<name>` 同款软链先例（OpenCode/pi 为 3 级上溯）。

### 决策记录

1. **vendor 入库**（维护者拍板）：SKILL.md 直接进仓库，不在安装时拉取 gist。安装环节因此是纯本地复制，无网络依赖。
2. **可选安装**：默认不装，`--with-skills` 才装。写入面从 `~/.config/herdr-app/` 扩大到全局 agent 配置，对用户保守。
3. **改名 `cowork` → `herdr-cowork`**：名字必须自带 Herdr 边界；顺带修复上游违反规范"name 须匹配父目录"的问题（目录与 `name:` 同步改）。
4. **软链层保险版**（见矩阵）。

## 目标

1. 仓库新增 `skills/herdr-cowork/`，随 git 版本化、PR 可审
2. `install.sh --with-skills` 把 skill 装到用户机器，语义与现有 mods 环节同构
3. README / THIRD_PARTY.md / NOTICE 如实记录安装面、运行期执行面与致谢

## 非目标

- Orca mod / Team 面板（Phase 2 另议）
- 修改 `sync.sh`（它同步 Herdr home 的布局/mods；skill 源头是 gist）
- 上游更新的自动化脚本（README 记手动流程）
- Cursor 软链（未安装；README 备注即可）
- 逐 agent 的运行期加载自动化测试（验收做落位验证；真机加载抽验可选，见验收节）

## 设计

### 1. 仓库内容

```
skills/
└── herdr-cowork/
    └── SKILL.md    ← gist v1.1.0 全文；入库时一次性将 frontmatter 的
                       name: cowork 改为 name: herdr-cowork，其余逐字保留
```

frontmatter 的 `version: 1.1.0` 字段非 agentskills.io 规范字段（六 agent 均容忍，DSH/严格校验器会视作扩展信息），逐字保留并在 THIRD_PARTY 注记一句。

### 2. install.sh

usage 注释与 flag 解析加 `--with-skills`。

**环节结构（关键——dry-run 门约束）**：现有脚本是"判定 → `say()` 报告 → dry-run 在 L93 `exit 0` → 写入"四段。skill 环节必须拆成两半嵌入：

- **前置守卫**（flag 解析后）：`[ "$WITH_SKILLS" = 1 ] && { [ -f skills/herdr-cowork/SKILL.md ] || { echo "skills/herdr-cowork/SKILL.md missing"; exit 1; } }`（仿 L24 对 layouts/orca.json 的先例）
- **判定+报告**：与 mods 判定（L33-54）同区，全部状态判定在 dry-run 门**之前**完成，结果经 `say()` 并入报告块（L84-91）
- **写入块**：置于 herdr-automations CLI 环节**之后**、收尾提示之前

**动作**（写入块内）：

1. 复制仓库 `skills/herdr-cowork/SKILL.md` → `~/.agents/skills/herdr-cowork/SKILL.md`
2. 复制**成功后**才建五处软链（见错误处理）；软链一律 `ln -sfn`
3. agent 主目录（`~/.claude`、`~/.codex`、`~/.gemini`、`~/.config/opencode`、`~/.pi`）不存在的位置**跳过并提示**，不做投机性 `mkdir -p` 预建（避免 README 清单外写入；主目录存在而 skills 子目录缺失时可建子目录）

**决策表**（每处独立判定；"正确软链"定义为**解析后目标等于** `~/.agents/skills/herdr-cowork`，非字符串相等）：

| 目标状态 | 默认（`--with-skills`） | 加 `--yes` |
|---|---|---|
| `~/.agents/skills/herdr-cowork` 不存在 | 复制安装 | 同左 |
| 存在且 SKILL.md 字节一致（`cmp`；目录内多余文件不参与判定、也不被删除） | 报 "up to date" | 同左 |
| 存在但内容不同 | 保留，提示可 `--yes` 覆盖 | 覆盖为仓库副本（`cp` 覆盖 SKILL.md，不动目录内其他文件） |
| 是**软链**（指向用户 dotfiles 等） | **保留 + 提示，`--yes` 也不动** | 同左（防穿透写/毁链） |
| 软链位置：不存在 / **断链**（`-L` 且 `! -e`） | 建软链（`ln -sfn`，断链先替换） | 同左 |
| 软链位置：解析后指向正确目标 | 不动，报 "up to date" | 同左 |
| 软链位置：软链但解析后指向别处 | 保留，提示 | 重建为正确软链 |
| 软链位置：真实目录（用户自装） | 保留，明确提示 | **`rm -rf` 后建软链**（比 mods 的 rsync 覆盖更具破坏性，README 明示） |

**`--yes` 语义**：逐位置独立生效——仅对"内容不同/错向软链/真实目录"三种状态动手，已正确的位置连 `--yes` 也不重建。`~/.agents` 目标是软链时永远不动。

### 3. 文档

- `README.md`：
  - Install 段：L29 既有括注 `--yes overwrites mods and the layout you already have` **必须扩写**，如实说明 `--with-skills --yes` 会删除五处软链位置上用户自装的非软链目录；加 `--with-skills` 一行说明与手工卸载步骤（删一副本五软链）
  - 新增 **"Skills (opt-in)"** 小节（或并入 "What this runs"）披露两面：**安装面**（1 副本 + 5 软链的位置清单、跳过未装 agent 规则）；**运行期执行面**——启用后 agent 按 SKILL.md 经 `hc` 拉起成员 CLI（claude/codex/pi 等在各自权限流下运行）、在当前工作区写 TEAM.md、`herdr-app` 改 tab 名。这是比现有任何条目都大的新增执行面，必须写明
- `THIRD_PARTY.md`：新增条目——作者 ninehills、gist URL、上游版本 v1.1.0、License 列写 **"none stated"**、本地修改：frontmatter `name` 字段（cowork → herdr-cowork）
- `NOTICE`：为 vendored SKILL.md 增加署名行（与仓内其他 bundled 组件同级披露）

### 4. 上游更新流程

README "Updating this repo" 段加一句：上游 gist 更新时，维护者拉原文、改 `name` 字段后替换 `skills/herdr-cowork/SKILL.md` 提交；已装用户重跑 `sh install.sh --with-skills --yes` 升级（软链指向目录，自动跟随副本更新）。

## 错误处理

`install.sh` 顶部 `set -e`——skill 环节**每条命令**须 `|| { echo …; }` 守卫（仿 CLI 环节 L128 先例），任何单点失败不中断整体安装：

- **复制失败**（磁盘/权限）：跳过**全部**建链（否则产出五个 agent 都会列为坏 skill 的断链），输出一条 skill 整体失败汇总
- 单处建链失败：逐条报错，继续其余位置
- 仓库缺 SKILL.md：前置 `exit 1`（见上），不留半成品

## 验收

临时 `$HOME` 验证（`HOME=/tmp/orca-test`）；为避免 CLI 环节的 go build/GitHub 下载噪音与联网，先在 PATH 放一个 `herdr-automations` stub 触发"already installed"分支，或明示接受该噪音：

1. `sh -n install.sh` 语法通过
2. 不带 `--with-skills`：全程无 skill 相关动作与输出
3. `--with-skills --dry-run`：**报告可达**（判定在 dry-run 门之前），报告"将安装"，实际零写入
4. `--with-skills` 全新安装（预建五个 agent 主目录）：副本与仓库 `cmp` 一致；五处软链 `readlink` 解析后均指向 `~/.agents/skills/herdr-cowork`（含 OpenCode/pi 3 级相对路径）
5. 某个 agent 主目录缺失（如删掉临时 `~/.gemini`）：该位置跳过 + 提示，其余四照装
6. 重复执行：全部 "up to date"，幂等
7. 篡改已装副本后重跑：保留 + 提示；`--with-skills --yes` 后恢复仓库副本；已正确软链在 `--yes` 下**不被重建**
8. 断链场景：删掉 `~/.agents/skills/herdr-cowork` 实体后重跑：五处断链被 `ln -sfn` 正确替换，不报 EEXIST
9. `~/.agents/skills/herdr-cowork` 是软链（链到别处）：默认与 `--yes` 均保留 + 提示
10. 软链位置放真实目录：默认保留提示；`--yes` 后被 `rm -rf` 换软链（任选一处验证）
11. README（含 L29 括注、"Skills" 小节）、THIRD_PARTY（License="none stated"）、NOTICE 更新到位
12. （可选抽验，真机）`claude`、`gemini` 各自的 skills 列表命令能发现 herdr-cowork

## 审查记录

2026-11-16 两遍独立审查（事实正确性 / 健壮性与产品面），合计 0 BLOCKER、9 MAJOR、16 MINOR，全部核验后并入本稿。关键修正：`~/.agents/skills` 为五家原生扫描根（Codex 弃用路径、DSH 源码实锤）；dry-run 门时序约束；决策表补断链/软链两行；`--yes` 破坏半径显性化；运行期执行面披露。两遍审查中 Pass 2 的"allowed-tools 是 Claude 专属"说法被 Pass 1 以 agentskills.io 规范证伪（标准化可选字段，非 Claude agent 忽略之，仅无预授权），取后者。
