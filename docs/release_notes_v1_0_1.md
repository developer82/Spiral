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

- **Autosave & crash recovery** — Spiral now continuously autosaves the content of query tabs that have unsaved changes to a temporary file. If Spiral closes **unexpectedly** (crash, power loss, or a forced quit), the next launch shows a **Recover Unsaved Documents** dialog listing every document that had unsaved work, each with a checkbox (all selected by default). Restore the ones you want and they reopen as tabs with their unsaved content still marked as modified — a document that came from a file on disk restores under its original name, so saving overwrites that file as expected. Quitting Spiral normally (Cmd+Q or closing the window) clears the temporary data, so the recovery prompt only appears after an actual unclean shutdown and never reappears once you've recovered and quit normally.

## 🔌 Connections

- **Additional users & "Connect As…"** — each connection can now hold extra user accounts alongside its main/default credentials. The Add/Edit Connection dialog gains a **Users** tab where you add, edit, and delete user profiles, each with an optional **Profile Name**, a required **Username**, and an optional **Password**. Right-click a connection and choose **Connect As…** to see a submenu listing the connection's own default user first (labeled `«username» (Default)`), followed by these profiles (shown by profile name, or username when no name is set), plus a **Manage Users** shortcut that opens the dialog straight to the Users tab. Picking an entry connects using its credentials; if no password is saved, the **Enter Password** dialog opens pre-filled with its username, and ticking **Remember password** saves the password (encrypted) back onto that profile — or onto the main connection user for the default entry. If a saved password fails to authenticate, the **Enter Password** dialog reopens showing the login error so you can correct the password and retry. Profile passwords are encrypted at rest exactly like the main connection password. SQLite connections — which have no authentication — don't show **Connect As…**.

- **Users tab redesign** — the connection dialog's **Users** tab now lists profiles in a table (Profile Name, Username, Password, Actions) with hover-reveal Edit and Delete icon buttons, instead of always-editable inline rows. Adding or editing a profile opens a focused Add/Edit User dialog with Save/Cancel, and Save stays disabled until a Username is entered.

- **Connected-as label in the Explorer tree** — a connected connection row now shows the active username in parentheses next to its name (e.g. `My SQL Server (sa)`). Connecting via **Connect As…** with a profile that has a **Profile Name** shows that name instead of the raw username, so you can tell at a glance which account each open connection is using.

- **Enter Password on connect** — opening a connection whose password isn't saved now prompts for credentials instead of silently failing. The **Enter Password** dialog pre-fills the username when one is stored (otherwise you can type it), takes the password, and connects with the entered credentials. Tick **Remember password** to save it (encrypted) so future connects skip the prompt. SQLite connections — which have no authentication — never prompt, and background auto-connect on startup stays silent.

- **PostgreSQL SSL / TLS** — the connection dialog now has an **SSL Mode** dropdown for Postgres connections (`disable`, `allow`, `prefer`, `require`, `verify-ca`, `verify-full`), matching the standard PostgreSQL `sslmode` parameter. For the verify modes you can point at a **CA certificate** file (with a Browse… picker), and any encrypted mode accepts an optional **Server Name (SNI)**. New connections default to `prefer`, so encryption is used automatically when the server supports it. This fixes the `no pg_hba.conf entry for host … no encryption` error when connecting to managed Postgres services such as Aiven, Heroku, Supabase, Neon, and Amazon RDS that require SSL.

## 📊 ERD Diagram

- **Relationship cardinality on connection lines** — each connection in an ERD now shows its relationship type next to the foreign-key column name, using `∞` for a "many" end: `∞:1` (one-to-many), `1:1` (one-to-one, when the FK is also the primary key), `0..∞:1` (optional/nullable FK), and `∞:∞` (many-to-many, detected from junction tables whose primary key is two FK columns). Cardinality is derived from the existing schema — no extra database query.

## 🧭 Navigation

- **Profile in the title bar** — when the side navigation bar is hidden, the user profile button now moves up to the title bar instead of disappearing. On Windows and Linux it sits just left of the window control buttons; on macOS it sits just left of the Spiral logo. Click it to jump straight to **User Profile** settings.

## ⚙️ Settings

- **Show Grid Lines** moved from *Appearance* to *Results View Config → Table Options*, and fixed — the toggle now actually draws row/column borders in the Query Results table (it previously had no effect). The lines also use a stronger, more visible color across all themes.

---

Thanks for using Spiral! 🙌
