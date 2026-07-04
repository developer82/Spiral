# Spiral v1.0.2 🌀

This release adds multi-user connection support, autosave crash recovery, and richer ERD visualizations.

---

## 🔍 Explorer

- **Autosave & crash recovery** — Spiral now continuously autosaves the content of query tabs that have unsaved changes to a temporary file. If Spiral closes **unexpectedly** (crash, power loss, or a forced quit), the next launch shows a **Recover Unsaved Documents** dialog listing every document that had unsaved work, each with a checkbox (all selected by default). Restore the ones you want and they reopen as tabs with their unsaved content still marked as modified — a document that came from a file on disk restores under its original name, so saving overwrites that file as expected. Quitting Spiral normally (Cmd+Q or closing the window) clears the temporary data, so the recovery prompt only appears after an actual unclean shutdown and never reappears once you've recovered and quit normally.

## 🔌 Connections

- **Additional users & "Connect As…"** — each connection can now hold extra user accounts alongside its main/default credentials. The Add/Edit Connection dialog gains a **Users** tab where you add, edit, and delete user profiles, each with an optional **Profile Name**, a required **Username**, and an optional **Password**. Right-click a connection and choose **Connect As…** to see a submenu listing the connection's own default user first (labeled `«username» (Default)`), followed by these profiles (shown by profile name, or username when no name is set), plus a **Manage Users** shortcut that opens the dialog straight to the Users tab. Picking an entry connects using its credentials; if no password is saved, the **Enter Password** dialog opens pre-filled with its username, and ticking **Remember password** saves the password (encrypted) back onto that profile — or onto the main connection user for the default entry. If a saved password fails to authenticate, the **Enter Password** dialog reopens showing the login error so you can correct the password and retry. Profile passwords are encrypted at rest exactly like the main connection password. SQLite connections — which have no authentication — don't show **Connect As…**.

- **Users tab redesign** — the connection dialog's **Users** tab now lists profiles in a table (Profile Name, Username, Password, Actions) with hover-reveal Edit and Delete icon buttons, instead of always-editable inline rows. Adding or editing a profile opens a focused Add/Edit User dialog with Save/Cancel, and Save stays disabled until a Username is entered.

- **Connected-as label in the Explorer tree** — a connected connection row now shows the active username in parentheses next to its name (e.g. `My SQL Server (sa)`). Connecting via **Connect As…** with a profile that has a **Profile Name** shows that name instead of the raw username, so you can tell at a glance which account each open connection is using.

## 📊 ERD Diagram

- **Relationship cardinality on connection lines** — each connection in an ERD now shows its relationship type next to the foreign-key column name, using `∞` for a "many" end: `∞:1` (one-to-many), `1:1` (one-to-one, when the FK is also the primary key), `0..∞:1` (optional/nullable FK), and `∞:∞` (many-to-many, detected from junction tables whose primary key is two FK columns). Cardinality is derived from the existing schema — no extra database query.

---

Thanks for using Spiral! 🙌
