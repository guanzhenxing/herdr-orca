// Better Sidebar: spaces, agents, a footer and a right panel toggle. A layout puts
// one copy per block, and `view` in its props picks which part it draws.
import { View } from "gpui-kit";
import { props, shared, setShared } from "herdr";
import { Spaces } from "./views/spaces.js";
import { Agents } from "./views/agents.js";
import { Footer } from "./views/footer.js";
import { PanelToggle } from "./views/panel-toggle.js";
import { Card } from "./views/card.js";
import { Groups } from "./views/groups.js";
import { Note } from "./views/notes.js";

const PARTS = { agents: Agents, footer: Footer, "panel-toggle": PanelToggle, card: Card, groups: Groups, note: Note };

export default class BetterSidebar extends View {
  init(given, cx) {
    // One-time rename migration (orca → oh-my-herdr): carry the saved groups
    // and space parents over to the new shared keys, then clear the old ones.
    if (shared("oh-my-sidebar.migrated") == null) {
      for (const k of ["groups", "space-parents"]) {
        const old = shared(`orca-sidebar.${k}`);
        if (old != null) setShared(`oh-my-sidebar.${k}`, old);
        setShared(`orca-sidebar.${k}`, null);
      }
      setShared("oh-my-sidebar.migrated", true);
    }
    // Sweep the runtime states the old views wrote while both folders were
    // loaded: transient, nothing to carry over — null them and be done.
    if (shared("oh-my-sidebar.sweep") == null) {
      for (const k of ["space-order", "card-live", "inline-agents", "hover"]) setShared(`orca-sidebar.${k}`, null);
      setShared("oh-my-sidebar.sweep", true);
    }
    const Part = PARTS[props()?.view] ?? Spaces;
    this.part = new Part();
    this.part.init(given, cx);
  }

  render(cx) {
    return this.part.render(cx);
  }
}
