# Spiral v1.0.1 🌀

A small update adding finer control over the Explorer connection list.

---

## 🔍 Explorer

- **Connection status filter** — the connection list filter panel (sliders icon) now has a **Status** section with two options:
  - **Online** — show only currently connected connections.
  - **Offline** — show only connections that are not connected (disconnected, connecting, or error).

  The options are mutually exclusive: selecting one deselects the other, and clicking the already-selected option clears it to show all connections regardless of state. Status is combined (ANDed) with the existing **Provider** and **Environment** filters.

- **Sort by connection status** — the sort panel gains a **Status** option that groups the connection list into **Online** and **Offline** sections.

- **Reorder tabs by drag-and-drop** — drag any editor tab onto another to drop it at that position; the dragged tab dims and the drop target shows a colored indicator on its left edge. Reordering doesn't change which tab is active or open.

## 🧭 Navigation

- **Profile in the title bar** — when the side navigation bar is hidden, the user profile button now moves up to the title bar instead of disappearing. On Windows and Linux it sits just left of the window control buttons; on macOS it sits just left of the Spiral logo. Click it to jump straight to **User Profile** settings.

## ⚙️ Settings

- **Show Grid Lines** moved from *Appearance* to *Results View Config → Table Options*, and fixed — the toggle now actually draws row/column borders in the Query Results table (it previously had no effect). The lines also use a stronger, more visible color across all themes.

---

Thanks for using Spiral! 🙌
