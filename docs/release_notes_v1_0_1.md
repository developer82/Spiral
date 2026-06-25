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

- **Duplicate a connection** — right-click any saved connection and choose **Duplicate** to clone all of its settings into a new connection. A small dialog asks for the new name (pre-filled with *"«name» - Copy"*); confirming adds the copy to the list instantly, carrying over the host, port, credentials, and every provider-specific option of the original.

## 🔌 Connections

- **Enter Password on connect** — opening a connection whose password isn't saved now prompts for credentials instead of silently failing. The **Enter Password** dialog pre-fills the username when one is stored (otherwise you can type it), takes the password, and connects with the entered credentials. Tick **Remember password** to save it (encrypted) so future connects skip the prompt. SQLite connections — which have no authentication — never prompt, and background auto-connect on startup stays silent.

- **PostgreSQL SSL / TLS** — the connection dialog now has an **SSL Mode** dropdown for Postgres connections (`disable`, `allow`, `prefer`, `require`, `verify-ca`, `verify-full`), matching the standard PostgreSQL `sslmode` parameter. For the verify modes you can point at a **CA certificate** file (with a Browse… picker), and any encrypted mode accepts an optional **Server Name (SNI)**. New connections default to `prefer`, so encryption is used automatically when the server supports it. This fixes the `no pg_hba.conf entry for host … no encryption` error when connecting to managed Postgres services such as Aiven, Heroku, Supabase, Neon, and Amazon RDS that require SSL.

## 🧭 Navigation

- **Profile in the title bar** — when the side navigation bar is hidden, the user profile button now moves up to the title bar instead of disappearing. On Windows and Linux it sits just left of the window control buttons; on macOS it sits just left of the Spiral logo. Click it to jump straight to **User Profile** settings.

## ⚙️ Settings

- **Show Grid Lines** moved from *Appearance* to *Results View Config → Table Options*, and fixed — the toggle now actually draws row/column borders in the Query Results table (it previously had no effect). The lines also use a stronger, more visible color across all themes.

---

Thanks for using Spiral! 🙌
