# herdr-cowork skill 集成设计

日期：2026-11-16
状态：已确认（与用户逐节过审）

## 背景

[ninehills 的 cowork skill](https://gist.github.com/ninehills/eef70810238f779362a820786ae4a096)（v1.1.0）是一份多 Agent 协作流程协议：让运行在 Herdr 终端里的任一 CLI agent（claude/pi/codex）担任 Commander，通过 `hc` CLI 启动、委派、核验、清理成员 agent，以 TEAM.md 为共享注册表。它编排 agent，而 herdr-orca 可视化 agent——两者互补。

前置决策（2026-11-10 会话，a0fb882b）：

- 改名 `cowork` → `herdr-cowork`：skill 装入跨工具共享目录后，名字必须自带 Herdr 边界（`allowed-tools` 只放行 `hc`/`herdr-app`）
- 安装位置遵循本机既有软链模式：实体在 `~/.agents/skills/`，软链到 `~/.claude/skills/`、`~/.codex/skills/`

本设计由维护者拍板的两个关键决策：

1. **SKILL.md 直接入库**（vendor），不在安装时从 gist 拉取。上游 gist 无许可证声明，维护者评估后认为入库无许可风险；入库后安装环节是纯本地复制，无网络依赖、无 sed 改名脆弱性。
2. **可选安装**：默认不装，`--with-skills` 才装。写入面从 `~/.config/herdr-app/` 扩大到全局 agent 配置（`~/.agents`、`~/.claude`、`~/.codex`），对用户保守，符合发行包"透明、不越界"的调性。

## 目标

1. 仓库新增 `skills/herdr-cowork/`，随 git 版本化、PR 可审
2. `install.sh --with-skills` 把 skill 装到用户机器，语义与现有 mods 环节一致
3. README 与 THIRD_PARTY.md 如实记录安装面与致谢

## 非目标

- Orca mod / Team 面板（读取 TEAM.md 的 UI 支持）——Phase 2 另议
- 修改 `sync.sh`（它同步 Herdr home 里的布局/mods；skill 源头是 gist，不是本地安装副本）
- pi 的 skill 发现机制适配（未核实，不做软链）
- 上游更新的自动化脚本（单文件，README 记手动流程即可）

## 设计

### 1. 仓库内容

```
skills/
└── herdr-cowork/
    └── SKILL.md    ← gist v1.1.0 全文；入库时一次性将 frontmatter 的
                       name: cowork 改为 name: herdr-cowork，其余逐字保留
```

### 2. install.sh

- usage 注释新增 `--with-skills` 说明；flag 解析 case 加入 `--with-skills)`
- 新环节置于 herdr-automations CLI 环节之后、收尾提示之前，仅在 `--with-skills` 时执行
- 动作：
  1. `mkdir -p ~/.agents/skills/herdr-cowork`，复制仓库内 `skills/herdr-cowork/SKILL.md`
  2. 创建软链 `~/.claude/skills/herdr-cowork` 与 `~/.codex/skills/herdr-cowork`，目标 `../../.agents/skills/herdr-cowork`
- 决策表（每个位置独立判定）：

| 目标状态 | 默认（`--with-skills`） | 加 `--yes` |
|---|---|---|
| `~/.agents/skills/herdr-cowork` 不存在 | 复制安装 | 同左 |
| 存在且内容与仓库副本一致 | 报 "up to date" | 同左 |
| 存在但内容不同 | 保留用户版本，提示可 `--yes` 覆盖 | 覆盖为仓库副本 |
| 软链位置：不存在 | 建软链 | 同左 |
| 软链位置：已是指向正确目标的软链 | 不动，报 "up to date" | 同左 |
| 软链位置：软链但指向别处 | 保留，提示 | 重建为正确软链 |
| 软链位置：真实目录（用户自有安装） | 保留，明确提示 | 覆盖（沿用 mods 目录在 `--yes` 下被覆盖的既有语义） |

- `--dry-run`：只报告上述判定结果，不写任何东西
- 软链的建立**不依赖** `~/.agents` 副本的判定结果（用户保留自有版本时，软链照常确保指向它——`~/.agents/skills` 本就是共享位置，暴露是用户装它的本意）
- `--yes` 的组合语义（已确认）：覆盖 `~/.agents` 里的副本 **且** 重建两处软链；没有第三种隐式行为

### 3. 文档

- `README.md`：
  - Install 段加一行：`--with-skills` 会同时安装 herdr-cowork skill（写入哪些位置、如何卸载）
  - "What this runs" 的 Files 段如实列出 `--with-skills` 写入的三个位置；skills 为本地复制，Network 段不变
- `THIRD_PARTY.md`：新增致谢条目——作者 ninehills、gist 来源 URL、上游版本 v1.1.0、本地修改仅 frontmatter `name` 字段（cowork → herdr-cowork）

### 4. 上游更新流程

README 的 "Updating this repo" 段加一句：上游 gist 更新时，维护者拉取原文、改 `name` 字段后替换 `skills/herdr-cowork/SKILL.md` 并提交。不建自动化脚本。

## 错误处理

- 复制失败（磁盘/权限）：报错并继续安装其余部分（skill 是可选件，同 CLI 环节的优雅降级风格）
- 软链创建失败（如 `~/.claude/skills/` 无法创建）：逐条报错，不中断
- 入库校验：`name: herdr-cowork` 字段由 vendor 时人工保证；install 不再运行时校验（无 sed 即无格式漂移面）

## 验收

以临时 `$HOME`（如 `HOME=/tmp/orca-test sh install.sh …`）验证，不动真实环境：

1. `sh -n install.sh` 语法通过
2. 不带 `--with-skills`：全程无 skill 相关动作与输出
3. `--with-skills --dry-run`：报告"将安装"，实际零写入
4. `--with-skills` 全新安装：副本内容与仓库一致（`diff`）；两处软链存在且 `readlink` 指向正确
5. 重复执行：报 "up to date"，幂等
6. 篡改已装副本后重跑：保留 + 提示；`--with-skills --yes` 后恢复为仓库副本、软链重建
7. 在软链位置放真实目录：默认保留提示，`--yes` 后被覆盖为软链
8. README 与 THIRD_PARTY.md 更新到位
