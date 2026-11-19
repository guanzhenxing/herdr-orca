// Agent Handoff: 移交给另一个代理. Start a new agent session from the progress
// of one that is running, in the same folder; the original session stays as it
// is. Opened with props { terminal } from the terminal menu, or bare — then the
// focused terminal is the source.
//
// Phase 1 reads Claude Code sessions only (helpers/session.cjs); other sources
// hand off with the workspace state alone. The brief tells the new agent where
// the original session lives, so it reads earlier detail itself when needed —
// no summarizer of our own.
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { checking, props, focused, terminals, panes, spaces, agents, knownAgents, exec as runProg, appHome, readTextFile, run, closeOverlay, theme } from "herdr";

const APP_KEY = { "claude-code": "claude", codex: "codex", pi: "pi", opencode: "opencode", gemini: "gemini" };
const MODES = [
  { id: "focused", name: "聚焦续接（推荐）", hint: "带最新进展和当前工作区，原会话文件留在 brief 里，仅在需要时读取" },
  { id: "full", name: "完整历史", hint: "让新 agent 先通读原会话记录再动手，适合交接面很大的任务" },
];

const trim = (s, n) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const bytes = (n) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const clock = (iso) => (iso ? iso.slice(5, 16).replace("T", " ") : "");

export default class AgentHandoff extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.mode = "focused";
    this.pick = null;
    this.agents = [];
    this.session = null;
    this.git = null;
    const address = p.terminal ?? focused()?.terminal ?? null;
    const term = terminals().find((x) => x.address === address) ?? null;
    this.cwd = term?.cwd ?? focused()?.cwd ?? panes().find((q) => q.terminal === address)?.cwd ?? null;
    // terminals() entries are untyped; agents() and panes() carry app for sure.
    this.sourceApp = agents().find((a) => a.address === address)?.app
      ?? panes().find((q) => q.terminal === address)?.app
      ?? term?.app ?? null;
    this.error = !address ? "先聚焦要移交的终端，再打开这个面板"
      : (address.includes("/") ? "远程终端暂不支持（会话文件在另一台机器上）"
      : !this.cwd ? "这个终端还没有工作目录" : null);
    this.space = this.spaceOf(address) ?? focused()?.space ?? null;
    if (checking()) return;
    if (!this.error) {
      this.loadAgents(cx);
      this.loadSession(cx);
      this.loadGit(cx);
    }
  }

  // The space a terminal belongs to: its pane's tab, that tab's space.
  spaceOf(address) {
    const pane = panes().find((p) => p.terminal === address);
    if (!pane) return null;
    const s = spaces().find((s) => (s.tabs ?? []).some((tab) => tab.id === pane.tab));
    return s?.id ?? null;
  }

  async loadAgents(cx) {
    try {
      const all = await knownAgents();
      // Classify each icon once: a missing file becomes null (letter tile);
      // a white or currentColor glyph is drawn theme-tinted with svg() —
      // image() would put a white shape on this light card and lose it.
      const withIcons = await Promise.all(all.map(async (a) => {
        if (!a.icon) return { ...a, icon: null, tint: false };
        const text = await readTextFile(`${appHome()}/${a.icon}`).catch(() => null);
        if (text == null) return { ...a, icon: null, tint: false };
        return { ...a, tint: /fill="#fff"|fill="white"|currentColor/i.test(text) };
      }));
      const installed = withIcons.filter((a) => a.installed).sort((a, b) => a.name.localeCompare(b.name));
      const missing = withIcons.filter((a) => !a.installed).sort((a, b) => a.name.localeCompare(b.name));
      this.agents = [...installed, ...missing];
      const src = APP_KEY[this.sourceApp ?? ""] ?? null;
      const hit = this.agents.find((a) => a.installed && a.key === src) ?? this.agents.find((a) => a.installed);
      this.pick = hit?.key ?? null;
    } catch (e) {
      this.agentError = String(e?.message ?? e);
    }
    cx.notify();
  }

  // One program glyph: letter tile when there is no usable file, theme-tinted
  // svg for white/currentColor glyphs, the program's own tile color under a
  // white-on-tile icon, plain image otherwise.
  programIcon(a, t) {
    if (!a.icon) {
      return div().size(14).rounded(4).bg(t.raised).flex_none().flex().items_center().justify_center()
        .text_size(9).text_color(t.muted).child((a.name?.[0] ?? "?").toUpperCase());
    }
    if (a.tint) return svg(a.icon).size(14).flex_none().text_color(t.muted);
    if (a.tile) {
      return div().size(14).rounded(4).flex_none().flex().items_center().justify_center().bg(a.tile)
        .child(image(a.icon).size(10));
    }
    return image(a.icon).size(14).flex_none();
  }

  async loadSession(cx) {
    try {
      const r = await runProg("node", [`${appHome()}/mods/agent-handoff/helpers/session.cjs`, this.cwd], { timeout: 20000 });
      this.session = JSON.parse((r.stdout ?? "").trim().split("\n").pop() || "{}");
    } catch (e) {
      this.session = { ok: false, reason: String(e?.message ?? e) };
    }
    cx.notify();
  }

  async loadGit(cx) {
    const g = (args) => runProg("git", ["-C", this.cwd, ...args], { timeout: 8000 }).catch(() => null);
    const [branch, status, stat] = await Promise.all([
      g(["branch", "--show-current"]),
      g(["status", "--porcelain"]),
      g(["diff", "--shortstat"]),
    ]);
    this.git = {
      branch: branch?.stdout.trim() || null,
      changes: (status?.stdout ?? "").split("\n").filter(Boolean).length,
      diff: trim(stat?.stdout, 120) || null,
    };
    cx.notify();
  }

  // The brief the new agent starts with. Focused: the ends of the conversation
  // plus the workspace, with the session file for anything earlier. Full: read
  // the whole session first. No session: workspace only, ask the person.
  brief() {
    const s = this.session, g = this.git;
    const source = this.sourceApp ?? "上一个 agent";
    const ws = `工作区: ${this.cwd}${g?.branch ? `（分支 ${g.branch}` : ""}${g?.changes ? `，${g.changes} 个未提交变更${g?.diff ? `：${g.diff}` : ""}）` : g?.branch ? "）" : ""}`;
    if (!s?.ok) {
      return [`[移交] 接手 ${source} 在这个目录里进行中的工作（原会话不可读：${s?.reason ?? "不支持读取该 agent 的会话"}）。`,
        ws,
        "先查看工作区当前状态（git status / git diff），向用户确认任务目标后继续。"].join("\n");
    }
    if (this.mode === "full") {
      return [`[移交] 接手 ${source} 进行中的任务。`,
        `先用工具通读原会话记录 ${s.file}（JSONL，一行一个 JSON，user/assistant 交替），完整了解此前进展，不要凭空猜测。`,
        s.firstUser ? `最初任务: ${s.firstUser}` : null,
        ws,
        "读完原会话后核对当前状态（git status / git diff），继续完成任务。"].filter(Boolean).join("\n");
    }
    return [`[移交] 接手 ${source} 进行中的任务，继续在同一目录完成。`,
      `原会话: ${s.file}（完整历史，需要更早细节时直接读它）`,
      s.firstUser ? `最初任务: ${s.firstUser}` : null,
      s.lastUsers?.length ? `最近进展（原 agent 最近的指令）:\n${s.lastUsers.map((u, i) => `${i + 1}. ${u}`).join("\n")}` : null,
      s.lastAssistant ? `最后交底: ${s.lastAssistant}` : null,
      ws,
      "先核对当前状态（git status / git diff），再继续完成任务。"].filter(Boolean).join("\n");
  }

  launch(cx) {
    const a = this.agents.find((x) => x.key === this.pick);
    if (!a?.installed || !this.cwd) return;
    const task = this.brief();
    closeOverlay(props()?.overlay);
    run("tab.new", { name: a.name, ...(this.space ? { space: this.space } : {}), argv: a.run, folder: this.cwd, task });
  }

  render(cx) {
    const t = theme(), p = props() ?? {};
    const s = this.session, g = this.git;
    const ready = this.pick && this.agents.find((x) => x.key === this.pick)?.installed;
    return v_flex().id("agent-handoff").size_full().p(16).gap(12).bg(t.canvas).text_size(12.5).text_color(t.foreground)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().text_size(15).font_semibold().child("移交给另一个代理"))
        .when(p.overlay, (r) => r.child(div().id("ah-close").size(24).rounded(6).flex().items_center().justify_center().text_color(t.dim)
          .cursor_pointer().hover((h) => h.bg(t.hover)).on_click((_e, c) => closeOverlay(p.overlay)).child("✕"))))
      .child(div().text_color(t.dim).child("从当前进度启动一个新的代理会话，原会话保持不变"))
      .when(this.error, (r) => r.child(div().p(10).rounded(8).bg(t.raised).text_color(t.blocked).child(this.error)))
      .when(!this.error, (r) => r
        // ---- 原会话 ----
        .child(v_flex().gap(3).p(10).rounded(8).bg(t.raised)
          .child(div().font_semibold().child(s === null ? "正在读取原会话…" : s?.ok ? `原会话 ${s.id.slice(0, 8)} 可读` : "原会话不可读"))
          .child(div().text_size(11).text_color(s?.ok ? t.dim : t.blocked)
            .child(s === null ? `${this.sourceApp ?? ""} ${this.cwd}`
            : s.ok ? `${this.sourceApp ?? "Claude Code"} · ${bytes(s.bytes)} · ${clock(s.startedAt)} → ${clock(s.lastAt)}`
            : s.reason)))
        // ---- 代理 ----
        .child(div().font_semibold().text_size(13).child("代理"))
        .when(this.agentError, (r) => r.child(div().text_size(11).text_color(t.blocked).child(this.agentError)))
        .child(v_flex().gap(2).overflow_y_scrollbar().max_h(150).children(this.agents.map((a) =>
          h_flex().id(`ag-${a.key}`).gap(8).items_center().px(8).h(30).rounded(6)
            .when(this.pick === a.key, (e) => e.bg(t.selected))
            .hover((h) => h.bg(t.hover))
            .cursor_pointer()
            .on_click((_e, c) => { if (a.installed) { this.pick = a.key; c.notify(); } })
            .child(this.programIcon(a, t))
            .child(div().flex_1().truncate().text_color(a.installed ? t.foreground : t.dim).child(a.name))
            .child(div().text_size(10.5).text_color(t.dim).child(a.installed ? a.key : "未安装")))))
        // ---- 上下文 ----
        .child(div().font_semibold().text_size(13).child("上下文"))
        .child(v_flex().gap(2).children(MODES.map((m) =>
          v_flex().id(`md-${m.id}`).gap(1).px(8).py(6).rounded(6)
            .when(this.mode === m.id, (e) => e.bg(t.selected))
            .hover((h) => h.bg(t.hover))
            .cursor_pointer()
            .on_click((_e, c) => { this.mode = m.id; c.notify(); })
            .child(h_flex().gap(8).items_center()
              .child(div().size(12).rounded(6).border(1).border_color(this.mode === m.id ? t.accent : t.input).flex().items_center().justify_center()
                .when(this.mode === m.id, (e) => e.child(div().size(6).rounded(3).bg(t.accent))))
              .child(div().child(m.name)))
            .child(div().text_size(11).text_color(t.dim).pl(20).child(m.hint)))))
        // ---- 启动目录 + 按钮 ----
        .child(div().flex_1())
        .child(h_flex().gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(`启动目录：${this.cwd ?? ""}${this.space ? "" : "（当前 space）"}${g?.branch ? ` · ${g.branch}${g.changes ? ` · ${g.changes} 个未提交变更` : ""}` : ""}`))
          .child(div().id("ah-cancel").px(12).py(6).rounded(7).cursor_pointer().hover((h) => h.bg(t.hover)).on_click((_e, c) => closeOverlay(p.overlay)).child("取消"))
          .when(ready, (r) => r.child(div().id("ah-go").px(14).py(6).rounded(7).bg(t.accent).text_color(t.accent_foreground).font_semibold()
            .cursor_pointer().hover((h) => h.bg(t.done)).on_click((_e, c) => this.launch(c)).child("启动新会话")))));
  }
}
