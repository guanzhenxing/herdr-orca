// The sidebar's last lines, as Herdr's own footer: Settings (with the agents count
// while agents show in spaces) and Add machine. The Agents panel itself has one
// switch, the header's Agents chip — a footer toggle here would ignore the inline
// state and could show agents twice (or hide both).
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, updates, layout } from "herdr";
import { findNode } from "./find-node.js";
import { IconButton } from "./ui.js";
import { inlineAgents, readAgents, tally, subTree, allSpaceIds } from "./space-agents.js";
import { kidStatus } from "./agents.js";

export class Footer {
  init() {}

  render() {
    const t = theme();
    const collapsed = (findNode(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
    const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
      .text_color(dim ? t.dim : t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
      .on_click(action).child(svg(`mods/workspace-chrome/${icon}.svg`).size(14).flex_none())
      .when(!collapsed, (el) => el.child(div().child(label)));
    return v_flex().id("sidebar-footer").size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(4).pb(8).text_size(13)
      .child(h_flex().items_center()
        .child(row("settings", "settings", "Settings", false, () => run("app.settings")).flex_1().min_w(0)
          .when(Boolean(updates().app.ready), (el) => el.child(div().size(6).rounded_full().bg(t.accent))))
        // Mod settings (Better Config) lives beside Settings now, not in the nav above.
        .child(IconButton({
          id: "mod-settings",
          icon: "sliders",
          label: "Mod settings",
          iconSize: 14,
          muted: true,
          onClick: () => run("mod.open", { name: "better-config" }),
        }))
        .when(inlineAgents() && !collapsed, (el) => el.child(this.summary(t))))
      .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
  }

  // "6 agents · 3 need you" while agents show in spaces; the orange part goes to the first.
  summary(t) {
    const view = readAgents();
    const { count, blocked } = tally(view, allSpaceIds());
    if (!count) return div();
    return h_flex().flex_none().gap(4).items_center().pr(4).text_size(11.5).text_color(t.dim)
      .child(`${count} agent${count === 1 ? "" : "s"}`)
      .when(blocked > 0, (el) => el.child(div().id("needs-you").font_semibold().text_color(t.blocked).cursor_pointer()
        .tooltip("Go to the first one").on_click(() => this.goToBlocked(view)).child(`· ${blocked} need${blocked === 1 ? "s" : ""} you`)));
  }

  goToBlocked(view) {
    for (const list of view.bySpace.values())
      for (const a of list) {
        if (a.status === "blocked") return run("pane.focus", { pane: a.pane });
        const sub = subTree(view.all, a.address).find((s) => kidStatus(s.t, view.status) === "blocked");
        if (!sub) continue;
        const pane = view.paneOf.get(sub.t.address);
        return pane ? run("pane.focus", { pane }) : run("terminal.peek", { terminal: sub.t.address });
      }
  }
}
