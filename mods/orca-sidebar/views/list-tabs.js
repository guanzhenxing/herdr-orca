// The sidebar's Spaces/Agents tab bar, drawn by each view's header. The layout's
// "sidebar-lists" stack shows one list at full height, and a view only renders while
// it is the active child, so each header draws the same tabs with itself selected.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, layout } from "herdr";
import { findNode } from "./find-node.js";
import { Icon, TEXT } from "./ui.js";

const STACK = "sidebar-lists";
const TABS = [
  ["spaces", "folder", "Spaces"],
  ["agents", "bot", "Agents"],
];

// The tab the stack is showing right now ("spaces" before the first switch).
export const activeListTab = () => findNode(layout(), STACK)?.active ?? "spaces";

export function ListTabs({ active, collapsed = false }) {
  const t = theme();
  return h_flex().gap(2).items_center().children(
    TABS.map(([id, icon, label]) => {
      const on = active === id;
      return h_flex()
        .id(`list-tab-${id}`)
        .h(26)
        .gap(5)
        .flex_none()
        .items_center()
        .rounded(6)
        .text_size(TEXT.caption)
        .cursor_pointer()
        .when(collapsed, (el) => el.w(26).justify_center().px(0))
        .when(!collapsed, (el) => el.px(7))
        .when(on, (el) => el.bg(t.hover).text_color(t.foreground))
        .when(!on, (el) => el.text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)))
        .accessibility_label(label)
        .tooltip(label)
        .on_click(() => run("layout.select", { stack: STACK, child: id }))
        .child(Icon(icon, 13))
        .when(!collapsed, (el) => el.child(div().child(label)));
    }),
  );
}
