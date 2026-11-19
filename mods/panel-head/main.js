// Panel head: Orca-style header for the right panel. The Files / Changes
// segment switches the panel-body stack, the freedraw icon opens Excalidraw,
// ✕ hides the panel. The tab bar's own copies of these buttons are gone —
// panel controls live on the panel, like Orca's right pane header.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, shared, layout } from "herdr";

const find = (n, id) => {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return null;
};

const PANELS = [
  ["files", "Files", "mods/files/file.svg"],
  ["changes", "Changes", "mods/changes/changes.svg"],
];

export default class PanelHead extends View {
  render() {
    const t = theme();
    const body = find(layout(), "panel-body");
    const active = body?.active ?? null;
    const enabled = (shared("workspace.panels") ?? ["files", "changes"])
      .filter((id) => body?.children?.some((c) => c.id === id));
    const seg = (id, label, icon) =>
      h_flex()
        .id(`ph-${id}`)
        .h(24)
        .px(9)
        .gap(6)
        .flex_none()
        .items_center()
        .rounded(6)
        .text_size(12)
        .bg(active === id ? t.selected : t.chrome)
        .text_color(active === id ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover))
        .cursor_pointer()
        .on_click(() => {
          // a stack child switched away from is recorded hidden; show it,
          // select it, then show the panel (same sequence my-tabs used)
          run("layout.select", { stack: "panel-body", child: id });
          run("layout.show", { id });
          run("layout.show", { id: "panel" });
        })
        .child(svg(icon).size(13))
        .child(label);
    const iconBtn = (id, icon, tooltip, fn) =>
      h_flex()
        .id(id)
        .size(24)
        .flex_none()
        .items_center()
        .justify_center()
        .rounded(6)
        .cursor_pointer()
        .text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(tooltip)
        .on_click(fn)
        .child(svg(icon).size(13));
    return h_flex()
      .id("panel-head")
      .size_full()
      .h(30)
      .flex_none()
      .px(8)
      .gap(4)
      .items_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .children(PANELS.filter(([id]) => enabled.includes(id)).map(([id, label, icon]) => seg(id, label, icon)))
      .child(div().flex_1())
      .child(iconBtn("ph-excalidraw", "mods/excalidraw/icons/freedraw.svg", "Open a drawing (⌘⇧E)", () => run("mod.open", { name: "excalidraw" })))
      .child(iconBtn("ph-close", "mods/pane/close.svg", "收起面板 (⌘⇧B)", () => run("layout.hide", { id: "panel" })));
  }
}
