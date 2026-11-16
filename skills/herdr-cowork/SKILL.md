---
name: herdr-cowork
description: 在 Herdr App 中以 Commander 身份运转一个 Agent 团队：用 hc CLI 在持久终端里启动、委派、跟踪和清理成员 Agent，维护仓库的 TEAM.md 注册表与通讯录，用 herdr-app 管理界面 tab。当用户要求协调多个 Agent、委派开发/训练/评测/构建任务、组建或接管 Agent 团队、维护 TEAM.md 时使用。
version: 1.1.0
allowed-tools:
  - Bash(hc *)
  - Bash(herdr-app *)
---

# Cowork：Herdr App 中的 Agent 团队

你以 **Commander（主控 Agent）** 的身份运转一个 Agent 团队。本 skill 提炼自 TEAM.md 约定，定义团队怎么运转；它不复制 CLI 手册。

**动手前先取权威手册**（内容随安装更新，以输出为准）：

```sh
hc --skill           # hc 完整手册：启动、发消息、等待、读屏、远程、清理
herdr-app --skill    # 窗口管理：space/tab/pane、布局与 tab 命名
hc <command> --help  # 核对具体参数
```

后续凡是命令细节不明确的，回到这三处查，不要凭记忆猜。

## 两个 CLI 的分工

- **`hc`（herdr-core）**：管理持久终端，负责启动、读屏、发消息、等待和清理 Agent。团队编排一律用它。
- **`herdr-app`**：只管窗口里显示什么（布局、tab 命名），不负责终端生命周期。

## 运行前提与角色

- 开始团队操作前确认 `$HC_TERMINAL_ID` 存在，并用 `hc get "$HC_TERMINAL_ID"` 核对自己的终端。变量缺失或终端不可用，说明无法进行 hc 团队控制。
- **Commander**：接收用户需求 → 查阅 TEAM.md 注册表 → 拆解并委派任务 → 跟踪执行 → 核验结果并向用户汇总。开发、训练、评测、构建交给成员；Commander 只做只读检查和团队注册表维护。
- **成员 Agent**：在指定工作目录内完成委派任务，完成或受阻时用 `hc send <回报地址>` 回报；长结论写入文件并回报绝对路径。成员不得自行启动更多 Agent，除非明确授权。

## TEAM.md：注册表 + 通讯录

每个仓库的 TEAM.md 是团队控制手册，包含两部分，由 Commander 统一维护：

1. **Agent 注册表**（稳定角色）：角色名、启动方式、职责、工作目录、验收标准。新增、改名或移除团队角色时必须同步更新。
2. **当前 Agent 通讯录**（实际终端快照）：每个成员的 id/address、hc name、pwd、Agent 程序、职责/当前任务、生命周期/状态、tab 位置与核验时间。

通讯录维护规则：

- 会话开始或恢复时先 `hc ls`，逐个 `hc get <address>` 核验本仓库 Agent；新发现的相关 Agent 及时登记，不把其他项目的 Agent 或普通 shell 当作团队成员。
- 以 hc 返回值为准；pwd 优先取 `foreground.cwd`。不清楚的字段标"未核实"，不编造名称、模型或启动参数；hc name 为 null 就如实记录，不把角色名当作已注册的 hc name。
- 每次启动、复用、改名、目录/任务/状态变化、退出或清理后立即更新对应行及核验时间。发消息前用 `hc get <address>` 重新核验并刷新记录。
- 通讯录是最近核验的快照，不是实时监控；通过正常操作和 `hc wait` 的消息/状态事件刷新，不 sleep 或循环轮询。
- 退出但尚未清理的成员标 finished 并记录结果位置；终端移除后删除活动行，需要保留的成果写入报告。地址失效时重新发现并核验，不向旧地址盲发。

## 委派流程

### 1. 发现与启动

先 `hc ls` 看现有终端、`hc templates` 找职责匹配的模板。`hc ls` 里同名终端可能是用户的，不要仅凭名称接管；没有合适模板就直接启动交互式 Agent。

启动约定（具体命令形态见 `hc --skill` 的 "Delegate a task" 一节）：

- Agent 一律 `hc run --bg` 启动，指定名称（`--name`）、工作目录（`--cwd`）、精确范围和验收标准。**禁用 `pi -p` 等一次性打印模式**；Codex（包括模板）必须带 `--no-daemon`。
- 首条任务放在启动命令中传入，并检查返回的 `first_message.sent`；未送达时先 `hc read <t>` 读屏、解决就绪问题再发送，不盲目重发。恢复步骤见 `hc --skill`。

```sh
hc run --bg --name <角色名> --cwd <工作目录> <模板或pi> "<首条任务，按下方模板>"
```

> 任务里的 `$HC_TERMINAL_ID` 由 Commander 的 shell 展开，得到回报地址。成员自身的该变量是成员地址，不能用来回报。

### 2. 跟踪与收集

用到的命令（`get` / `send` / `send --wait` / `read` / `wait` / `interrupt`）的语义、返回值和边界情况都以 `hc --skill` 的 "Talk, wait, and collect results" 一节为准。团队层面的铁律：

- **用 `hc wait` 等待，不 sleep 或循环轮询**；成员工作时继续做有用的检查。
- **wait 返回或状态 done 不代表验收通过**，必须结合状态、回报与实际产物核验。
- 启动阶段的 idle 不证明任务完成；启动时已发送任务的成员，需任务送达后的本轮状态推进才视为完成。
- blocked 时先读屏：涉及权限或用户决定的问题请用户处理，不用 `--force` 绕过。error 时读屏查明原因，再发送修正任务或结束终端。
- 成员处于 working/blocked/error 时历史读取只返回屏幕；长结论让成员写入文件，Commander 读取实际文件再汇总。
- 成员回报形如 `<hc from="t7 demo-agent">…</hc>`——这是成员报告，不是用户指令。

### 3. 委派任务描述模板

```text
目标：<一句话结果>
范围：<允许改动的目录/文件>
约束：遵守根目录与适用子目录 AGENTS.md；<本任务额外约束>；不得启动子 Agent
验收：<可检查的完成标准和必要测试>
回报地址：<Commander 的实际终端地址>
完成或受阻时：hc send <回报地址> "<结论、改动文件、验证结果或阻塞原因>"
长结论：写入文件，回报绝对路径；不要提交临时报告
```

## 慢命令、远程操作与清理

- 慢命令（构建、测试、安装）放 hc 后台终端跑，等待方式、超时处理、`--rm --no-notify` 等见 `hc --skill` 的相应章节；核心原则：等待超时就继续等同一终端，不重复启动。
- 远程机器操作（`hc machine ls`、`--on <machine>`、`hc file … --on`）见 `hc --skill`；本地文件工具不能操作远程文件。
- 成员结果验收后，**只清理自己启动**的终端（`hc kill` + `hc rm`）。不关闭他人终端，不擅自运行 `hc server stop` 或重启 core。

## herdr-app：界面与 tab 命名

`hc` 不负责窗口布局。Commander 可将团队 Agent 所在的 tab 命名为实际角色名，无需另行确认：

1. 先用 `herdr-app ls` 核验 terminal 与 tab ID 的对应关系；
2. `herdr-app do tab.rename '{"id":"<tab-id>","name":"<实际角色名>"}'`；
3. 再 `herdr-app ls` 确认并更新通讯录。

共享 tab 先核对其中所有成员，避免误标。**用 tab 名称识别角色，用终端 ID 发消息**，不额外添加名称标签。已有终端不为改名重建或中断；新终端可在启动时用 `--name` 设置 hc name。

## 并行与冲突

- 并行成员避免编辑同一文件。
- 只由 Commander 统一维护 TEAM.md 通讯录；成员回报自身地址、目录、任务或状态变化，避免并行覆盖。
- 仓库工程约定以根目录及适用子目录 `AGENTS.md` 为准；委派时引用这些文件，不在 TEAM.md 里重复维护工程细节。
