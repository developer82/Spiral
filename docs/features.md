# Spiral — Feature Documentation

## Tips & Tricks

An ambient notification system that surfaces helpful tips while the user works.

### Notification UI
- Fixed position: bottom-right (bottom-left on RTL/Hebrew)
- Amber frosted-glass style (backdrop-filter blur + semi-transparent amber background)
- Theme-aware palette: dark themes use pale amber text on a dark amber tint; the light themes (Solar Light and Glass Light) switch to deep amber text (`#92400e`), a darkened lightbulb icon (`#d97706`), and a darker border/shadow so the notification stays legible against bright backgrounds
- Lightbulb icon, bold random title, tip text body, close (X) button
- Slide-in on appear; cloud-puff (scale + blur fade) on dismiss
- Clicking the tip body (when a screen is set) navigates to the relevant page/section

### Tips Data
Bundled JSON at `src/renderer/src/data/tips.json`. Each tip has:
- `id` — unique string
- `text` — tip content (up to 500 chars)
- `category` — classification string
- `screen` (optional) — `{ page, section? }` for navigation on click

### Display Rules
| Rule | Behaviour |
|---|---|
| App start | First tip shown after 15 seconds |
| Cooldown | No new tip for at least 5 minutes after a tip appeared |
| Post-cooldown | New tip scheduled at random 0–2 minutes after cooldown expires |
| Navigation | Resets the 5-minute wait; tip scheduled in 0–2 minutes (if no tip visible) |
| Concurrent | A second tip is never shown while one is visible |
| Selection | 75% weight toward tips matching the current screen; 25% from all others |

### Settings
- **Show Tips & Tricks** toggle in Settings → General (default: on)
- **Preview** button in Settings → General to show a random tip immediately

### Architecture
| Component | Location |
|---|---|
| Tips data | `src/renderer/src/data/tips.json` |
| Timer logic & context | `src/renderer/src/contexts/TipsContext.tsx` |
| Notification UI | `src/renderer/src/components/TipsNotification/TipsNotification.tsx` |
| Overlay layer | `TipsLayer` export in `TipsNotification.tsx` |

## MySQL User Management

MySQL connections support full user management via the Security nodes in the Explorer tree.

### Server-Level Users (ManageMySqlUsersDialog)

Triggered by right-clicking the **Users** folder under a MySQL connection's Security node, or double-clicking an individual user node.

**Features:**
- Create, edit, and delete MySQL users (`user@host` pairs)
- **General tab**: username, host, authentication plugin (`mysql_native_password`, `caching_sha2_password`, `sha256_password`, `auth_socket`), password, account locked, password expired flags
- **Global Privileges tab**: checkbox grid for all standard MySQL global privileges (SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, SUPER, etc.)
- **Database Privileges tab**: per-database privilege management with expandable rows; add/remove databases, check individual privileges (SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, CREATE VIEW, SHOW VIEW)

**SQL operations used:** `CREATE USER`, `RENAME USER`, `ALTER USER`, `GRANT`/`REVOKE ON *.*`, `GRANT`/`REVOKE ON db.*`, `DROP USER`, `FLUSH PRIVILEGES`

### Database-Level Users (ManageMySqlDatabaseUsersDialog)

Triggered by right-clicking the **Users** folder under a specific database's Security node, or double-clicking a user node within a database.

**Features:**
- Lists users with any privilege on the selected database
- **Privileges tab**: checkboxes for all database-level privileges on `databaseName.*`
- **Revoke All Access** button removes all privileges for the selected user on this database

### Key Differences from SQL Server

| Concept | SQL Server | MySQL |
|---|---|---|
| User identity | Name only | `user@host` pair |
| Auth types | SQL / Windows / Entra | Plugin-based |
| Roles | Server roles + DB roles | Global & per-DB GRANT/REVOKE |
| Default DB/Language | Supported | Not applicable |

---

## SQL Server User Management

SQL Server connections support two levels of user management:

### Server Logins (ManageServerUsersDialog)

Manage server-level logins with SQL, Windows, and Microsoft Entra authentication. Configure server roles and database mappings.

### Database Users (ManageDatabaseUsersDialog)

Manage database-scoped users with login associations and role membership.

### Server Roles (ManageServerRolesDialog)

Manage server-level roles via Security > Roles. Supports full CRUD for user-defined server roles.

**Entry points:**
- Right-click the **Roles** folder → **Add Role**
- Right-click a role → **Edit Role** or **Delete Role**
- Double-click a role to open it for editing

**Dialog layout:** Two-column (role list on left, tabbed editor on right).

**Tabs:**
- **General** — Role name (immutable after creation), owner, and securables (server + endpoint permissions). Fixed roles show this tab as read-only.
- **Members** — Logins that belong to this role. Add/remove members. Disabled for the `public` role.
- **Memberships** — Parent server roles that this role belongs to. Add/remove parent role memberships.

**Fixed vs user-defined roles:** Fixed roles (`sysadmin`, `serveradmin`, `securityadmin`, `processadmin`, `setupadmin`, `bulkadmin`, `diskadmin`, `dbcreator`, `public`) cannot be deleted, renamed, or have their owner changed. Only the `public` role disallows member changes entirely.

---

## Internationalization (i18n)

Spiral supports multiple display languages using **i18next** and **react-i18next**.

### Supported Languages

| Code | Language |
|------|----------|
| `en` | English (default) |
| `he` | Hebrew (עברית) |

### Architecture

- **Configuration**: `src/renderer/src/i18n/index.ts` — initializes i18next, persists the selected language to `localStorage`, and sets the document `lang` and `dir` attributes automatically (RTL for Hebrew).
- **Translation files**: `src/renderer/src/i18n/locales/en.json` and `src/renderer/src/i18n/locales/he.json`.
- **Entry point**: `src/renderer/src/main.tsx` imports the i18n config before rendering the app.

### Translation Key Structure

```
nav.sideNav.*        — Side navigation labels and aria-labels
nav.topBar.*         — Top bar menu items and aria-labels
settings.*           — All Settings page labels, sections, and content
explorer.*           — Explorer page (tree panel) labels
pages.*              — Page title headings
```

### Language Switcher

The language can be changed from **Settings → General**. The selection persists across sessions via `localStorage`. Switching to Hebrew activates RTL layout by setting `dir="rtl"` on the `<html>` element.

### Adding a New Language

1. Create `src/renderer/src/i18n/locales/<code>.json` with all keys from `en.json` translated.
2. Add the new locale to the `resources` object in `src/renderer/src/i18n/index.ts`.
3. Add the new language entry to the `LANGUAGES` array in `src/renderer/src/pages/Settings/GeneralSettings.tsx`.

---

## Navigation

### Layout

The app uses a section-card layout. Below the top bar, each major region — the side navigation, the page's secondary nav (when present), and the main content — is rendered as a self-contained card with a thin border and rounded corners, separated from its neighbors by a small gap. There are no dividing lines between sections; the gaps themselves provide the visual separation. Resizable panels (the connections panel in Explorer, the comparisons panel in Compare, the AI and SED panels in Explorer, and the SQL viewer in Profiler) retain their drag-to-resize handles on the panel edge.

### Toolbar

The shared `Toolbar` component renders action buttons in logical groups (e.g. query exec, save/open) in page headers such as the Explorer content header.

- **Windows / Linux** — groups are laid out as flat rows of icon buttons with a thin vertical separator line between groups.
- **macOS** — each group is wrapped in a translucent pill-shaped capsule with a backdrop blur, a light-reflecting rim (highlighted top edge, darker bottom edge), and a subtle drop shadow so the capsule reads as raised glass. Icons inside a capsule are separated by a 1px hairline divider; capsules themselves are separated by spacing only (no divider line). Hovering an icon shows a `#4D4B4A` pill behind it. When the application window loses focus, the capsules flatten into a single-tone gray fill with no blur, shadow, or hover highlight — matching the native macOS toolbar's `windowDidResignKey` look.

### Navigation Controller

All left-side navigation is managed by the `NavController` component, which hosts two navigation layers:

1. **Side Icon Navigation (`SideNav`)** — a vertical icon-only sidebar on the left edge. Each icon has a tooltip and aria-label from the active language. Sections:
   - Explorer
   - Profiler
   - Compare
   - **User Profile** (bottom-pinned, above Settings) — circular icon showing the user's avatar image or a default `UserRound` icon. Clicking navigates directly to the **User Profile** section of Settings.
   - Settings (bottom-pinned)

2. **Screen Navigation (secondary panel)** — an optional per-page panel rendered to the right of SideNav. Pages that have a secondary navigation area (Explorer, Compare, Settings, Docs) inject their panel into NavController's slot via a React portal, keeping their panel state local while the visual output appears beside SideNav. The slot is empty for pages without a secondary nav (Profiler). When rendered outside a NavController (e.g., in unit tests), the panel falls back to rendering inline within the page.

The side navigation bar can be hidden from **View → Hide Side Navigation Bar** and shown again from **View → Show Side Navigation Bar**. This preference persists across app restarts and can also be changed from **Settings → Appearance → Interface Elements**. While the side navigation bar is hidden, the **User Profile** button relocates to the title bar so the avatar and quick access to the User Profile settings remain reachable (see [Top Bar](#top-bar)).

### Top Bar

A horizontal application menu bar (`TopBar`) at the top with the Spiral logo/wordmark and menu items: **File**, **Edit**, **View**, and **Window**. On Windows and Linux, these menus render as custom HTML dropdowns via the shared `Menu` component. On macOS, matching native application menu entries are exposed as well, and the native **View** menu retains **Toggle Full Screen**.

#### Title Bar Profile Button

When the side navigation bar is hidden, the **User Profile** button moves into the title bar so the user's avatar (or default `UserRound` placeholder) stays visible. The avatar visual is shared with the side navigation bar via the `ProfileAvatar` component, so the chosen image, zoom, and offset render identically in both places. Clicking it opens the **User Profile** section of Settings, and hovering shows the display name as a tooltip. Placement is platform-aware:

- **Windows / Linux** — pinned to the right of the title bar, immediately left of the window control buttons (minimize / maximize / close).
- **macOS** — placed inside the brand cluster on the right, immediately left of the Spiral logo (the window traffic lights remain in the native left area).

The button is not shown while the lock screen is active, and it disappears again as soon as the side navigation bar is restored.

#### Window Menu

The **Window** menu provides window-level actions:

- **Close All Tabs** — Closes every open tab in the Explorer. If all open tabs are clean (unsaved), they are all closed immediately. If any tab has unsaved changes, those tabs are filtered to a queue and the **Unsaved Changes** dialog is shown for each dirty tab in sequence. For each dirty tab the user may:
  - **Save** — saves the file and advances to the next dirty tab in the queue.
  - **Discard** — discards changes and closes the tab, then advances to the next dirty tab.
  - **Cancel** — aborts the entire close-all operation; any tabs already closed remain closed and the remaining dirty tabs stay open.
  
  The item is disabled when no tabs are open.

  On macOS the item appears in the native **Window** menu. On Windows and Linux it appears in the custom **Window** dropdown in the top bar.

#### Help Menu

The **Help** menu includes **Resize Window** and **Take Screenshot** actions:

- **Take Screenshot** — Opens a **Take Screenshot** dialog that shows a live preview of the current window and lets the user pick the output size before saving:
  - **Preview** — When the action is triggered, the current window is captured (via `webContents.capturePage()`) and shown as a static preview inside the dialog.
  - **Size selection** — The user chooses the saved image size with the shared **Size selector** (see below).
  - **Capture** — Renders the screenshot at the chosen size and opens a save dialog. The image is written as a PNG, defaulting to `Spiral-Screenshot-<timestamp>.png`. When the chosen size differs from the current window, the window is briefly resized so the UI reflows at that resolution, then **restored to its original size and position** (and re-maximized if it was maximized). When the size matches the current window, no resize happens. In all cases the dialog is dismissed and the window is allowed to **repaint without it** (via a double `requestAnimationFrame` wait in `TopBar`) before the capture, so the screenshot never includes the Take Screenshot dialog itself. **Cancel** and cancelling the save dialog write no file.
  - **macOS traffic lights** — The macOS window "traffic light" buttons (close / minimize / zoom) are a native layer that `capturePage()` does not include, so on macOS with a custom (hidden) title bar Spiral paints **artificial traffic lights** onto both the preview and the saved image. This layer matches the native `trafficLightPosition` (12 px from the left, 11 px from the top; 12 px buttons at 20 px center spacing) and scales with the capture's device pixel ratio so it stays crisp on Retina displays. The compositing lives in `src/renderer/src/components/TakeScreenshotDialog/trafficLights.ts` (`drawTrafficLights()` / `composeScreenshotWithTrafficLights()`) and is only applied when `platform === 'darwin'` and the custom title bar is enabled.

  The main-process logic splits capture from saving: `captureCurrentWindow()` (dialog preview) and `captureScreenshotAtSize()` (resize/restore + return a PNG data URL) capture the image, and `saveScreenshotToFile()` writes a supplied data URL to disk after the renderer has composited any overlay. These are exposed via the `window:screenshot-preview`, `window:screenshot-capture`, and `window:screenshot-write` IPC channels (`window.api.window.captureScreenshotPreview()` / `captureScreenshotAtSize(width, height)` / `writeScreenshot(dataUrl)`). The `TopBar` orchestrates capture → traffic-light compositing → write. The dialog UI is `src/renderer/src/components/TakeScreenshotDialog/`, opened from the Help menu in `TopBar`. On macOS the native Help menu triggers the same dialog through the existing `menu:native-action` → `help:take-screenshot` event.

- **Resize Window** — Opens a **Resize Window** dialog that uses the same size selector to resize the actual app window (no preview image, no file saved):
  - **Size selection** — The shared size selector, seeded with the current window content size as **Current**.
  - **Resize** — Applies the chosen size to the window via `setContentSize()` and **re-centers** the window on its display; if the window was maximized it is un-maximized first. The dialog then closes. **Cancel** makes no change.

  The main-process handlers are the `window:get-content-size` (read current content size) and `window:resize` (un-maximize + `setContentSize` + `center`) IPC channels in `src/main/index.ts`, exposed via `window.api.window.getContentSize()` / `resizeWindow(width, height)`. The dialog UI is `src/renderer/src/components/ResizeWindowDialog/`, opened from the Help menu in `TopBar`. On macOS the native Help menu triggers it through the `menu:native-action` → `help:resize-window` event.

- **Size selector** — `src/renderer/src/components/SizeSelector/` is the reusable size-picker component shared by the Take Screenshot and Resize Window dialogs. It offers **Current** (a caller-supplied base size), **common sizes** (1920×1080, 1280×720, 1280×768, 1024×768, 800×600), **screen aspect ratios** (16:9, 4:3, 3:2, 1:1, 16:10 — height derived from the base width), or a **Custom** width × height (100–8000 px). It reports the resolved dimensions (or `null` when a custom entry is incomplete/out of range) to its parent via an `onChange` callback.

---

## Pages

### Compare

The Compare page now supports creating and editing saved comparison configurations. A comparison captures:

- A comparison name and description
- A source connection and database
- A target connection and database
- A detailed comparison scope across schema/structural objects and table-data options
- Optional custom logical-key mappings for row-level comparisons that cannot rely on the physical primary key alone

The configuration dialog is split into two sides so source and target can be selected independently. Each side can either use an existing saved Explorer connection or create a new connection inline without leaving the Compare workflow. When a selected connection is assigned to an environment, both the dialog card and the saved comparison details card for that side use the environment color for their border so source and target are easier to distinguish at a glance. The saved comparison details also show the environment name in parentheses in the Source Database and Target Database section titles.

Saved comparisons appear in the Compare sidebar and can be re-opened for editing or deleted. The details panel shows the currently selected configuration, including providers, selected scopes, and any custom logical-key overrides.

#### Side Navigation Search, Filter, and Sort

The Compare sidebar includes a search field with filter and sort controls, identical in behavior to the Explorer connection list toolbar.

- **Search**: Typing filters the list in real time against each comparison's name, description, source provider label, and target provider label (case-insensitive).
- **Filter**: A provider filter panel (opened via the sliders icon) lets you show only comparisons whose source or target provider matches one of the selected providers (either-side semantics).
- **Sort**: A sort panel (opened via the arrows icon) lets you order the list by Name, Date created, Last updated, Source provider, or Target provider in ascending or descending order.
- When active filters are in use the filter icon is highlighted. If all comparisons are filtered out a "No comparisons match your search" message is shown instead of the empty-state.

Each saved comparison can now be executed directly from the Compare page via a dedicated Compare action. Running a comparison generates an in-page results report that summarizes added, removed, modified, and skipped differences across the selected scope. The current report covers saved schema/configuration surfaces such as tables, columns, keys, check constraints, indexes, triggers, views, stored procedures, functions, database users, roles, schemas, and row-level differences when a usable physical or custom logical key is available.

#### Report Action Buttons

Once a comparison report has been generated, three action buttons are available in the report's action bar in addition to the Save/Export button:

##### Swap

Transposes the source and target roles for the current report session. When active:

- The button shows a visual **active** state and displays a "Swapped" label.
- **Create Script** and **Sync All** operate as if the target database is the truth and the source database is the receiver.
- The swap state is **not persisted** — it resets when a new comparison is run, the comparison is changed, or the page is reloaded.

##### Create Script

Generates a SQL sync script from the current report findings (respecting the current Swap state) and opens it as a new tab in the Explorer page, automatically switching the view to Explorer. The script:

- Creates tables and columns that are present in the truth database but missing from the receiver.
- Drops tables that are present in the receiver but absent from the truth.
- Replaces (DROP + CREATE) views, stored procedures, and other supported objects that differ.
- Adds a placeholder comment for any item that cannot be scripted automatically (e.g., table modifications).

##### Sync All

Executes the sync script directly against the receiver database after the user confirms in a confirmation dialog. The dialog:

- Shows the sync direction (truth → receiver) clearly, including the Swap state.
- Optionally generates a **revert script** (enabled by checkbox). When selected, Spiral generates the revert SQL before executing the sync and prompts the user to save it to a `.sql` file.
- After the user confirms, the sync runs each scriptable change individually in sequence against the receiver database.
- On success, the comparison is **re-run automatically** so the updated report reflects the post-sync state.
- On error, an alert is shown and no further changes are made.

##### Per-Finding Sync

Each finding row in the report also includes its own **Sync** action. This uses the same confirmation dialog and execution pipeline as **Sync All**, but scopes the sync to that single finding only.

- The dialog still shows the current sync direction and honors the active **Swap** state.
- The dialog explicitly identifies the selected finding so it is clear that only that change will be applied.
- The row-level **Sync** button is disabled for findings that Spiral cannot currently script and execute automatically.
- On success, the comparison is **re-run automatically** so the report reflects the new post-sync state.

#### Exporting a Comparison Report

Once a report has been generated, a **Save** button appears in the report's action bar. Clicking it exports the full report as a `.json` file. The exported file contains:

- `exportVersion` — a fixed value (`1`) for forward-compatibility detection.
- `exportedAt` — ISO-8601 timestamp of when the export was triggered.
- `secretsIncluded` — boolean indicating whether connection passwords/file paths were embedded.
- `comparison` — the comparison configuration (name, description, scope keys, table key mappings, timestamps).
- `sourceConnection` / `targetConnection` — a snapshot of each side's connection record at export time, including provider, host, port, username, default database, color, and environment id.
- `report` — the full `ComparisonExecutionReport` containing all diff items, counts, warnings, and timing.

**Secrets prompt** — Before saving, Spiral asks whether to include connection passwords and file paths in the export. The dialog explains the security risk. The default answer is **No (exclude secrets)**. If secrets are excluded, the `password` and `filePath` fields in the connection snapshots are set to `null`, and `secretsIncluded` is `false`.

The dialog has a **Don't ask me again** checkbox. Checking it and confirming persists both the chosen answer and the "skip this prompt" preference so future exports use the same answer automatically.

**Settings** — Two toggles under **Settings → Databases Config → Comparison Export** control this behavior:

| Setting | Key | Default | Description |
|---|---|---|---|
| Ask before including secrets | `askBeforeIncludingSecretsInComparisonExport` | `true` | When enabled, the secrets confirmation prompt is shown before each export. Disable to skip the prompt. |
| Include secrets by default | `includeSecretsInComparisonExportByDefault` | `false` | When prompting is disabled, this value is used automatically. |

### Explorer

A resizable split-panel view. The left panel shows a lazy-loaded database object tree. The panel width is user-adjustable by dragging the resize handle (min 180px, max 480px).

#### Tree Hierarchy

The Explorer uses a lazy-loaded tree. Tables can be further expanded to show their internal schema objects:

```
Connection
└── Databases
    └── <database name>
        ├── Tables
        │   └── <schema.table>
        │       ├── Columns
        │       │   └── <column name (data type)>
        │       ├── Keys
        │       │   └── <constraint name (type)>
        │       ├── Constraints
        │       │   └── <constraint name (type)>
        │       ├── Triggers
        │       │   └── <trigger name>
        │       ├── Indexes
        │       │   └── <index name (type)>
        │       └── Statistics
        │           └── <statistic name>
        ├── Views
        │   └── <schema.view>
        ├── Stored Procedures
        │   └── <schema.procedure>
        ├── Functions
        │   └── <schema.function>
        └── Types
            └── <schema.type>
```

Each level is loaded on first expand and cached for the session. Collapsing and re-expanding a node does not re-fetch unless the previous load resulted in an error.

#### Tab Strip

The editor area's tab strip holds all open tabs (query, ERD, dashboard, shell, and Redis DB Explorer tabs). Clicking a tab activates it; the X button closes it.

**Drag-and-drop reordering** — tabs can be reordered by dragging. Press and drag any tab onto another tab to drop it at that tab's position; the remaining tabs shift to make room. While dragging, the dragged tab dims and the tab currently under the cursor shows a primary-colored drop indicator on its left edge. Reordering is purely visual — it does not change which tab is active, open, or dirty. Cancelling a drag (releasing outside the strip) leaves the order unchanged.

#### Autosave & Crash Recovery

Query tabs with unsaved changes are continuously autosaved so their content survives an unexpected shutdown (crash, power loss, or forced quit). Only **query** tabs are covered — ERD, dashboard, and shell tabs are not.

**How it works**

- **Live snapshotting** (`hooks/useAutosave.ts`) — whenever a query tab is dirty, the set of dirty drafts is written to a manifest at `<userData>/autosave/session.json` via the `autosave:write` IPC channel. The first time unsaved content appears the write happens **immediately** (so even a crash within the debounce window is recoverable); subsequent keystrokes are debounced (~800 ms), and there is an additional flush on window `blur`/`beforeunload`. Each draft records the tab's `title`, `content`, optional `filePath`, and connection/database context. Writing the whole set each time means tabs that were saved (no longer dirty) or closed naturally drop out of the manifest — and once the set is empty the file is deleted. The write is atomic (temp file + rename).
- **Deliberate-quit clearing** — the manifest is deleted only on a **deliberate, user-initiated** quit: the *Quit Spiral* menu item / **Cmd+Q**, the titlebar close/quit buttons, closing the last window on Windows/Linux, and quit-and-install. These set a `userInitiatedQuit` flag that the `before-quit` handler checks before calling `clearAutosave()`. Any *other* route into `before-quit` leaves the manifest intact — importantly a macOS **Force Quit** or dock **Quit**, which reach `before-quit` via an OS quit event (not one of the app's own controls), as does an OS shutdown. A genuine crash never runs `before-quit` at all, so its manifest is preserved too. Net effect: quitting normally after recovering does **not** re-show the dialog, while a Force Quit / crash **does** offer recovery.
- **Startup consumption** (`src/main/autosave.ts`) — on launch the main process reads the manifest into memory and immediately deletes it (`readAndConsumeAutosave`), so the recovered data is offered exactly once regardless of the user's choice. A corrupt or missing manifest yields no recovery and never blocks startup.
- **Recovery dialog** (`Dialogs/RestoreRecoveredDocumentsDialog`) — if recovered drafts exist, the Explorer page shows a **Recover Unsaved Documents** dialog listing each document with a checkbox (all checked by default; file-backed drafts show their file basename). **Restore** reopens the selected drafts as query tabs marked dirty (`useTabsManager.restoreDrafts`); **Discard** dismisses them. A file-backed draft restores with its original `filePath`, so a subsequent Save overwrites the original file as intended. After restore, live autosave re-persists the now-open dirty tabs.

#### ERD Diagram — Relationship Cardinality

Each connection line on an ERD diagram is labelled with both the foreign-key column name and its relationship cardinality, rendered as `<column> · <symbol>` (e.g. `user_id · ∞:1`). The infinity glyph `∞` denotes a "many" end. The symbol is read along the edge direction (`child/FK` → `parent/PK`):

| Relationship | Symbol | When |
|---|---|---|
| one-to-many (many-to-one) | `∞:1` | Ordinary FK column |
| one-to-one | `1:1` | FK column is also the primary key of its table |
| optional one-to-many | `0..∞:1` | FK column is nullable (optional participation) |
| many-to-many | `∞:∞` | Both FK edges of a detected junction table |

Cardinality is derived entirely in the renderer (`ErdCanvas/deriveCardinality.ts`) from the schema metadata already present on `ErdSchema` — the FK column's `isPrimaryKey`/`isNullable` flags, plus junction-table detection (a table whose primary key is exactly two columns that are each both PK and FK). No additional database round-trip is required. Manually drawn edges carry no relationship metadata and remain unlabelled.

#### Table Sub-Categories (SQL Server)

Expanding a table node reveals the following provider-specific sub-folders:

| Folder | SQL Source | Contents |
|---|---|---|
| **Columns** | `INFORMATION_SCHEMA.COLUMNS` | Column names with data types, ordered by ordinal position |
| **Keys** | `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` + `TABLE_CONSTRAINTS` | PRIMARY KEY, FOREIGN KEY, and UNIQUE constraints |
| **Constraints** | `INFORMATION_SCHEMA.TABLE_CONSTRAINTS` + `sys.default_constraints` | CHECK and DEFAULT constraints |
| **Triggers** | `sys.triggers` | DML triggers defined on the table |
| **Indexes** | `sys.indexes` | Non-heap indexes (clustered and non-clustered) |
| **Statistics** | `sys.stats` | Statistics objects for query optimization |

The sub-folder set is defined per provider via `listTableCategories(databaseName, tableIdentifier)`, allowing future providers (e.g. PostgreSQL, MySQL) to expose different or fewer categories.

#### Database Provider Abstraction

Spiral uses a **provider registry pattern** in the main process to support multiple database engines. Each provider implements the `DatabaseProvider` interface (`src/main/database/types.ts`):

- `connect(record)` — opens a live connection using credentials from the saved `ConnectionRecord`.
- `disconnect()` — closes the underlying connection pool gracefully.
- `listDatabases()` — returns all accessible databases on the server.
- `listCategories(databaseName)` — returns the category folders (Tables, Views, Stored Procedures, Functions, Types) for a given database.
- `listTables(databaseName)` — returns base tables for the specified database.
- `listViews(databaseName)` — returns views for the specified database.
- `listStoredProcedures(databaseName)` — returns stored procedures for the specified database.
- `listFunctions(databaseName)` — returns functions for the specified database.
- `listTypes(databaseName)` — returns user-defined types for the specified database.
- `listTableCategories(databaseName, tableIdentifier)` — returns the sub-folder nodes for a table (e.g. Columns, Keys, Constraints). Provider-specific; SQL Server returns 6 folders.
- `listColumns(databaseName, schemaName, tableName)` — returns column nodes for a table.
- `listKeys(databaseName, schemaName, tableName)` — returns key constraint nodes for a table.
- `listConstraints(databaseName, schemaName, tableName)` — returns CHECK and DEFAULT constraint nodes for a table.
- `listTriggers(databaseName, schemaName, tableName)` — returns trigger nodes for a table.
- `listIndexes(databaseName, schemaName, tableName)` — returns index nodes for a table.
- `listStatistics(databaseName, schemaName, tableName)` — returns statistics nodes for a table.

The renderer requests children via a generic `database:get-children` IPC channel, passing the connection id and a path-encoded node id (e.g. `db:AdventureWorks:tables`). The main process routes this to the correct provider method and returns the child nodes.

Providers are registered in `DatabaseManager` (`src/main/database/DatabaseManager.ts`) which manages all active sessions keyed by saved connection id. The manager's `closeAll()` is called on `before-quit` so connections are drained before the process exits.

Adding a new database provider requires only two steps: implement `DatabaseProvider` and register a factory in `PROVIDER_FACTORIES` inside `DatabaseManager.ts`.

#### SQL Server Provider

The first concrete provider (`src/main/database/providers/SqlServerProvider.ts`) connects using the `mssql` Node.js driver with SQL authentication (host, port, username, password, optional default database). `trustServerCertificate` is enabled by default to support local and development servers.

Metadata is loaded via cross-database queries using SQL Server's three-part name syntax (e.g. `[dbName].INFORMATION_SCHEMA.TABLES`). Database names are validated before use to prevent SQL injection via bracket-escape sequences.

#### SQL Server Backup & Restore

SQL Server connections expose **Back Up…** and **Restore…** actions in the database right-click context menu (their own divided section between the database actions and the destructive "Drop Database" item). Both are gated by the `hasBackupRestore` provider capability, so they appear only for SQL Server connections. The feature is implemented end-to-end through the standard `window.api.database.*` → preload → `ipcMain` → `DatabaseManager` → `SqlServerProvider` pipeline; all backup/restore SQL generation lives in `SqlServerProvider` and `DatabaseManager` guards each call with `provider instanceof SqlServerProvider`.

**Back Up Database** (`BackupDatabaseDialog`) mirrors SSMS and lets the user configure:

- **Source** — database name (read-only), optional backup set name, backup type (`Full` / `Differential` / `Transaction Log`), and backup component (`Database` or `Files and filegroups`; the latter opens `FilesAndFilegroupsDialog` to pick logical files from `sys.database_files`).
- **Destination** — one or more full server-side file paths, added/removed via the shared server file browser.
- **Media** — append (`NOINIT`) or overwrite (`INIT`) existing backup sets.
- **Reliability** — verify after finish (issues a follow-up `RESTORE VERIFYONLY`), perform `CHECKSUM`, and `CONTINUE_AFTER_ERROR`.
- **Transaction log** (log backups only) — truncate, or back up the tail of the log with `NORECOVERY`.
- **Backup expiration** — never, after N days (`RETAINDAYS`), or on a date (`EXPIREDATE`).
- **Compression** — default server setting, `COMPRESSION`, or `NO_COMPRESSION`.

**Restore Database** (`RestoreDatabaseDialog`) also mirrors SSMS:

- **Source** — restore from a database's backup history (queried from `msdb.dbo.backupset` / `backupmediafamily`) or from a device file (header read via `RESTORE HEADERONLY`).
- **Restore plan** — a grid of backup sets (type, database, date, position, file) with per-row selection; the restore chain is ordered full → differential → log.
- **Destination** — editable target database name.
- **Options** — `REPLACE`, take a tail-log backup before restoring, `RESTRICTED_USER`, recovery state (`RECOVERY` / `NORECOVERY` / `STANDBY`), and per-file `MOVE` relocation (defaults pre-filled from `RESTORE FILELISTONLY`).

Both dialogs offer a **Preview Script** toggle (built via `buildBackupSql` / `buildRestoreSql`) before executing, run the generated T-SQL through `executeQuery`, and report success (with elapsed time) or the server error plus the failing statement. The `databases` cache is invalidated after a successful restore.

**Server file browser** (`ServerFileBrowserDialog`, shared by both dialogs) enumerates fixed drives with `xp_fixeddrives` and folders one level at a time with `xp_dirtree`. These extended procedures require elevated permissions; when access is denied the dialog gracefully falls back to manual full-path entry. All file paths and identifiers are escaped (single quotes doubled, identifiers bracket-quoted) before being embedded in T-SQL.

The browser adapts to the SQL Server host's OS: `SqlServerProvider` queries `sys.dm_os_host_info` (SQL Server 2017+ runs on both Windows and Linux) to detect the platform. On Linux, drive listing is skipped (no drive letters) and the tree starts at a single `/` root; on Windows it falls back to the pre-2017 behavior using `xp_fixeddrives`. The dialog mirrors this with a backslash separator and `C:\` style paths for Windows, or a forward-slash separator and `/`-rooted paths for Linux.

#### MySQL Backup & Restore

MySQL connections expose the same **Back Up…** and **Restore…** context-menu section as SQL Server (gated by the `hasBackupRestore` capability, which `MySqlProvider` now reports `true`). The database-node context menu branches on `connection.provider`: MySQL databases open the MySQL-specific dialogs, all other providers keep the SQL Server dialogs. Calls flow through `window.api.database.mysql*` → `mysql:*` IPC → `DatabaseManager` (guarded by `provider instanceof MySqlProvider`) → `MySqlProvider`.

Unlike SQL Server, MySQL has no server-side `BACKUP`/`RESTORE` statement, so the feature is **local-only**: dumps are written to and read from the client machine via Electron save/open dialogs (`mysql:pick-backup-path` / `mysql:pick-restore-file`). Two engines are used transparently:

- **mysqldump / mysql client** — preferred when the binaries are found on the system `PATH` or at the paths configured in *Settings → Databases Config → MySQL Client Tools*. Backups stream `mysqldump` stdout (optionally through gzip) to the target file; restores pipe the file into the `mysql` client over stdin. Passwords are passed via the `MYSQL_PWD` environment variable, never on the command line.
- **Pure-JS fallback** (`mysqlDump.ts`) — used automatically when the binaries are missing. `dumpDatabaseToFile` reconstructs the dump over the existing mysql2 connection (`SHOW CREATE TABLE`/`VIEW`, batched `INSERT`s, routines/triggers/events in `DELIMITER` blocks); `restoreFromText` splits the script with a `DELIMITER`-aware parser and runs the statements.

**Back Up MySQL Database** (`BackupMySqlDatabaseDialog`) configures: content (schema + data / schema only / data only), destination file with optional gzip, and mysqldump-style options (add `DROP TABLE`, single transaction, include routines/triggers/events, extended inserts, add `CREATE DATABASE`, character set). A **Preview Command** toggle shows the assembled `mysqldump` command with the password masked, and an engine banner indicates whether the CLI or JS engine will run.

**Restore MySQL Database** (`RestoreMySqlDatabaseDialog`) takes a source `.sql`/`.sql.gz` file (gzip auto-detected), a target database (with optional create-if-not-exists), and a stop-on-first-error toggle (`--force` when off). The `databases` cache is invalidated after a successful restore.

The binary paths live in `AppSettings` (`mysqlDumpPath`, `mysqlClientPath`); the Settings page **Test** button probes them via a connection-independent `mysql:probe-tools` handler and reports each tool's version or "not found".

#### PostgreSQL Backup & Restore

PostgreSQL connections expose the same **Back Up…** and **Restore…** context-menu section (gated by `hasBackupRestore`, which `PostgresProvider` now reports `true`). The database-node context menu branches on `connection.provider`: Postgres databases open the Postgres-specific dialogs. Calls flow through `window.api.database.postgres*` → `postgres:*` IPC → `DatabaseManager` (guarded by `provider instanceof PostgresProvider`) → `PostgresProvider`.

Like MySQL, the feature is **local-only** and built on the PostgreSQL client binaries — there is no pure-JS fallback, so `pg_dump` / `pg_restore` / `psql` must be available (on `PATH` or at the paths configured in *Settings → Databases Config → PostgreSQL Client Tools*). Passwords are passed via the `PGPASSWORD` environment variable, never on the command line. Files are written/read on the client machine via Electron dialogs (`postgres:pick-backup-path` / `postgres:pick-restore-file`).

**Back Up PostgreSQL Database** (`BackupPostgresDatabaseDialog`) configures: output **format** (`Plain` SQL, `Custom`, `Tar`, or `Directory`), content (schema + data / schema only / data only), destination file or folder, and `pg_dump` options (no-owner, no-privileges, clean/`--if-exists`, `--create`, encoding). Plain format streams `pg_dump` stdout to the file with optional gzip; the other formats write directly via `--file` and expose a compression level (custom/directory). A **Preview Command** toggle shows the assembled `pg_dump` command with the password masked.

**Restore PostgreSQL Database** (`RestorePostgresDatabaseDialog`) takes a source dump file (format auto-guessed from extension, user-overridable), a target database (with optional create-before-restore), and a single-transaction toggle. Plain dumps restore via `psql`; custom/tar/directory archives restore via `pg_restore` with additional options (clean/`--if-exists`, no-owner, and parallel `--jobs` when not in a single transaction). The `databases` cache is invalidated after a successful restore.

The binary paths live in `AppSettings` (`pgDumpPath`, `pgRestorePath`, `psqlPath`); the Settings page **Test** button probes them via a connection-independent `postgres:probe-tools` handler and reports each tool's version or "not found".

#### PostgreSQL SSL / TLS

PostgreSQL connections support encrypted transport, required by managed services such as Aiven, Heroku Postgres, Supabase, Neon, and Amazon RDS, which reject plaintext connections with `no pg_hba.conf entry for host … no encryption`.

The New/Edit Connection dialog exposes an **SSL Mode** dropdown for Postgres connections, mirroring libpq's `sslmode` parameter. `PostgresProvider` maps each mode to the `pg` Pool `ssl` option:

| SSL Mode | Encryption | Certificate verification | `pg` `ssl` value |
|----------|-----------|--------------------------|------------------|
| `disable` | none | — | `false` |
| `allow` | if the server requires it | none | tries plaintext, then encrypted |
| `prefer` *(default)* | if available | none | tries encrypted, then plaintext |
| `require` | always | none | `{ rejectUnauthorized: false }` |
| `verify-ca` | always | certificate chain (not hostname) | `{ rejectUnauthorized: true, checkServerIdentity: () => undefined, ca? }` |
| `verify-full` | always | certificate chain **and** hostname | `{ rejectUnauthorized: true, ca? }` |

`allow` and `prefer` are negotiated at connect time: `connect()` tries each candidate transport in order and keeps the first pool that connects, matching libpq's fallback behaviour. The resolved `ssl` option is then reused for the per-database pools that `PostgresProvider` lazily creates while navigating the tree.

Two additional fields appear in the dialog when relevant:
- **CA Certificate File** *(verify-ca / verify-full)* — optional path to a CA certificate (PEM). When set, the file is read from disk (`readFileSync`) and supplied as `ssl.ca`, so the server certificate is verified against your own CA (the secure option for Aiven, which ships a project CA cert). A **Browse…** button opens a native file picker. When omitted, Node's default trust store is used.
- **Server Name (SNI)** *(any encrypted mode)* — optional hostname override sent as `ssl.servername` for TLS Server Name Indication.

For backward compatibility, when `postgresSslMode` is unset the provider derives a mode from the legacy `tlsEnabled` / `tlsRejectUnauthorized` flags (`disable`, `require`, or `verify-full`).

#### SQLite Backup & Restore

SQLite connections expose the same **Back Up…** and **Restore…** context-menu section (gated by `hasBackupRestore`, which `SqliteProvider` reports `true`). The database-node context menu branches on `connection.provider`: SQLite databases open the SQLite-specific dialogs. Calls flow through `window.api.database.sqlite*` → `sqlite:*` IPC → `DatabaseManager` (guarded by `provider instanceof SqliteProvider`) → `SqliteProvider`.

Because SQLite is a single file, no external tools are involved — the feature is pure file operations against the connection's `filePath` (retained by `SqliteProvider.connect`). Files are chosen on the client machine via Electron dialogs (`sqlite:pick-backup-path` / `sqlite:pick-restore-file`).

**Back Up SQLite Database** (`BackupSqliteDatabaseDialog`) writes a `.db` copy of the live database to a destination file, with two options:
- **Compact (VACUUM)** — uses `VACUUM INTO` to defragment/shrink the output; otherwise the better-sqlite3 online backup API (`db.backup`) produces an exact copy while connected.
- **Compress (gzip)** — gzips the output (the file ends with `.db.gz`).

On success it reports the elapsed time and the backup file size.

**Restore SQLite Database** (`RestoreSqliteDatabaseDialog`) overwrites the live database file with a chosen backup. Gzip backups are auto-detected (via the `0x1f 0x8b` magic bytes) and decompressed first. The source is verified with `PRAGMA integrity_check` before anything is overwritten, so a non-SQLite file is rejected without touching the live database. A **Save a copy of the current database first** toggle (default **on**) snapshots the existing file to `<name>.pre-restore-<timestamp>.db` before swapping. The connection is closed (checkpointing WAL), the file is replaced, stale `-wal`/`-shm` sidecars are removed, and the connection is reopened. The `databases` cache is invalidated after a successful restore.

#### MongoDB Backup & Restore

MongoDB connections expose the same **Back Up…** and **Restore…** context-menu section (gated by `hasBackupRestore`, which `MongoDbProvider` now reports `true`). The database-node context menu branches on `connection.provider`: MongoDB databases open the Mongo-specific dialogs. Calls flow through `window.api.database.mongo*` → `mongo:*` IPC → `DatabaseManager` (guarded by `provider instanceof MongoDbProvider`) → `MongoDbProvider`. The feature is **local-only** (files written/read on the client machine via `mongo:pick-backup-path` / `mongo:pick-restore-file`) and uses two engines transparently:

- **mongodump / mongorestore** — preferred when the binaries are found on the system `PATH` or at the paths configured in *Settings → Databases Config → MongoDB Database Tools*. Backups invoke `mongodump --uri=… --db=… --archive=<file> [--gzip]`, producing a BSON archive; restores invoke `mongorestore --uri=… --archive=<file> [--gzip] [--drop] [--stopOnError]`, with a namespace remap (`--nsFrom=<src>.* --nsTo=<target>.*`) when the target database differs from the source. The connection URI (with auth/authSource/replicaSet/TLS) is reused from the connection record; the password is masked in the command preview.
- **Pure-JS fallback** — used automatically when the binaries are missing (or for SSH-tunnelled connections the external tools cannot reach). The driver serializes every collection to a single **EJSON** document map via `bson`'s `EJSON` (preserving `ObjectId`/`Date` and other BSON types); restore parses it and `insertMany`s into the target database, optionally dropping each collection first.

The two engines produce **non-interchangeable** files, so the extension selects the restore engine deterministically: `.archive[.gz]` → `mongorestore`, `.json[.gz]` → JS engine (gzip auto-detected by the trailing `.gz`).

**Back Up MongoDB Database** (`BackupMongoDatabaseDialog`) configures the destination file and a gzip toggle, shows an engine banner (CLI vs JS), and offers a **Preview Command** toggle (enabled when `mongodump` is available) showing the assembled command with the password masked.

**Restore MongoDB Database** (`RestoreMongoDatabaseDialog`) takes a source `.archive`/`.json` backup, a target database (defaulting to the source), a **drop collections before restoring** toggle, and a stop-on-first-error toggle. The `databases` cache is invalidated after a successful restore.

The binary paths live in `AppSettings` (`mongodumpPath`, `mongorestorePath`) and are configurable in *Settings → Databases Config → MongoDB Database Tools*.

#### Redis Provider

`src/main/database/providers/RedisProvider.ts` adds support for Redis key-value stores using the **ioredis** library. All three Redis deployment models are supported:

| Mode | Description |
|------|-------------|
| **Standalone** | Single Redis instance (default). |
| **Cluster** | Redis Cluster — connects to one seed node; ioredis discovers the rest. Only DB 0 is available. |
| **Sentinel** | High-availability setup managed by one or more Sentinel nodes. Provide a comma-separated list of `host:port` sentinel addresses and the master name. |

**Authentication**
- Standard password-only AUTH
- Redis 6+ ACL: optional username + password pair

**TLS / SSL** — Enable with the *Enable TLS/SSL* checkbox. Optionally set a custom Server Name (SNI) and toggle certificate validation.

**SSH Tunneling** — Supports password authentication or private key (PEM/OpenSSH) with optional passphrase. The tunnel is created via **ssh2** by spinning up a local TCP server that forwards all socket traffic through the SSH channel. SSH tunneling is not available for Cluster mode because Redis Cluster nodes communicate using their announced hostnames, which cannot all be routed through a single tunnel.

**Explorer Tree**
- The top-level node lists logical databases (DB 0–N). Cluster mode shows only DB 0; other modes query `CONFIG GET databases` to determine the count.
- **Hide Empty Logical Databases** (connection option, Redis only) — when enabled, the database list only shows logical databases that contain at least one key. This is determined by issuing `SELECT i` + `DBSIZE` for each candidate database at connect time. Cluster mode is unaffected (always shows DB 0). If the DBSIZE check fails for a particular database, that database is shown to prevent silent data loss. The user can **refresh** the database list (via the right-click context menu on the connection node) to re-evaluate and reveal databases that have received keys since the connection was opened.
- Database nodes are leaf nodes (not expandable in the tree). Key management is done via the **Database Explorer** tab.
- **Right-click context menu on a database node:**
  - **Explore Data** — opens the Database Explorer tab for that database (see below). Double-clicking a database node has the same effect.
  - **Refresh** — re-fetches the list of logical databases from the server.

**Redis Database Explorer**

Each logical database can be explored in a dedicated tab opened via right-click → **Explore Data** or double-clicking the database node. Only one tab is opened per `(connection, db index)` pair; subsequent opens re-focus the existing tab.

The tab displays all keys in a searchable, sortable, paginated table with namespace tree grouping:

| Column | Description |
|---|---|
| **#** | Row number (counts only leaf key rows, not folder rows) |
| **Key Name** | The Redis key string, prefixed by a type icon and optional expand chevron. Includes tree indentation for nested namespaces. |
| **TTL** | Remaining TTL in human-readable form, or "No expiry" for persistent keys. Hovering shows the exact expiry datetime. |
| **Value** | Preview of the value: first ~100 characters for strings, or element/field/member count for collection types. |
| **Type** | Redis type badge: `string`, `list`, `set`, `zset`, `hash`, or `stream` (color-coded). |
| **Size** | Memory usage in bytes (from `MEMORY USAGE`), or `—` if unavailable. |
| **Actions** | Edit icon (open edit dialog) and Delete icon (with confirmation). |

**Namespace tree grouping** — when no search is active, keys are automatically grouped into collapsible namespace folders based on the `:` separator. Keys sharing a common prefix (e.g. `user:1`, `user:2`) appear under a `user` folder row. Folders nest recursively. Clicking a folder row expands or collapses it. Single keys with a unique prefix are not grouped.

**Type icons** — each key row shows a colored icon representing its Redis type: `Type` for string, `List` for list, `Braces` for set, `ListOrdered` for zset, `Hash` for hash, `Activity` for stream.

**Inline container expansion** — keys of container types (`list`, `set`, `zset`, `hash`, `stream`) show a chevron button. Clicking it fetches and expands the key's items inline as child rows, showing field names/indices and values. The value is cached; subsequent toggles do not re-fetch.

**Toolbar controls:**
- **Search** — filters key names and value previews in real-time. When a search is active, tree grouping is disabled and all matching keys are shown as a flat list.
- **Refresh** button — re-fetches all keys from Redis.
- **Rows per page** dropdown — 10 / 25 / 50 / 100 / 250.
- **Pagination** — prev / page-of-total / next navigation.

Clicking any column header sorts by that column (click again to reverse). All filtering and sorting is client-side after the initial full key load.

**Edit dialog** — clicking the edit icon opens a modal that loads the full key value:
- `string` → editable textarea
- `list` → ordered list of items with add/remove controls
- `set` → set of members with add/remove controls
- `zset` → member + score pairs with add/remove controls
- `hash` → field/value pairs with add/remove controls
- `stream` → read-only display (stream entries are immutable)

The dialog also exposes a **TTL** field (seconds; `-1` = no expiry) and a **Delete** button (with confirmation). Saving a key rewrites the full value via `DEL` + type-specific write commands + optional `EXPIRE` / `PERSIST`.

**Query Execution**
- The query tab for Redis connections uses `plaintext` Monaco editor mode (no SQL syntax highlighting).
- Commands are entered as plain Redis commands, e.g. `GET mykey` or `HGETALL myhash`.
- Results are automatically normalized: scalar responses appear in a single `result` column; arrays appear in a `value` column; hash / object responses appear as `field` / `value` pairs.
- All standard Redis commands supported by ioredis can be executed.

**Capabilities** — All relational capability flags (`hasCreateDatabase`, `hasStoredProcedures`, etc.) are `false` for Redis. This automatically suppresses ERD, stored procedures, user-defined types, execution plan, and client statistics UI surfaces.

**Redis Dashboard**

Right-clicking a connected Redis connection shows a **Dashboard** option in the context menu. Selecting it opens a dedicated dashboard tab (one per connection — subsequent opens re-focus the existing tab rather than duplicating it). The dashboard displays a snapshot of the server's `INFO all` output, organized into collapsible sections:

| Section | Contents |
|---|---|
| **Server** | Redis version, deployment mode (standalone / cluster / sentinel), OS, process ID, TCP port, uptime (human-readable), Hz |
| **Memory** | Used / peak / RSS / Lua memory (human-readable), max-memory limit and eviction policy, fragmentation ratio, allocator |
| **Stats** | Connected / blocked clients, total connections received, total commands processed, instantaneous ops/sec, rejected connections, net input/output bytes, Pub/Sub channels |
| **Cache Efficiency** | Keyspace hits, misses, computed hit ratio percentage, expired keys, evicted keys |
| **Persistence** | RDB changes since last save, background save in-progress flag, last RDB status, last save timestamp, AOF enabled flag, last AOF rewrite status, AOF file size |
| **Replication** | Role (master / slave), connected replicas count, master host:port, master link status, replication offset, replication ID; Cluster nodes table (address, role, status, flags) when in cluster mode |
| **Key Statistics** | Table of logical databases (index, key count, expires count, average TTL in ms) |
| **Maintenance** | Safe commands (BGSAVE, BGREWRITEAOF, MEMORY PURGE, SLOWLOG RESET) and destructive commands (FLUSHDB per logical database, FLUSHALL); all require confirmation; FLUSHDB and FLUSHALL use `variant: 'danger'` dialogs |
| **All Redis INFO** | Searchable table of every raw key/value pair from `INFO all`, grouped by section |

**Refresh behaviour:**
- A **Refresh** button in the header triggers an immediate re-fetch.
- An automatic interval (30 s) re-fetches in the background while the tab is mounted.
- When *Background Auto-Refresh* is enabled for the connection, the dashboard also refreshes whenever an `onBackgroundRefresh` IPC event fires for that connection. An "Auto-refresh on" badge is shown in the header when this mode is active.
- The last-refreshed timestamp is displayed next to the refresh button.

**Header actions:**
- **Copy Snapshot** — serializes the full parsed `RedisDashboardSnapshot` to the clipboard as formatted JSON.
- **Open Raw INFO** — opens a new query tab pre-populated with `INFO all` and the raw INFO output as a comment block.

**Maintenance commands — warnings:**
- FLUSHDB and FLUSHALL display a `variant: 'danger'` confirmation dialog with an explicit irreversibility warning before executing.
- In cluster mode, MEMORY PURGE is unsupported by Redis and returns an informational error message rather than crashing.
- Each maintenance command runs asynchronously; a result badge (green for success, red for error) is shown in the body area after completion, and the dashboard auto-refreshes 500 ms later on success.

**Redis ACL User Management**

Redis 6+ ACL users are exposed under the **Users** folder in the Explorer tree (under the connection node). Full CRUD is available:

- **Add User** — right-click the *Users* folder → *Add User*, or click the *Add User* button inside the dialog.
- **Edit User** — right-click a user node → *Edit User*, or double-click the node.
- **Delete User** — right-click a user node → *Delete User* (with confirmation). The `default` user cannot be deleted.

The **Manage Redis Users** dialog (`ManageRedisAclUsersDialog`) has a two-panel layout (list on the left, editor on the right) and three tabs:

| Tab | Fields |
|-----|--------|
| **General** | Username (read-only when editing), Password (leave blank to keep current), Account enabled toggle, No-password (nopass) toggle |
| **Commands** | Allow all commands toggle; when unchecked, individual ACL category checkboxes (`@read`, `@write`, `@string`, `@hash`, `@list`, `@set`, `@sortedset`, `@geo`, `@stream`, `@pubsub`, `@admin`, `@dangerous`, `@scripting`, `@transactions`) |
| **Keys & Channels** | All-keys toggle + key-pattern chips with add/remove; All-channels toggle + channel-pattern chips with add/remove |

Save uses `ACL SETUSER <name> reset …` to atomically replace all permissions. Username rename is implemented as create-new + delete-old (Redis has no native rename command).

**Redis Backup & Restore**

Redis connections can back up and restore their key-value data. The feature has its own context-menu section (separate from the relational `hasBackupRestore` gate, since Redis tree nodes are not `database` nodes):

- **Per database** — right-click a keyspace node (e.g. *DB 0*) → **Backup** / **Restore**. Backs up or restores just that database index.
- **All databases** — right-click the **Databases** group node → **Backup all databases** / **Restore all databases**. Covers every configured database (DB 0 only in cluster mode).

Calls flow through `window.api.database.redis*` → `redis:*` IPC → `DatabaseManager.redisBackup` / `redisRestore` (guarded by the provider exposing `backupDatabases` / `restoreDatabases`) → `RedisProvider`. After a successful restore the connection's cached keyspaces (`<connectionId>/redis-*`) are invalidated so the tree re-scans the restored keys.

The feature is **local-only** and built on Redis's native serialization for lossless fidelity across every value type — string, list, set, zset, hash, and **stream** (which the key editor cannot recreate). For each key in scope the provider issues `DUMP` (binary, via ioredis's `dumpBuffer`) plus `PTTL`, storing the payload base64-encoded with its millisecond TTL. The backup is a single JSON file (optionally gzipped) written/read via Electron dialogs (`redis:pick-backup-path` / `redis:pick-restore-file`):

```json
{ "spiralRedisBackup": 1, "createdAt": "…", "source": { "connectionName": "local", "mode": "standalone" },
  "databases": [ { "index": 0, "keys": [ { "key": "user:1", "pttl": -1, "payload": "<base64 DUMP>" } ] } ] }
```

**Back Up Redis Database** (`BackupRedisDatabaseDialog`) shows the scope (single DB index or all databases), a destination file, and a gzip toggle. On success it reports the key count, database count, and file size.

**Restore Redis Database** (`RestoreRedisDatabaseDialog`) takes a source `.json`/`.json.gz` file (gzip auto-detected) and a **conflict mode** for keys that already exist:

| Mode | Behavior |
|------|----------|
| **Overwrite existing keys** | `RESTORE … REPLACE` — each backed-up key overwrites any current key of the same name; other keys are untouched. |
| **Flush database first** | `FLUSHDB` the target before restoring, so it exactly matches the backup. |
| **Skip existing keys** | Plain `RESTORE`; `BUSYKEY` collisions are counted as skipped and left in place. |

For a single-database backup the dialog also offers a **target database index** (defaulting to the original), so a database can be restored into a different index. Multi-database backups always restore each key to its original index. On success it reports keys restored, keys skipped, and database count.

Restore requires a target Redis whose `RESTORE` accepts the source's `DUMP` serialization version (restoring into an older Redis than the one that produced the backup may fail with a version/checksum error).

**MongoDB User Management**

MongoDB users are exposed under the **Users** folder in the Explorer tree (under the connection node, below Security). Full CRUD is available:

- **Add User** — right-click the *Users* folder → *Add User*, or click the *Add User* button inside the dialog.
- **Edit User** — right-click a user node → *Edit User*.
- **Delete User** — right-click a user node → *Delete User* (with confirmation).

The **Manage MongoDB Users** dialog (`ManageMongoUsersDialog`) has a two-panel layout (list on the left, editor on the right) and two tabs:

| Tab | Fields |
|-----|--------|
| **General** | Username (read-only when editing), Password (leave blank when editing to keep current), Confirm Password |
| **Roles** | Table of assigned roles — each row has a role name dropdown (all built-in MongoDB roles) and a database field. Rows can be added or removed individually. |

Users are stored in the `admin` database. The provider calls `usersInfo`, `createUser`, `updateUser`, and `dropUser` MongoDB commands. Password is only sent when provided (new users or explicit password change).

#### MongoDB Provider

`src/main/database/providers/MongoDbProvider.ts` adds support for MongoDB using the official **mongodb** Node.js driver.

**Connection methods**

| Method | Description |
|--------|-------------|
| **MongoDB URI** | Supply a full `mongodb://` or `mongodb+srv://` connection string. Overrides all other fields when provided. |
| **Structured form** | Host, port, username, password, default database, auth mechanism, auth source, replica set name, and direct-connection toggle. |

**Authentication mechanisms**

| Mechanism | Notes |
|-----------|-------|
| **SCRAM-SHA-256** | Default. Username + password required. |
| **SCRAM-SHA-1** | Older MongoDB auth. Username + password required. |
| **X.509** | Certificate-based auth. Requires a client certificate / key file. Username and password fields are hidden. |
| **GSSAPI (Kerberos)** | Username required; password optional depending on Kerberos config. |
| **PLAIN (LDAP)** | Username + password required. |
| **MONGODB-AWS** | AWS IAM authentication. Username / password map to Access Key ID / Secret (access token via environment or connection form). |

**TLS / SSL**
- Toggle *Enable TLS/SSL* to enable encrypted transport.
- Optional fields: CA certificate file, client certificate / key file, certificate key passphrase.
- *Allow invalid hostnames* and *Allow invalid certificates* checkboxes are provided for development/testing (the latter is flagged insecure in the UI).

**SSH Tunneling** — Supports password authentication or private key (PEM/OpenSSH) with optional passphrase. A local TCP server forwards all socket traffic through the SSH channel before the MongoDB driver connects.

**Explorer Tree**
- Expanding a connection lists all databases available to the authenticated user via `listDatabases`.
- Each database node (`mongodb-db:<dbName>`) expands to a **Collections** folder (`mongodb-collections:<dbName>`).
- Expanding the Collections folder lists all collections in that database.
- Collection nodes are typed as `mongodb-collection` and are leaf nodes.

**Query Execution**
- The query tab for MongoDB connections uses `json` Monaco editor mode (JSON syntax highlighting and colorization).
- Two query styles are supported:
  - **Shell-like syntax**: `db.<collection>.<method>(<args>)` — e.g. `db.users.find({ active: true })`. Arguments are parsed as relaxed JSON.
  - **JSON command document**: `{ "command": "<method>", "collection": "<name>", "filter": {...}, "document": {...}, "options": {...} }` — used when a more structured form is needed. Supported command values: `find`, `findOne`, `insertOne`, `insertMany`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `aggregate`, `countDocuments`, `distinct`, `drop`, `createIndex`, `dropIndex`, `listIndexes`.
- Results are returned as a table of documents. Each row represents one document; field values are serialized to JSON strings where necessary.

**Capabilities** — `hasCreateDatabase` and `hasCreateTable` (create collection) are `true`. All other relational capability flags (`hasStoredProcedures`, `hasFunctions`, `hasUserDefinedTypes`, etc.) are `false`, suppressing ERD, stored procedures, user-defined types, execution plan, and client statistics UI surfaces.

#### MongoDB Database Context Menu

Right-clicking a **database** node in the Explorer tree opens a context menu with:

| Option | Action |
|--------|--------|
| Create Collection | Opens the Create Collection dialog |
| Refresh Collections | Reloads the collection list for this database |

#### MongoDB Collection Context Menu

Right-clicking an individual **collection** node opens a context menu with:

| Option | Action |
|--------|--------|
| Add Document | Opens the Add/Edit Document dialog in add mode for this collection |
| Rename Collection | Opens the Rename Collection dialog |
| Drop Collection | Shows a confirmation dialog; removes the collection permanently on confirm |

#### MongoDB Add / Edit Document Dialog

Spiral includes a full-featured dialog for adding new documents to a collection or editing existing ones. Documents are serialized as **Extended JSON v2 (EJSON canonical)** — the same format used to pass documents over the IPC bridge — so all BSON types round-trip correctly.

**Entry points:**
- **Add Document** — right-click a collection in the Explorer tree and choose *Add Document*, or click the **Add Document** toolbar button that appears above MongoDB query results.
- **Edit Document** — hover over a document card in the Mongo query results and click the **Edit** button, or right-click the card and choose *Edit Document*.

**Dialog layout:** The dialog is split into two panels:
- **Left panel — Fields editor**: A recursive tree editor where each field shows:
  - Field name (editable input; `_id` is non-editable in both modes)
  - BSON type selector (all 16 types supported; `_id` type is locked)
  - Value input — adapts to the chosen type (text, number spinner, boolean dropdown, ISO date string, etc.)
  - For `Object` and `Array` fields, child fields can be added and nested as deeply as needed
  - Remove button for all fields except `_id`
  - Warning indicator on field names that contain `.` or start with `$`
- **Right panel — JSON editor / preview**: Shows the document as an EJSON JSON string in a Monaco editor (editable). A *Preview* toggle switches to a read-only `JsonViewer` rendering of the document.

**Bidirectional sync:** Editing a field in the left panel immediately re-serializes the full document and updates the Monaco editor. Editing directly in the Monaco editor parses the EJSON and updates the fields panel in real time. If the Monaco JSON is invalid, the fields panel retains the last valid state and a parse-error banner is displayed.

**BSON type support:**

| Type | EJSON representation |
|------|---------------------|
| String | `"value"` |
| Int32 | `{"$numberInt": "42"}` |
| Int64 | `{"$numberLong": "123"}` |
| Double | `{"$numberDouble": "3.14"}` |
| Decimal128 | `{"$numberDecimal": "0.1"}` |
| Boolean | `true` / `false` |
| Null | `null` |
| Date | `{"$date": "ISO 8601 string"}` |
| ObjectId | `{"$oid": "24-char hex"}` |
| Object | `{...}` (nested key-value pairs) |
| Array | `[...]` (ordered list of values) |
| Binary | `{"$binary": {"base64": "...", "subType": "00"}}` |
| Regex | `{"$regularExpression": {"pattern": "...", "options": ""}}` |
| Timestamp | `{"$timestamp": {"t": 0, "i": 0}}` |
| MinKey | `{"$minKey": 1}` |
| MaxKey | `{"$maxKey": 1}` |

**New documents:** Always start with an `_id` field of type `ObjectId` pre-filled with a freshly generated 24-hex ID. The `_id` name, type, and value are non-editable to prevent accidental mismatches (the raw JSON panel can still be edited if a custom `_id` is needed).

**Editing existing documents:** The `_id` row is fully disabled (name, type, and value). The `replaceOne` IPC call uses the `_id` extracted from the document to locate and replace the document server-side. A "Document not found" error is surfaced if the document was deleted between opening the dialog and saving.

**On success:** The dialog closes and the active query tab automatically re-executes its last query to refresh results.

#### MongoDB Query Tab

Double-clicking a MongoDB collection node opens a **Query** tab bound to that collection. If a tab for the same connection, database, and collection is already open, it is focused instead of opening a duplicate. The **New Query** toolbar button also opens a collection-bound query tab when a MongoDB collection node is selected in the tree.

When a collection-bound query tab is opened, it is pre-populated with:
```
/*
 * Write your query here, or execute empty query to get entire collection.
 */
```

The editor uses **JSONC** syntax highlighting (JSON with Comments).

**Executing a query:**
- **Empty editor** (only the starter comment or whitespace) → runs `db.<collection>.find({})` — returns all documents.
- **JSON filter object** (e.g. `{ "status": "active" }`) → runs `db.<collection>.find(<filter>)`.
- **Full shell command** (starts with `db.`) → passed through unchanged, e.g. `db.users.countDocuments({ active: true })`.

**Results rendering:** Query results for a collection-bound tab are displayed as individual JSON document cards in the results pane. Each document is rendered using the interactive **JsonViewer** component (see [JsonViewer Component](#jsonviewer-component) below). If no documents are returned, an empty state message is shown.

**IPC channel:** `database:execute-query` → `MongoDbProvider.executeQuery()` → `MongoDbProvider.runShellCommand()` — parses and dispatches `db.collection.method(args)` shell commands against the live MongoDB connection. The `QueryResultSet` returned includes a `rawDocuments` array of serialized JSON strings alongside the tabular row/column data used for other providers.

#### Create Collection Dialog

A compact modal for adding a new collection to a MongoDB database.

- **Collection Name** — a text input (auto-focused). Must be non-empty and must not start with `system.`.
- Validation errors appear inline below the input; server errors are shown in an error box.
- On success, the Collections folder for that database is refreshed.

#### Rename Collection Dialog

A compact modal for renaming an existing MongoDB collection.

- **New Name** — a text input pre-populated with the current collection name (auto-focused). Must be non-empty, must differ from the current name, and must not start with `system.`.
- Validation errors appear inline; server errors are shown in an error box.
- On success, the Collections folder for that database is refreshed.

**IPC channels**
- `database:create-collection` → `MongoDbProvider.createCollection()` — calls `db.createCollection()`.
- `database:rename-collection` → `MongoDbProvider.renameCollection()` — calls `collection.rename()`.
- `database:drop-collection` → `MongoDbProvider.dropCollection()` — calls `db.dropCollection()`.

---

#### MongoDB Aggregations

Under each MongoDB collection in the Explorer tree there is an **Aggregations** folder node (`mongodb-collection-aggregations`). Aggregations are locally-stored named pipeline definitions — MongoDB has no native concept of saved pipelines, so they are persisted in an `electron-store` file (`mongo-aggregations.json`), keyed by connection / database / collection.

**Tree integration**
- Expanding the Aggregations folder lists all saved aggregations for that collection as individual `mongodb-aggregation` leaf nodes.
- Right-clicking the folder shows: **Create Aggregation** (opens the dialog in new mode) and **Refresh**.
- Right-clicking an aggregation node shows: **Edit Aggregation** and **Delete Aggregation** (with confirmation).

**Manage Aggregations dialog** — opened via the context menu or by double-clicking an aggregation node. Layout: 220px left panel (list of saved aggregations + Add button) and an editor panel on the right.

- **Name** — required text field.
- **Document Examples** — collapsible section showing the first 3 documents from the collection, formatted as Extended JSON.
- **Pipeline Stages** — an ordered list of stages that form the aggregation pipeline. Each stage card contains:
  - **Drag handle** — HTML5 drag-and-drop to reorder stages.
  - **Stage type** — searchable dropdown (`SearchableSelect`) listing 31 `$` pipeline operators, each with a short description. Selecting a type pre-fills the JSON editor with a minimal valid template.
  - **Enable / Disable toggle** — disabled stages are omitted from the preview and from the saved pipeline.
  - **Collapse / Expand** — hides the editor and preview pane to save vertical space.
  - **Monaco JSON editor** — edits the stage body (the argument to the `$` operator). Validates JSON on every keystroke and shows inline errors. Supports field-name intellisense: registers a Monaco completion provider for the `json` language that suggests `$fieldName` completions from the collection's sampled field list.
  - **Preview pane** — runs the pipeline up to (and including) this stage and shows results in a mini table (up to 20 rows). Has an **Auto** toggle (debounced, ~600ms) and a **Run** button. Preview is per-stage, not full-pipeline.

**Validation** — before saving: name must be non-empty; every enabled stage must have a valid JSON body. Stage-level JSON errors are shown inline; dialog-level errors appear in an error box.

**IPC channels**
- `database:get-mongo-aggregations` → `DatabaseManager.getMongoAggregations()` — reads from `aggregationsStore`.
- `database:save-mongo-aggregation` → `DatabaseManager.saveMongoAggregation()` — upserts in `aggregationsStore` (creates new if no `originalId`, updates otherwise).
- `database:delete-mongo-aggregation` → `DatabaseManager.deleteMongoAggregation()` — removes from `aggregationsStore`.
- `database:run-mongo-aggregation` → `MongoDbProvider.runMongoAggregation()` — executes the provided pipeline slice via `collection.aggregate()` and returns a `QueryResultSet`.
- `database:get-mongo-aggregation-sample` → `MongoDbProvider.sampleDocuments()` — fetches the first N documents (default 3) as Extended JSON strings.

---

#### MongoDB Collection Validation

Under each MongoDB collection in the Explorer tree there is a **Validation** leaf node (`mongodb-collection-validation`). Unlike aggregations, validation rules are stored **on the MongoDB server** — get via `db.listCollections()` and set via `db.command({ collMod })`.

**Access:**
- Double-clicking the Validation node opens the Collection Validation dialog.
- Right-clicking shows **Edit Validation Rules**.

**Collection Validation dialog** — single-panel dialog with:

- **Controls row** — Action dropdown (Warning / Error / Error and Log) and Level dropdown (Off / Moderate / Strict) on the left; **Generate Rules** button on the right.
- **JSON editor** — Monaco editor (language: `json`) for the full validator document (e.g. `{ $jsonSchema: { ... } }`). Loaded from the server on open; empty `{}` if none is set.
- **Test section** — **Test Rules** button runs the validator against the collection and shows two columns: Passed Validation and Failed Validation, each with paginated document lists (20 per page).
- **Footer** — Cancel and Save Rules buttons. Save calls `collMod` to apply the validator to MongoDB.

**IPC layer:**
- `database:get-mongo-validation` → `MongoDbProvider.getMongoValidation()` — reads `options.validator`, `options.validationAction`, `options.validationLevel` from `db.listCollections()`.
- `database:save-mongo-validation` → `MongoDbProvider.saveMongoValidation()` — applies via `db.command({ collMod: collectionName, validator, validationAction, validationLevel })`.
- `database:test-mongo-validation` → `MongoDbProvider.testMongoValidation()` — finds passing docs using the validator as a query filter, failing docs using `{ $nor: [validator] }`; capped at 200 docs per side.
- `database:generate-mongo-validation-rules` → `MongoDbProvider.generateMongoValidationRules()` — samples 100 documents via `$sample`, infers a `$jsonSchema` with `bsonType`, `properties`, and `required` fields.

---

#### Connection Management

User-created database connections are persisted via `electron-store` and loaded on startup. The Explorer tree reflects only the connections the user has saved; there is no seeded mock data.

Each `ConnectionRecord` stores two automatic timestamps (ISO-8601 strings):

- **`createdAt`** — stamped once by the main process when the connection is first saved.
- **`lastUsedAt`** — updated by the main process every time a successful `database:connect` call completes for that connection.

These timestamps drive the **Creation Date** and **Last Used** sort options described below.

#### Connection Toolbar (Search, Filter, Sort)

A compact toolbar sits below the *New Connection* button in the Explorer left panel. It contains:

- **Search input** — filters the visible connection list in real time by connection **name** or **host**. The search is case-insensitive and matches partial strings.
- **Filter button** (SlidersHorizontal icon) — opens a dropdown panel with multi-select checkboxes for **Provider** and **Environment** (only shown when at least one environment has been created), plus a single-select **Status** section. Checking one or more provider/environment items limits the list to connections that match *any* checked provider **and** *any* checked environment (the two groups are ANDed). The **Status** section has two mutually-exclusive options — **Online** (currently connected) and **Offline** (anything not connected: disconnected, connecting, or error). Selecting one deselects the other; clicking the already-selected option clears it and shows all connections regardless of state. Status is ANDed with the provider and environment filters. The filter button shows a visual highlight when any filter (provider, environment, or status) is active.
- **Sort button** (ArrowUpDown icon) — opens a dropdown panel with two sections:
  - **Sort field**: Name, Creation Date, Last Used, Provider, Environment, Status.
  - **Sort direction**: Ascending / Descending.

When sorting by **Provider**, **Environment**, or **Status**, the connection list switches from a flat list to a grouped view. A visually distinct group-header label appears above each group. Within each group, connections are sorted by name ascending regardless of the overall sort direction. When sorting by **Environment**, connections without an assigned environment are always placed in a **"No environment"** bucket that appears last, regardless of direction. When sorting by **Status**, connections are grouped under **Online** (currently connected) and **Offline** (anything not connected); ascending puts **Online** first, descending puts **Offline** first.

Legacy connections created before this feature was introduced do not have `createdAt` or `lastUsedAt` values. When sorting by these fields, undated connections always appear after dated ones, regardless of direction.

The current sort state and search/filter values are local to the Explorer session and reset to the configured default on app start (see **Default Connection Sort** in Settings → General).

**New Connection dialog** — opened by the *New Connection* button in the panel header. The dialog has three tabs: **Connection Details**, **Connection String**, and **Options**.

The **Connection Details** tab has two columns:

| Left column | Right column |
|-------------|--------------|
| Name | Provider |
| Host | Port |
| Username | Password |
| Default Database (full-width) | |

A **Remember Password** checkbox sits directly below the Password field. When unchecked the password is not persisted to disk; when checked it is stored alongside the other connection fields.

An **Anonymous Login** checkbox sits directly below the Username field (same style as *Remember Password*). When checked, the **Username** and **Password** fields (and the *Remember Password* checkbox) are disabled, and the username/password are **not persisted** even if values were entered before ticking it. A connection saved as anonymous connects with no credentials and skips the [Enter Password](#enter-password-prompt-unsaved-password) prompt entirely when connected from the Explorer sidebar. Anonymous Login is offered for SQL Server, PostgreSQL, MySQL, MongoDB, and Redis (it is not shown for SQLite, which has no authentication).

The **Options** tab exposes additional settings per connection:

- **Icon Color** — a native OS color picker that overrides the provider's default icon color for this connection's tree-view entry. Leaving the color empty (or clicking *Reset to default*) falls back to the provider's default color defined in `PROVIDER_METADATA`.
- **Auto Connect** — when enabled, the application will silently attempt to connect to this database immediately on startup. If the connection fails for any reason the connection is left in the `disconnected` state; no error is shown to the user.
- **Eager Loading** — when enabled, the application pre-fetches the database tree structure in the background immediately after connecting, so that expanding the tree feels instant rather than waiting for each level to load on demand.
- **Background Auto Refresh** — when enabled, Spiral silently watches the expanded areas of the tree for this connection and automatically refreshes their contents when schema changes are detected, without showing loaders or flickering the UI. The feature uses an adaptive polling cadence: every **8 seconds** while the app window is focused, and every **30 seconds** when unfocused. The watch is limited to a rolling batch of up to 10 nodes per cycle (round-robin) to keep system load minimal. Only nodes that are currently expanded and fully loaded are watched; the first observation after connecting baselines silently so no spurious refresh is triggered on startup.

**Providers** — the provider dropdown is driven by `PROVIDER_METADATA` (`providerMetadata.ts`) so new providers appear automatically without changing the dialog form. Currently only *SQL Server* is registered.

**Test Connection** — the button is present in the dialog action row (left side) but is not active in the current release. Save and Cancel are on the right side.

**Validation** — Name, Host, and Username are required. Port must be an integer between 1 and 65535 (defaults to 1433 for SQL Server). Validation errors appear inline below each field and clear as soon as the user corrects the value.

#### Environments And Query Safety

Spiral supports named connection environments such as **Production**, **QA**, and **Development**. Environments are managed from **Settings → General → Manage Environments**.

Each environment stores:

- A display name
- An optional description
- A color used throughout the Explorer UI
- A **Critical** flag for high-risk targets

Environments can be assigned per saved connection from the **Options** tab in the New/Edit Connection dialog.

When a query tab is associated with a connection that has an environment assigned:

- A banner is shown above the SQL editor with the environment name and tinted environment color
- The active query tab shows a bottom accent line using the environment color

When an environment is marked as **Critical**:

- **Interactive Table Mode** is disabled for results opened through that connection, even if the global setting is enabled
- The query results header shows **Interactive Table Mode: Off** in red to indicate the override
- Any query that is not clearly read-only triggers a confirmation dialog before execution

The critical-environment confirmation dialog includes a **Do not ask me again for this tab** option. That suppression is scoped to the current query tab only and is cleared when the tab is closed.

If an environment is deleted while still assigned to saved connections, Spiral prompts for confirmation and clears the affected connection assignments automatically.

#### Connection Context Menu

Right-clicking any saved connection row in the Explorer panel opens a custom HTML context menu (rendered via the shared `Menu` component as a React portal). The available options adapt to the current connection state:

| Connection state | Menu items shown |
|---|---|
| `disconnected` / `error` | Edit, Connect, Connect As…, Duplicate, Delete |
| `connecting` | Edit, Connect As…, Duplicate, Delete |
| `connected` | Edit, Disconnect, Connect As…, Duplicate, Delete |

(`Connect As…` is shown for all non-SQLite providers regardless of state; SQLite has no authentication so it is omitted.)

**Edit** — opens the connection dialog pre-filled with the saved connection details. The dialog title changes to *Edit Connection* and the save button changes to *Update*. If the connection is currently active (`connected` or `connecting`), the user is asked to confirm disconnecting before the dialog opens. If declined, no action is taken. After saving, the connection remains disconnected; reconnecting requires an explicit click.

**Connect** — connects to the database via the saved credentials and expands the connection row to show the Databases folder. Equivalent to the existing expand-to-connect flow.

**Disconnect** — calls the backend disconnect API, collapses the connection row, clears all cached tree node state for that connection, and resets the runtime status to `disconnected`. The connection record is not deleted; it can be reconnected at any time.

**Connect As…** — a submenu for connecting with an *additional user profile* configured on the connection (see [Additional User Profiles](#additional-user-profiles)). When the connection has a main *Username*, that user is listed first, labeled `«username» (Default)`; selecting it connects (or reopens the Enter Password dialog, as below) using the connection's own main credentials. It's followed by one entry per additional profile, labeled by the profile's *Profile Name* (falling back to its *Username* when no name is set). Selecting an entry connects using its credentials via the same credential-override path as the Enter Password flow (the credentials are used for that connect only and never overwrite the main connection user, except for the default-user entry which *is* the main user). If the chosen entry has no saved password, the **Enter Password** dialog opens pre-filled with its username; ticking **Remember password** persists the password onto that profile (encrypted) — or, for the default-user entry, onto the main connection user. If an entry *with* a saved password fails to authenticate, the same dialog is reopened seeded with its username and the returned login error (shown in an `ErrorBox`), letting the user correct the password and retry. Below the list, a divider (shown only when the default user and/or at least one profile exists) precedes a **Manage Users** item that opens the connection dialog focused on the **Users** tab.

**Duplicate** — opens a small dialog (`DuplicateConnectionDialog`) with a single *New Name* field pre-filled with *"«name» - Copy"*. Choosing **Duplicate** creates a brand-new saved connection that carries over every setting of the source connection (host, port, credentials, and all provider-specific options), assigned a fresh `id` by the backend, and appends it to the tree. Identity/transient fields (`id`, `createdAt`, `lastUsedAt`) and the source's saved ERD file references (`erdFiles`) are *not* copied — the copy starts clean. The name field is required; **Cancel** closes the dialog without creating anything.

**Delete** — removes the saved connection permanently. A confirmation prompt is shown first:
- For disconnected connections: *"Are you sure you want to delete «name»?"*
- For active connections: *"«name» is currently connected. Disconnect and delete this connection?"*

If confirmed, any live session is disconnected first, then the connection record is removed from the store and from the Explorer tree. Declining the prompt leaves everything unchanged.

The menu is rendered via the shared `Menu` component. Labels match the active application language via the i18n system.

#### Additional User Profiles

Beyond its main/default `username` and `password`, each connection can store any number of **additional user profiles** for connecting to the same database under different accounts (e.g. a read-only user vs. an admin). These are configured in the **Users** tab of the Add/Edit Connection dialog and consumed by the [Connect As…](#connection-context-menu) submenu.

Each profile has:
- **Profile Name** *(optional)* — a friendly label shown in the Connect As… list; when empty the profile's username is shown instead.
- **Username** *(required — the only required field)*.
- **Password** *(optional)* — leave empty to be prompted on connect.

In the **Users** tab, profiles are listed in a table (Profile Name, Username, Password, Actions); hovering a row reveals **Edit** (pencil) and **Delete** (trash) icon buttons. Clicking **Add User** — or a row's **Edit** icon — opens a small Add/Edit User dialog with the three fields and Save/Cancel buttons; Save is disabled until a Username is entered. Delete removes the row immediately with no confirmation step, since nothing is persisted until the connection dialog's own Save/Update button is clicked. Saving the connection persists the profiles onto the connection record (`additionalUsers` on `ConnectionRecord`, keyed by a generated `id`). As a safety net, attempting to save the connection while any profile has an empty username still shows a validation error and blocks the save. Profile passwords are stored **encrypted at rest** using the same AES-256-GCM scheme as the main connection password (encrypted on write in `connections:create`/`connections:update`, decrypted for the renderer in `connections:get-all`, and re-encrypted/decrypted alongside the main password when the master password is set, changed, or removed).

The pure helper `buildConnectAsItems` (in `ExplorerPage/connectAsMenu.ts`) builds the submenu structure and is unit-tested independently of rendering.

#### Tables Context Menu

Right-clicking the **Tables** folder node in the Explorer tree opens a context menu with the following options:

| Option | Action |
|--------|--------|
| Refresh | Reloads the table list for this database |
| Create Table | Opens the Create Table dialog |

Right-clicking an individual **table** node opens a context menu with:

| Option | Action |
|--------|--------|
| Select Top X Rows | Opens a new query tab pre-populated with `SELECT TOP X * FROM ...` for the table and immediately executes it, showing results |
| Edit Table | Opens the Edit Table dialog pre-populated with the table's current schema |

The count **X** is configured in **Settings → Databases Config → Explorer → Select Top Rows Count** (default: 1000). The generated query uses the fully-qualified three-part name: `SELECT TOP {count} * FROM [{database}].[{schema}].[{table}]`. The query is executed against the connection that owns the table; no manual connection selection is required.

#### Create Table Dialog

The **Create Table** dialog is a full-screen modal (90vw × 90vh, capped at 1100 × 820px) with three visual sections:

**Header — Table identity**
- Schema input (defaults to `dbo`)
- Table name input

**Body (top split — two panels)**
- **Left: Columns panel** — a table listing all defined columns. Each row shows a Primary Key checkbox, column name input, data type select, Nullable checkbox, and a Delete button. An *Add Column* button appends a new row. An empty-state message is shown when no columns exist.
- **Right: Column Properties panel** — shows provider-specific controls for the currently selected column:
  - **Length** — visible for variable-length types (`varchar`, `nvarchar`, `varbinary`, `char`, `nchar`, `binary`, `char`). Types that support `MAX` show a Custom/MAX toggle.
  - **Precision / Scale** — visible for `decimal` and `numeric` types.
  - **Default Value** — free-text default expression (e.g. `GETDATE()`, `0`, `'N/A'`).
  - **Identity** — checkbox to mark an integer column (`tinyint`, `smallint`, `int`, `bigint`) as an IDENTITY column, with Seed and Increment inputs.

**Body (bottom) — SQL Preview**
- An editable Monaco SQL editor that auto-generates `CREATE TABLE` (create mode) or `ALTER TABLE` (edit mode) SQL as the user edits fields.
- Manual edits to the SQL are preserved and a **↺ Reset SQL** button appears to revert to the auto-generated SQL.

**Footer**
- Server error messages are shown in the footer area.
- *Cancel* and *Create Table* / *Save Changes* action buttons.

**SQL Generation**
- Create mode generates a `CREATE TABLE [schema].[name] (...)` statement. If any column is marked as Primary Key a `CONSTRAINT [PK_<tableName>] PRIMARY KEY CLUSTERED (...)` clause is appended.
- Edit mode computes a diff between the original and current field lists and emits `ALTER TABLE ... DROP COLUMN`, `ALTER TABLE ... ADD ...`, `ALTER TABLE ... ALTER COLUMN`, and `EXEC sp_rename ...` statements as appropriate. If an identity change is detected that cannot be expressed as a simple `ALTER COLUMN`, a `-- WARNING:` comment is emitted instead.

**Submission**
- On submit, the SQL text (whether auto-generated or manually edited) is sent to the database via `window.api.database.executeQuery`. On success, `onSuccess()` is called which triggers a refresh of the parent *Tables* folder node.

#### Edit Table Dialog

The Edit Table dialog reuses the Create Table dialog component in edit mode. When opened:
1. A loading spinner is shown while `window.api.database.getTableSchema` fetches the current column definitions.
2. Fields are populated from the server response (`INFORMATION_SCHEMA.COLUMNS` + primary key data).
3. The schema and table name inputs are disabled — only column definitions can be changed.
4. The SQL preview auto-generates as an `ALTER TABLE` diff.
5. Submitting runs the generated (or manually edited) SQL.

#### Connection Lifecycle and Tree Behavior

Saved connections appear in the Explorer tree immediately after saving and persist across app restarts. Each connection node has a runtime status that drives the UI:

| Status | Status indicator | Children shown |
|---|---|---|
| `disconnected` | Red dot | None |
| `connecting` | Pulsing amber dot | Spinner + "Connecting" label |
| `connected` | Green dot | Databases folder |
| `error` | Red dot | Error message (click to retry) |

**Connected-as label** — while `connected`, the connection row shows the active username in parentheses next to the connection name (e.g. `My SQL Server (sa)`). If the connection was opened via [Connect As…](#connection-context-menu) with a profile that has a *Profile Name*, that name is shown instead of the raw username. The label is derived from `ConnectionRuntimeState.activeUsername`, which is set on every successful connect (default credentials or a profile) and cleared whenever the row leaves the `connected` state.

**Expand-to-connect** — the first time a connection node is expanded the app calls `database:connect` via IPC. The main process uses the saved credentials to open a connection pool and caches the session by connection id. On success a single *Databases* folder appears; subsequent connection expand/collapse operations do not re-connect.

**Lazy loading** — each folder node (Databases, a database, Tables, Views, etc.) loads its children the first time it is expanded. A spinner is shown during loading. Results are cached for the session so repeated expand/collapse does not re-fetch.

**Error recovery** — when a connection or child-node load fails, the error message is shown inline in the tree. Clicking the error row retries the request immediately.

**Shutdown** — `DatabaseManager.closeAll()` is called on `before-quit`, which calls `disconnect()` on every active provider session and drains their connection pools before the process exits.

#### Enter Password Prompt (unsaved password)

When a connection was saved **without remembering its password** (`rememberPassword: false`, so the stored password is empty), opening it would otherwise send an empty password to the server and fail. Instead, the app shows an **Enter Password** dialog (`EnterPasswordDialog`) before connecting:

- **Username** — pre-filled from the stored connection when present (editable); otherwise entered by the user. The username field can be left blank for providers that don't require one (e.g. Redis).
- **Password** — required; submitting empty shows an inline validation error.
- **Remember password** — when ticked, a successful connect persists the credentials to the connection (`rememberPassword: true`, password stored encrypted via `connections:update`) so future connects skip the prompt.
- **Connect** — connects using the entered credentials; an authentication failure is shown **inside the dialog**, which stays open for another attempt.
- **Cancel** / Escape / backdrop — aborts the connect and leaves the connection disconnected.

The credentials are passed to the credential-aware `database:connect` IPC (`connect(connectionId, { username, password })`) and used for that connect only — they are **not** persisted unless *Remember password* is checked. The prompt applies to all password-based providers; **SQLite** (file-based, no auth) never prompts, and background **auto-connect** on startup is silent and never prompts. The gating logic lives in `useExplorerTree` (`needsPasswordPrompt` predicate + `connectWithCredentials`), and the dialog is rendered via `DialogManager`.

#### Views Context Menu

Right-clicking the **Views** folder node in the Explorer tree opens a context menu with:

| Option | Action |
|--------|--------|
| Refresh Views | Reloads the view list for this database |
| Create View | Opens the Manage Views dialog in create-new mode |

Right-clicking an individual **view** node opens a context menu with:

| Option | Action |
|--------|--------|
| Edit View | Opens the Manage Views dialog pre-populated with the view's current definition |

#### Manage Views Dialog

The **Manage Views** dialog is a 90vw × 90vh modal providing full CRUD for SQL Server views. It has a two-panel layout:

**Left panel (220px)** — scrollable list of all views in the selected database, each showing an eye icon and the view name. A **New View** button at the bottom creates a new entry.

**Right panel** — the view editor, comprising:

1. **Meta row** — view name input and schema dropdown. SCHEMABINDING / ENCRYPTED badges are shown for views with those properties.

2. **QueryEditor component** — a four-pane visual query builder:
   - **Mini ERD canvas** (top-left, 50%): An interactive React Flow canvas where tables can be added from a searchable dropdown. Each table shows as a draggable node with its columns listed; column checkboxes control which columns appear in the SELECT clause. FK relationships between selected tables are shown as dashed edges. Removing a table's node also removes its columns from the query.
   - **Column configuration table** (top-right, 50%): Lists all columns from selected tables with per-column controls: *Column* (readonly), *Alias*, *Table* (readonly), *Output* checkbox, *Sort Type* (Unsorted / Ascending / Descending), *Sort Order* (1…N), *Filter* expression. Changes to this table immediately regenerate the SQL.
   - **Monaco SQL editor** (middle, 30%): Full-featured SQL editor with `spiral-dark` / `spiral-light` themes. Bidirectional sync: UI changes → SQL regenerated; SQL edits → parsed back into canvas + column table when the SQL is a recognizable SELECT. A warning banner appears when the SQL has been manually edited to a form that cannot be parsed back into the visual builder.
   - **Collapsible results panel** (bottom): Run button executes the current SQL via `executeQuery`. Results appear in a scrollable table with column headers, row data, row count, and execution time. NULL values shown as italic "NULL". Collapsed by default; expands on query run.

3. **Footer** — Save button (uses `CREATE OR ALTER VIEW`) and Delete button (uses `DROP VIEW`). Rename is handled automatically by dropping the old view name and recreating under the new name.

**Bidirectional SQL ↔ UI sync**
- When the user adds/removes tables, toggles column checkboxes, or edits the columns table, `generateSQL()` rebuilds the SELECT query.
- When the user edits the Monaco editor, `parseSQL()` attempts to parse the SQL back into the visual state. If successful the canvas and column table update; otherwise a sync-warning banner is shown.
- Complex SQL (CTEs, UNION, subqueries in FROM, EXCEPT, INTERSECT) cannot be parsed into the visual builder and will show the warning banner.

**FK auto-JOIN detection**
- `generateSQL()` inspects the loaded ERD schema relationships. If a FK relationship exists between a newly added table and any already-placed table, an `INNER JOIN ... ON` clause is generated automatically. If no FK is found a `CROSS JOIN` is emitted which the user can correct in the SQL editor.

**IPC channels**
- `database:get-views` → `SqlServerProvider.getViews()` — queries `sys.views` for view name, schema, definition, schemabinding, and encryption flags.
- `database:save-view` → `SqlServerProvider.saveView()` — executes `CREATE OR ALTER VIEW [schema].[name] AS {definition}`; handles rename via DROP + CREATE.
- `database:delete-view` → `SqlServerProvider.deleteView()` — executes `DROP VIEW IF EXISTS [schema].[name]`.

After save or delete, the Views folder in the Explorer tree is invalidated and reloaded.

#### Stored Procedures Context Menu

Right-clicking the **Stored Procedures** folder node in the Explorer tree opens a context menu with:

| Option | Action |
|--------|--------|
| Refresh Stored Procedures | Reloads the stored procedure list for this database |
| Create Stored Procedure | Opens the Manage Stored Procedures dialog in create-new mode |

Right-clicking an individual **stored procedure** node opens a context menu with:

| Option | Action |
|--------|--------|
| Edit Stored Procedure | Opens the Manage Stored Procedures dialog pre-populated with the procedure's current definition |

#### Manage Stored Procedures Dialog

The **Manage Stored Procedures** dialog is a 90vw × 90vh modal providing full CRUD for SQL Server stored procedures. It has a two-panel layout:

**Left panel (220px)** — scrollable list of all stored procedures in the selected database, each showing a code icon and the procedure name. A **New Stored Procedure** button at the bottom creates a new entry.

**Right panel** — the procedure editor, divided into three stacked sections:

1. **Properties section** — Name input, Schema dropdown (loaded from `INFORMATION_SCHEMA.SCHEMATA`), and Description text field. The description is stored as a `-- Description:` comment at the top of the procedure body and is stripped/re-injected automatically on load/save.

2. **Parameters section** — An inline table listing all parameters the procedure accepts. Each row has:
   - **Name** — the parameter name (e.g. `@OrderId`)
   - **Type** — the SQL type (e.g. `INT`, `NVARCHAR(100)`)
   - **Default Value** — optional default (e.g. `NULL`, `0`)
   - A delete button to remove the row
   An **Add Parameter** button appends a new empty row.

3. **SQL Body section** (flex-grow) — a full Monaco editor configured for SQL, using the `spiral-dark` / `spiral-light` theme. The user writes only the procedure body (the content inside `BEGIN...END`). The `CREATE OR ALTER PROCEDURE` header, parameter declarations, `AS BEGIN`, and `END` are generated automatically on save.

**Footer** — Save button and, for existing procedures, a Delete button. Rename is handled automatically: when the procedure name changes, the old procedure is dropped and the new one is created.

**IPC channels**
- `database:get-stored-procedures` → `SqlServerProvider.getStoredProcedures()` — queries `sys.procedures` joined with `sys.parameters` and `sys.types` for procedure definitions and parameter metadata.
- `database:save-stored-procedure` → `SqlServerProvider.saveStoredProcedure()` — executes `CREATE OR ALTER PROCEDURE [schema].[name](...) AS BEGIN...END`; handles rename via DROP + CREATE.
- `database:delete-stored-procedure` → `SqlServerProvider.deleteStoredProcedure()` — executes `DROP PROCEDURE IF EXISTS [schema].[name]`.

After save or delete, the Stored Procedures folder in the Explorer tree is invalidated and reloaded.

#### Table Types Context Menu

Right-clicking the **Table Types** folder node (under *Types* in the Explorer tree) opens a context menu with:

| Option | Action |
|--------|--------|
| Refresh Table Types | Reloads the table type list for this database |
| Create Table Type | Opens the Manage Table Types dialog in create-new mode |

Right-clicking an individual **table type** node opens a context menu with:

| Option | Action |
|--------|--------|
| Edit Table Type | Opens the Manage Table Types dialog pre-populated with the type's current column definitions |

#### Manage Table Types Dialog

The **Manage Table Types** dialog is a 90vw × 90vh modal providing full CRUD for SQL Server user-defined table types (`CREATE TYPE ... AS TABLE`). It has a two-panel layout:

**Left panel (220px)** — scrollable list of all table types in the selected database, each showing a tag icon and the fully qualified name (`schema.typeName`). An **Add Table Type** button at the bottom creates a new entry.

**Right panel** — the type editor, divided into two sections:

1. **Header row** — a 180px schema dropdown (loaded via `SELECT DISTINCT TABLE_SCHEMA FROM INFORMATION_SCHEMA.SCHEMATA`) and a name input field.

2. **Columns editor** — a reusable `TableColumnsEditor` component (see below) with `showPrimaryKey=false`, `showDefaultValue=false`, and `showIdentity=false`, since SQL Server table types do not support primary keys, default values, or identity columns.

**Footer** — an error message area, a **Delete** button (only shown for existing types), and a **Save** / **Update** button (label depends on whether a new type is being created or an existing one is being edited).

**Rename handling** — SQL Server does not support `ALTER TYPE` for table types. When editing, the original type is dropped (`DROP TYPE IF EXISTS [schema].[name]`) and recreated under the new name. The original schema and name are passed to `saveTableType` as `originalSchemaName` / `originalTypeName`.

**IPC channels**
- `database:get-table-types` → `SqlServerProvider.getTableTypes()` — queries `sys.table_types` for schema and type names.
- `database:get-table-type` → `SqlServerProvider.getTableType()` — queries `sys.columns` joined with `sys.table_types` and `sys.types` for column definitions.
- `database:save-table-type` → `SqlServerProvider.saveTableType()` — executes `USE [db]`, optional `DROP TYPE IF EXISTS`, then `CREATE TYPE [schema].[name] AS TABLE (...)`.
- `database:delete-table-type` → `SqlServerProvider.deleteTableType()` — executes `USE [db]` then `IF EXISTS ... DROP TYPE [schema].[name]`.

After save or delete, the Table Types folder in the Explorer tree is invalidated and reloaded.

#### TableColumnsEditor Component

The **TableColumnsEditor** is a reusable React component (`src/renderer/src/pages/Explorer/TableColumnsEditor.tsx`) shared between the **Create Table** dialog and the **Manage Table Types** dialog. It provides an interactive column definition editor.

**Layout** — a two-panel grid (left: column list, right: properties panel):

- **Left: Columns panel** — a table listing all defined columns. Each row shows an optional Primary Key checkbox (if `showPrimaryKey=true`), column name input, data type select, Nullable checkbox, and a Delete button. An *Add Column* button appends a new row. An empty-state message is shown when no columns exist.

- **Right: Properties panel** — shown when a column row is selected. Displays context-sensitive properties for the selected column:
  - **Length** — visible for variable-length types (`varchar`, `nvarchar`, `varbinary`, `char`, `nchar`, `binary`). Types that support `MAX` show a Custom/MAX toggle.
  - **Precision / Scale** — visible for `decimal` and `numeric` types.
  - **Default Value** — visible when `showDefaultValue=true` (hidden in Manage Table Types).
  - **Identity** — an *Is Identity* checkbox, visible for identity-capable types (`int`, `bigint`, `smallint`, `tinyint`) when `showIdentity=true` (hidden in Manage Table Types). When enabled, Seed and Increment inputs appear.
  - **Nullable** — a *Allow Nulls* checkbox always present.

**Props**
- `fields` / `onFieldsChange` — controlled component; field list managed by the parent.
- `provider` — the connection provider (e.g. `'sqlserver'`); determines available data types.
- `showPrimaryKey` (default: `true`) — show/hide PK column and PK property.
- `showDefaultValue` (default: `true`) — show/hide the Default Value property.
- `showIdentity` (default: `true`) — show/hide the Identity property.
- `disabled` (default: `false`) — disables all inputs while a save/delete is in progress.

**Exported helpers**
- `newFieldId()` — generates a unique field identifier.
- `makeDefaultField(provider)` — returns a new `TableField` with provider-appropriate defaults.

### Query Editor

Placeholder page for a future SQL/query editor interface.

#### Execution Plan

The **Execution Plan** feature provides a graphical visualization of how SQL Server processes a query — equivalent to the execution plan view in SQL Server Management Studio.

**Toolbar button** — when a query tab is active, an **Execution Plan** button (Network icon) appears in the toolbar alongside *Execute Query* and *Format*. Clicking it re-runs the current query with `SET STATISTICS XML ON`, captures the execution plan XML, and automatically switches to the **Execution Plan** tab in the Query Results panel.

**Execution Plan tab** — after running with a plan, a third tab "Execution Plan" appears in the Query Results tabs (alongside Results and Messages). The tab is only shown when execution plan data is available.

**Graph visualization** — the Execution Plan tab shows a left-to-right tree graph (using React Flow + Dagre layout):
- Each node represents a relational operator (e.g. *Clustered Index Scan*, *Hash Match*, *Sort*, *Nested Loops*).
- Nodes display: operator name, the table/index accessed (if any), cost percentage of total query cost, and estimated row count.
- A **cost bar** at the top of each node shows relative cost visually; color-coded: red (≥50%), orange (≥25%), yellow (≥10%), light green (≥3%), grey (< 3%).
- **Hovering** over a node opens a detailed stats panel showing: Physical Op, Logical Op, cost breakdown (CPU, I/O, subtree cost), estimated rows, table name, and index name.
- Edges between nodes show estimated row cardinality of the data flow.
- A **MiniMap** provides navigation for large plans.
- Multi-statement queries (e.g. two SELECT statements) show a **Statement selector** above the graph; one plan is shown at a time.

**Auto Include Execution Plan** — in *Settings → Databases Config → Query Execution*, the *Auto Include Execution Plan* toggle causes every query run (via the normal *Execute Query* button or F5) to automatically capture and display the execution plan without needing to click the dedicated *Execution Plan* button.

#### Client Statistics

The **Client Statistics** feature collects and displays runtime metrics about a query execution — equivalent to the client statistics view in SQL Server Management Studio.

**Toolbar button** — when a query tab is active, a **Statistics** button (bar chart icon) appears in the toolbar alongside *Execute Query*, *Format*, and *Execution Plan*. Clicking it re-runs the current query with statistics collection enabled and automatically switches to the **Client Statistics** tab in the Query Results panel.

**Client Statistics tab** — after running with statistics, a **Client Statistics** tab appears in the Query Results tabs. The tab is only shown when statistics data is available.

**Statistics display** — the Client Statistics tab shows three sections:
- **Time Statistics**: Total Execution Time (wall-clock round-trip in milliseconds).
- **Query Profile Statistics**: Rows Returned (total rows across all result sets) and Result Sets (count of result sets returned).
- **Network Statistics**: Bytes Sent to Server (UTF-8 byte length of the SQL text sent).

Each section is displayed as a table with "Statistic" and "Current Execution" columns, styled consistently with the application's dark/light theme.

**Auto Include Client Statistics** — in *Settings → Databases Config → Query Execution*, the *Auto Include Client Statistics* toggle causes every query run (via the normal *Execute Query* button or F5) to automatically collect and display client statistics without needing to click the dedicated *Statistics* button.

#### Export Query Results

Each result set in the Results tab shows two export buttons when there are columns to export.

**Export CSV** — serialises the result set to a CSV file and triggers an immediate browser download. Filenames follow the pattern `query-results.csv` for a single result set, or `query-results-2.csv`, `query-results-3.csv`, etc., for multi-result-set queries.

**Export JSON** — serialises the result set to a JSON array and opens the system save dialog so you can choose a destination and filename. The default filename follows the same numbering convention (`query-results.json`, `query-results-2.json`, …). The save-file dialog is pre-filtered to `.json` files.

**Nested object output for qualified column labels** — if a column name contains a dot (`.`), the export splits it into a nested child object within each row object. For example, a query that returns columns `customer.id`, `customer.name`, and `order.total` produces rows shaped like:

```json
[
  { "customer": { "id": 1, "name": "Alice" }, "order": { "total": 99.90 } }
]
```

Multi-segment paths (e.g. `a.b.c`) are expanded recursively. Unqualified column names are always emitted flat.

**Conflict handling** — if a flat column (e.g. `customer`) and a dotted column (e.g. `customer.id`) share the same first segment, the flat column is stored as-is and the dotted column falls back to its full original name as a flat key.

### Schema View

Placeholder page for a future schema visualization interface.

### Security

Placeholder page for a future security management interface.

### Metrics

Placeholder page for a future metrics and monitoring interface.

---

## Settings

A two-column layout with a sidebar for section navigation and a content area.

### General

- **Language selector**: choose between English and Hebrew. Change takes effect immediately.
- **Manage Environments**: opens the Environments dialog to create, edit, or delete named environments (see [Environments And Query Safety](#environments-and-query-safety)).
- **Default Connection Sort**: two dropdowns that set the sort order applied to the Explorer connection list when the application loads. Changing this setting does **not** immediately reorder the current session — the new default takes effect the next time the app starts.
  - *Sort field*: Name, Creation Date, Last Used, Provider, Environment (default: Name).
  - *Sort direction*: Ascending, Descending (default: Ascending).
- **Application Update**: shows the installed version of Spiral and two action buttons — *Check for Updates* (triggers an immediate update check) and *Release Notes* (opens the [Release Notes dialog](#release-notes-dialog)). See [Auto-Update](#auto-update).

### Appearance

- **Theme Preferences**: choose from Neon Dark, Solar Light, Glass Light, or System Sync themes. Each theme defines its own tooltip colors via the `--color-tooltip-*` tokens — dark themes use a dark tooltip, while the light themes (Solar Light and Glass Light) use a light tooltip with a subtle border and shadow so it reads against light backgrounds. The Monaco code editor matches the active theme via a registered editor theme (`spiral-dark`, `spiral-light`, and `spiral-glass-light`); the Glass Light editor uses a white surface with a soft neutral gutter to match the rest of the UI rather than rendering in dark mode.
- **Glass Effect Color**: a slider controls the ambient sky-tinted glow rendered behind the side navigation. It can follow the time of day automatically, be pinned to a specific hour (morning/noon/evening), be set to a manual color, or be turned off. On the light themes (Solar Light and Glass Light) the glow's calculated colors are rendered with a stronger alpha (background `0.3` and border `0.7`, versus `0.12` and `0.35` on dark themes) so the effect stays visible against the bright background.
- **Interface Elements**:
  - *Syntax Highlighting* — toggle colorful code in the query editor.
  - *Hide Side Navigation Bar* — immediately hide the left-side page navigation icons. The View menu can show the bar again, and the preference persists across restarts.
  - *Dark Terminals* — controls the background color of the Redis and MongoDB shell terminals. When on (the default), the terminals always use a dark palette regardless of the active theme. When off, each terminal adopts a palette matching the selected theme (dark stays dark; Solar Light and Glass Light use light backgrounds with darkened, legible ANSI accent colors). Changes apply live to already-open terminals and follow theme switches, mirroring the Monaco editor. When Dark Terminals is on **and** the active theme is light — detected from the theme's actual background luminance (`--color-bg`), not a fixed theme list — the dark terminal box gets rounded corners and extra inner padding so it reads as a softened box against the bright UI instead of a hard-edged rectangle.
- **Accessibility**: font scaling slider (80%–150%).
- **Reset Defaults** button restores all appearance settings to their defaults instantly.

### Databases Config

Configure default query behavior and connection settings.

**Query Defaults**
- **Query Timeout**: maximum wait time before cancelling a running query (options: No timeout, 15s, 30s, 60s, 120s; default 30s).

**Explorer**
- **Show System Databases**: toggle display of system databases (master, model, msdb, tempdb) in the Explorer tree (default: off).
- **Select Top Rows Count**: number of rows to return when using *Select Top Rows* from a table's right-click context menu (default: 1000, minimum: 1). Accepts any positive integer.

**Query Execution**
- **Auto Include Execution Plan**: when enabled, every query run automatically captures and displays the SQL Server execution plan alongside the normal results (default: off). See [Execution Plan](#execution-plan) below.
- **Auto Include Client Statistics**: when enabled, every query run automatically collects and displays client statistics (timing, row counts, bytes sent) alongside the normal results (default: off). See [Client Statistics](#client-statistics) below.

**JSON Results**
- **Copy JSON as Formatted Text**: when enabled, copying a JSON document from the result viewer (without a text selection) produces pretty-printed JSON with indentation. Disable to copy compact, single-line JSON (default: on).

- **Reset Defaults** button restores all Databases Config settings to their defaults instantly.

### Results View Config

- **Column Headers**:
  - *Uppercase Column Headers*: render result grid column headers in uppercase.
  - *Show Key Icons in Results*: show a key icon next to primary/foreign key columns in the results grid.
- **Table Options**:
  - *Use Interactive Tables*: enable interactive table features in the results grid.
  - *Show Grid Lines*: toggle row/column borders in the results data view.
- **Reset Defaults** button restores all Results View Config settings to their defaults instantly.

### User Profile

The **User Profile** section is found under **Application Settings** in the Settings sidebar. It is accessible by clicking the circular profile icon above the Settings icon in the side navigation bar.

#### Identity

- **Profile Image**: an avatar image that appears in the side navigation bar (or the title bar when the side navigation bar is hidden) and on the User Profile settings page.
  - Click **Change Photo** to open the system file picker and select a JPEG, PNG, GIF, or WebP image. The selected image is copied to the app's user data directory.
  - Click **Remove Photo** to clear the avatar. The icon reverts to the default `UserRound` icon.
- **Display Name**: a text field for entering a display name. The name is shown as the tooltip on the profile button in the side navigation bar. Changes are saved immediately on input.

#### Password Protection

A password can be set to restrict access to the application.

- **No Password Set**: shows a description card with a **Set Password** button.
- **Password Set**: shows a description card with **Change Password** and **Remove Password** buttons.
- **Set Password form**: two fields — *New Password* and *Confirm Password*. Passwords must match; an error is shown if they do not. Passwords are hashed using Node.js `scrypt` and stored in the profile store as `"v1:<hex-salt>:<hex-hash>"` — the plaintext is never persisted.
- **Change Password form**: three fields — *Current Password*, *New Password*, *Confirm New Password*. The current password is verified before the new hash is saved.
- **Remove Password form**: one field — *Current Password*. Verified before the password is removed. Removing the password also disables all auto-lock settings.

> **Forgotten password**: There is no password recovery mechanism. To regain access, the user must manually clear the application's user data directory.

#### Auto-Lock

Visible only when a password is set. Controls when the application automatically locks and shows the lock screen.

- **Lock on Startup**: when enabled, the application always requires a password when it launches.
- **Lock on Inactivity**: when enabled, the application locks after a configurable period of no user interaction (mouse movement, keyboard input, or touch).
  - **Inactivity Timeout**: numeric input (in minutes, minimum 1) for how long to wait before locking. Visible only when *Lock on Inactivity* is enabled.

#### Lock Screen

When the application is locked (by startup policy, inactivity timeout, or a system suspend/lock-screen event), a full-screen modal overlay is displayed over all app content. The overlay shows:

- The application name.
- A password input field.
- An **Unlock** button (disabled until the password field is non-empty).
- An error message if the entered password is incorrect.

The lock screen is managed by the `AppLockGate` component which wraps the entire app. It listens for `auth:lock` IPC events from the main process (triggered on OS suspend or screen lock) when inactivity locking is enabled.

### Other Sections (Coming Soon)

Security, Notifications, Data Management, Sync & Backup, Console Config, API Access.

---

## Auto-Update

Spiral uses **electron-updater** with GitHub Releases as the update distribution channel. Updates are checked automatically in the background and require explicit user confirmation before downloading or installing.

### How It Works

1. **Startup check** — Spiral silently checks for a newer GitHub release approximately 5 seconds after the app window opens. No download is triggered automatically. The check is **skipped** when a completed-but-not-installed download is already pending (i.e. the **Install Update** pill will be restored — see step 8), so a redundant check cannot overwrite the install-ready state.
2. **Manual check** — the user can trigger a check at any time from **Help → Check for Updates...** (all platforms) or from **Settings → General → Application Update → Check for Updates**.
3. **Download on demand** — when an update is found, the *Update available* pill appears in the top bar (see [Update Pill](#update-pill)). Clicking it opens the **Update Available** dialog.
4. **Start download** — clicking **Update Now** closes the dialog and begins the download to electron-updater's managed temp/cache location. The pill changes to *"Downloading Update… X%"*. Installation is **not** triggered automatically.
5. **Download progress** — clicking the downloading pill opens the [Download Progress dialog](#download-progress-dialog) showing percentage and download speed, with a **Cancel Download** button (a confirmation is requested before cancelling).
6. **Download complete** — when the download finishes, the progress dialog (if open) shows *"Download Complete"* (and fires confetti when the *I like confetti* setting is enabled), and the pill changes to **Install Update**. The completed version is persisted so the pill survives an app restart.
7. **Install on demand** — clicking **Install Update** (pill) or **Install Now** (dialog) stores the current version number and calls `quitAndInstall`, restarting directly into the new version. The cached installer is consumed/cleaned by electron-updater.
8. **Resume across sessions** — if the app is closed with a completed-but-not-installed download, the next launch restores the **Install Update** pill (from the persisted `downloadedVersion`).
9. **Post-update detection** — on the first launch after an update, Spiral detects that the running version differs from the previously stored version and shows the *"Updated — see what's new"* pill for 60 seconds.

### Publishing a Release

New builds are published to GitHub Releases using `electron-builder`:

```bash
# Set your GitHub personal access token with repo write scope
export GH_TOKEN=<token>

# Build and publish for the current platform
npm run build -- --publish always
```

The `electron-builder.yml` configuration specifies the GitHub `owner` and `repo`. Each release produces platform-specific artifacts:

| Platform | Artifacts |
|----------|-----------|
| macOS    | `.dmg` (user install), `.zip` (auto-update delta) |
| Windows  | NSIS installer + `latest.yml` manifest |
| Linux    | `.AppImage` + `latest-linux.yml` manifest |

### Update Pill

A status pill is shown in the **TopBar** to communicate the current update state:

| State | Pill text | Appearance | Location |
|-------|-----------|------------|----------|
| `checking` | "Checking for updates" | Pulsing spinner | After nav (Win/Linux) or inside brand div (macOS) |
| `updateAvailable` | "Update available" | Blue/accent, clickable | Same |
| `downloading` | "Downloading Update… X%" | Blue/accent, spinner, clickable | Same |
| `downloaded` | "Install Update" | Blue/accent, clickable | Same |
| `upToDate` | "Up to date" | Green, fades after 10 s | Same |
| `updated` | "Updated — see what's new" | Green, clickable, fades after 60 s | Same |
| `idle` | *(hidden)* | — | — |

- On **Windows and Linux** the pill is rendered after the `<Menu>` component in the top bar.
- On **macOS** the pill is rendered inside the brand `div` to the right of the logo/wordmark (avoiding the native system drag region).
- Clicking the `updateAvailable` pill opens the [Update Available dialog](#update-available-dialog).
- Clicking the `downloading` pill opens the [Download Progress dialog](#download-progress-dialog).
- Clicking the `downloaded` (*Install Update*) pill installs the downloaded update immediately via `quitAndInstall`.
- Clicking the `updated` pill opens the [Release Notes dialog](#release-notes-dialog) to show what changed in the new version.

### Update Available Dialog

Opened when the user clicks an *Update available* pill:

- Shows the **Current Version** and **New Version** (available version).
- Displays **Release Notes** fetched from the GitHub API (see [Release Notes](#release-notes)).
- A **Later** button dismisses the dialog without taking action.
- An **Update Now** button starts the download (via `updater:start-download`) and immediately closes the dialog; progress is then surfaced through the pill and the [Download Progress dialog](#download-progress-dialog).
- The dialog is draggable via its title bar using the shared `useDraggableDialog` hook.

### Download Progress Dialog

Opened by clicking the *Downloading Update…* pill:

- While downloading, shows a progress bar, the percentage, and the current **download speed** (formatted KB/s or MB/s), plus **Continue in Background** and **Cancel Download** buttons.
- The dialog can be dismissed at any time (close button, Escape, or **Continue in Background**) **without** cancelling the download — the download keeps running and its status remains visible in the toolbar *Downloading Update… X%* pill, which reopens this dialog when clicked.
- **Cancel Download** opens a confirmation dialog; on confirm it calls `updater:cancel-download`, which discards the partial download (the pill returns to *Update available*).
- When the download completes, the dialog switches to a **Download Complete** state: the Cancel button is replaced by **Install Now** (and **Later**), and confetti fires when the *I like confetti* setting is enabled (via the shared `useConfetti` hook).

### Release Notes Dialog

A standalone dialog that shows the full release history fetched from GitHub:

- Opened from: the *Updated* pill in the top bar, or the *Release Notes* button in **Settings → General → Application Update**.
- Accepts an optional `fromVersion` prop. When provided, only releases newer than that version are shown (used after an update to highlight only what changed since the previous install).
- Shows each release as a card with version number, publish date, and release body text.
- Loading and error states are handled with descriptive messages.
- The dialog is draggable via its title bar.

### Release Notes

Release notes are sourced from the GitHub Releases API (`https://api.github.com/repos/{owner}/{repo}/releases`). The `owner` and `repo` values are read at runtime from the electron-builder update config file:

- In development: `dev-app-update.yml`
- In production: the packaged `app-update.yml`

The `getReleaseNotes(fromVersion?)` IPC handler in the main process:
1. Reads the update config file to find the GitHub owner and repo.
2. Fetches all releases from the GitHub API.
3. If `fromVersion` is supplied, filters the list to only releases with a tag version strictly greater than `fromVersion` (semver comparison).
4. Returns an array of `{ version, publishedAt, body }` objects sorted newest-first.

### Settings → General: Application Update Card

The update card in **Settings → General** shows:

- The current installed version (e.g. *SPIRAL v1.2.0*).
- A **Check for Updates** button (disabled and shows *"Checking…"* while a check is in progress) that calls `window.api.updater.checkForUpdates()`.
- A **Release Notes** button that opens the Release Notes dialog.

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `updater:check-for-updates` | Renderer → Main | Trigger an update check |
| `updater:start-download` | Renderer → Main | Begin downloading the available update (no install) |
| `updater:cancel-download` | Renderer → Main | Cancel the in-flight download |
| `updater:install-update` | Renderer → Main | Install a downloaded update via `quitAndInstall` |
| `updater:get-version` | Renderer → Main | Get the running app version |
| `updater:get-previous-version` | Renderer → Main | Get version before last update |
| `updater:clear-previous-version` | Renderer → Main | Clear the stored previous version |
| `updater:get-downloaded-version` | Renderer → Main | Get the version of a pending (downloaded, not installed) update |
| `updater:clear-downloaded-version` | Renderer → Main | Clear the stored downloaded version |
| `updater:get-release-notes` | Renderer → Main | Fetch release notes from GitHub API |
| `updater:checking` | Main → Renderer | Check started |
| `updater:update-available` | Main → Renderer | Update found (with `UpdateInfo`) |
| `updater:not-available` | Main → Renderer | No update found |
| `updater:download-progress` | Main → Renderer | Download progress (`{ percent, bytesPerSecond }`) |
| `updater:download-cancelled` | Main → Renderer | Download was cancelled |
| `updater:downloaded` | Main → Renderer | Download complete, ready to install |
| `updater:error` | Main → Renderer | Updater error |

### Development Notes

- `autoUpdater.autoDownload` and `autoUpdater.autoInstallOnAppQuit` are both `false`. Downloading and installing always require explicit user confirmation.
- The `before-quit` handler in `index.ts` checks `isUpdating()` before performing any teardown. When `quitAndInstall` is in progress, the `before-quit` handler returns early so the updater can proceed without interference.
- The stored previous version is written to a separate `electron-store` file (`updater-state`) before `quitAndInstall` is called, so it survives the quit/restart cycle and can be read on the next launch to show the *"Updated"* pill.

---

## Shared Components

### Button Component

**File:** `src/renderer/src/components/Button/Button.tsx`

A unified, platform-aware button component used for all standard action buttons across the app (dialogs, settings, connection dialog, profiler). Toolbar buttons and specialized UI controls are excluded.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger' \| 'danger-solid'` | `'primary'` | Visual style of the button. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size of the button. `md` matches dialog footer buttons; `lg` matches settings/connection dialog buttons; `sm` is compact. |
| `isLoading` | `boolean` | `false` | Shows a spinner and disables the button. |
| `disabled` | `boolean` | `false` | Disables the button without showing a spinner. |
| + all HTML button attributes | — | — | Forwarded to the underlying `<button>` element. |

The component also forwards refs to the underlying `<button>` DOM element.

#### Platform-Aware Styling (macOS)

On macOS (`data-platform="darwin"` on `<html>`), buttons use the system font (`-apple-system` / SF Pro), a slightly lighter font weight (500), a subtly more rounded border-radius (0.375rem vs 0.3rem), and a softer shadow on primary buttons. On Windows and Linux, the current design is unchanged.

---

### JsonViewer Component

**File:** `src/renderer/src/components/JsonViewer/JsonViewer.tsx`

A reusable interactive JSON viewer for displaying structured JSON data with collapsible nodes, syntax highlighting, and a selection-aware context menu. Currently used in the Explorer page to render MongoDB query result documents.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `json` | `string` | — | The JSON string to display. |
| `syntaxHighlighting` | `boolean` | `true` | Colorizes keys, strings, numbers, booleans, and null values. |
| `collapsible` | `boolean` | `true` | Enables expand/collapse toggles on object and array nodes. |
| `expandAllByDefault` | `boolean` | `false` | When `collapsible` is true, starts with all nodes expanded. |

#### Features

- **Collapsible tree** — Objects and arrays can be collapsed or expanded using toggle buttons (chevron icons). Collapsed containers show a type hint: arrays display `Array (N)` with element count; objects display `Object`.
- **Syntax highlighting** — Keys, strings, numbers, booleans, and null are each colored distinctly. Colors adapt to light and dark themes.
- **Text selection** — All rendered text is freely selectable, including across multiple properties and nested objects.
- **Context menu** (right-click) — Provides three actions:
  - **Copy** — copies the current text selection if one exists; otherwise copies the full JSON string.
  - **Expand All Fields** — expands all collapsible nodes (only shown when `collapsible` is true and JSON is valid).
  - **Collapse All Fields** — collapses all collapsible nodes (only shown when `collapsible` is true and JSON is valid).
- **Invalid JSON fallback** — If the `json` prop is not parseable, the component displays an error bar with the validation message (and a best-effort line/column pointer) followed by the raw text in a pre-formatted block. The raw text remains selectable and copyable.
- **Reactive** — When the `json` prop changes, the expansion state resets to the initial configuration.

---

## AI Assistant

Spiral includes a local AI assistant panel for SQL databases. The AI runs entirely on the user's machine — no data is sent to external servers.

### Activation

An **AI** button appears in the Explorer toolbar for SQL connections (PostgreSQL, SQL Server, MySQL, SQLite). Clicking it opens a resizable panel on the right side of the editor. The panel persists its width across sessions.

### Model

The AI uses **SQLCoder 7B (Q4_K_M)** — a 4.1 GB GGUF model specialized in SQL generation, quantized for CPU inference via `node-llama-cpp`.

The model is **not bundled** with the application. When the AI panel is first opened, users are prompted to download it. A progress bar shows download status. Downloads can be cancelled; partial files are cleaned up automatically. After download, the file size is verified (±2%) before the model is accepted.

### Chat Interface

Once the model is downloaded, the panel shows a chat view:

- **Schema context** — The DDL for the connected database is extracted automatically and included in every prompt. Up to 25 tables are included; larger schemas are truncated with a note.
- **SQL generation** — Users type questions in natural language. Responses often contain SQL code blocks rendered with syntax formatting.
- **Insert into editor** — SQL code blocks have an "Insert into editor" button that appends the SQL to the active query tab.
- **Streaming** — Responses stream token-by-token. A stop button terminates generation at any point.
- **History** — The last 6 conversation turns are included as context in each request.

### Limitations

- SQL providers only (not Redis or MongoDB).
- CPU inference; no GPU acceleration in v1.
- Context window limited to 4096 tokens (~25 tables).
- Single model in v1; architecture supports multiple models in future releases.

### Architecture

| Layer | Responsibility |
|---|---|
| `src/main/ai/ModelManager.ts` | Download, verify, cancel, delete model files |
| `src/main/ai/AiService.ts` | Schema extraction, prompt building, streaming inference |
| `src/renderer/.../AiChat/` | Chat UI, model setup UI, streaming message display |
| IPC channels `ai:*` | Bridge between main process and renderer |


## Smart Execution Documentation (SED)

SED lets users annotate long-running SQL scripts with structured markdown comments that become a live task checklist displayed in a side panel during execution.

### Activation

A script is treated as a SED script when the first line (after trimming) is exactly:

```sql
-- SED: on
```

The match is case-insensitive (`-- sed: ON`, `-- Sed: On`, etc. all activate SED mode).

### Task Syntax

Tasks are defined using markdown checkbox syntax inside SQL line comments:

```sql
-- SED: on

-- - [ ] Create the staging table
CREATE TABLE #staging (id INT, value NVARCHAR(255))

-- - [ ] Populate staging data
INSERT INTO #staging SELECT id, value FROM source_table

-- - [ ] Run the migration
UPDATE target SET target.value = s.value
FROM target
INNER JOIN #staging s ON s.id = target.id

-- - [ ] Clean up
DROP TABLE #staging
```

Any SQL lines that appear before the first `-- - [ ] ...` line are treated as preamble and are not executed.

Non-task comments between tasks (e.g. section headers like `-- ## Phase 1`) are included in the SQL body of the preceding task and do not affect panel display.

### Execution Panel

When a SED script is run, a **Script Execution** side panel opens on the right showing each task as a row with a status indicator:

| Status | Visual |
|--------|--------|
| Pending | Empty circle outline |
| Running | Spinning arc (animated) |
| Completed | Filled green circle with ✓ |
| Error | Red circle with ✕ + error message |

When all tasks complete successfully, a large **"Completed successfully!"** message is shown at the bottom of the panel. If the **"I like confetti"** setting is enabled in Settings, confetti fires at this moment.

### Resume on Error

If a task fails, execution stops and the error message is displayed in the panel. The panel stays open. When the user edits the script and runs it again:

- If the task structure (labels and count) matches the previous run, execution resumes from the failed task. Previously completed tasks remain shown as completed.
- If the script structure changed, execution restarts from the beginning.

### Architecture

| Component | Location |
|-----------|----------|
| SED parser | `src/renderer/src/pages/Explorer/SedPanel/parseSedScript.ts` |
| Panel UI | `src/renderer/src/pages/Explorer/SedPanel/SedPanel.tsx` |
| Execution logic | `src/renderer/src/pages/Explorer/hooks/useQueryRunner.ts` (`performSedExecution`) |
| Layout state | `src/renderer/src/pages/Explorer/hooks/useLayoutManager.ts` |

## Usage Analytics & Privacy

Spiral collects anonymous usage analytics through **Google Analytics 4 (GA4)** to understand how the application is used and to prioritize improvements. Analytics is **enabled by default** and can be turned off at any time.

### What Is Collected

Events are sent via the GA4 **Measurement Protocol** from the main process. Collected data is limited to:

- **Page views** — which screens are visited (Explorer, Query, Compare, Profiler, Docs, Settings, and the active Settings section).
- **App open** — a single event when the application launches.
- **Dialog usage** — `dialog_open` for key dialogs (e.g. New Connection, About, Application Update, Release Notes, Start Profiling), identified by stable internal slugs.
- **Button clicks** — `button_click` for a curated set of important actions, identified by stable internal slugs (opt-in per button).
- **Data providers used** — `connection_created` / `connection_opened` with only the provider *type* (e.g. `postgres`, `mysql`, `mongodb`) plus boolean `has_ssh` / `has_tls` flags.
- **Settings changes** — `setting_changed` with the setting key and, for safe primitive values, the new value.
- **Context attached to every event** — anonymous installation id (random UUID), session id, app version, and OS platform.

### What Is **Not** Collected

No personally identifiable or sensitive information is ever sent:

- No connection details — hosts, ports, database names, or usernames.
- No passwords or secrets — values of `hfToken` and similar fields are never forwarded.
- No query text, result data, or file contents.
- No free-form text — string parameters over a small length cap are dropped, and structured/object setting values are sent without their value.

### Opting Out

Open **Settings → General → Usage Analytics** and toggle it off. The opt-out is stored as the `analyticsEnabled` setting and is checked in the main process before every event, so disabling it stops all analytics traffic immediately. Re-enabling resumes collection.

### Architecture

| Component | Location |
|-----------|----------|
| GA4 config / credentials | `src/main/analytics/constants.ts` |
| Analytics service (MP sender, gating, sanitization) | `src/main/analytics/analytics.ts` |
| IPC handlers (`analytics:track`, `analytics:page-view`) | `src/main/index.ts` |
| Preload bridge (`window.api.analytics`) | `src/preload/index.ts` |
| Renderer helper (`trackEvent`, `trackPageView`) | `src/renderer/src/analytics/track.ts` |
| Opt-out flag (`analyticsEnabled`) + anonymous client id store | `src/main/store.ts` |
| Settings opt-out UI | `src/renderer/src/pages/Settings/GeneralSettings.tsx` |

> The GA4 Measurement ID and API secret live in `src/main/analytics/constants.ts`. While they hold placeholder values the service no-ops and sends nothing, which keeps development builds silent.
