# Spiral v1.0.0 🌀

The first public release of **Spiral** — a cross-platform desktop database client and administration tool for SQL and NoSQL databases. Connect, explore, query, compare, and administer your databases from a single fast, modern app.

Spiral runs on **Windows, macOS, and Linux**.

---

## ✨ Highlights

- **Six database engines, one client** — SQL Server, MySQL, PostgreSQL, SQLite, MongoDB, and Redis.
- **Local AI query generator** — generate SQL from natural language, running entirely on your machine. No data leaves your computer.
- **Visual schema comparison & sync** — diff two databases and generate (or run) a sync script, with optional revert scripts.
- **Interactive ERD, execution plans, and client statistics** — understand your schema and queries visually.
- **Full user & security management** across every supported engine.
- **Backup & restore** for all six engines.

---

## 🗄️ Database Support

- **SQL Server** — SQL/Windows/Entra auth, server & database user management, server roles, native backup/restore with an SSMS-style dialog and server-side file browser.
- **MySQL** — `user@host` user management (server & database level), backup/restore via `mysqldump`/`mysql` with a pure-JS fallback.
- **PostgreSQL** — backup/restore via `pg_dump`/`pg_restore`/`psql` (Plain, Custom, Tar, Directory formats).
- **SQLite** — single-file backup (VACUUM + gzip) and safe restore with integrity checks and pre-restore snapshots.
- **MongoDB** — URI or structured connections, full auth (SCRAM, X.509, Kerberos, LDAP, AWS IAM), TLS, SSH tunneling, collection & document editing, aggregations, user management, `mongodump`/`mongorestore` with JS EJSON fallback.
- **Redis** — standalone/cluster/sentinel, ACL user management, live server dashboard, key/value Database Explorer with namespace grouping, lossless `DUMP`-based backup/restore.

All connections support **SSH tunneling** and **TLS/SSL** where applicable.

---

## 🔍 Explorer

- Lazy-loaded, cached object tree down to columns, keys, constraints, triggers, indexes, statistics.
- Connection list with **search, filter, and sort**.
- **Environments** with color coding and query-safety guards for production.
- Create/edit tables, views, stored procedures, functions, and types.
- **Mini-ERD visual query builder** that auto-generates JOINs from foreign keys.

---

## ⚡ Query Editor

- Monaco editor with SQL formatting.
- **Execution Plan** — graphical SSMS-style operator tree with cost bars, hover stats, minimap.
- **Client Statistics** — time, query profile, and network metrics.
- Optional auto-include of plans/statistics on every run.
- **Export results** to CSV and JSON (nested-object output for dotted column names).

---

## 🤖 Local AI Assistant

- Powered by **SQLCoder 7B** via `node-llama-cpp` — **nothing sent to external servers**.
- Model downloaded on first use (verified, cancellable); not bundled.
- Reads your schema automatically, streams responses, inserts SQL straight into the editor.
- Available for all SQL providers.

---

## 🧩 Smart Execution Documentation (SED)

Annotate long-running scripts with markdown checklist comments and run them as a live task list — per-task status, **resume-on-error**, optional confetti on success.

---

## 🔀 Compare

- Create, save, and run schema comparisons between two connections/databases.
- Covers tables, columns, keys, constraints, indexes, triggers, views, procedures, functions, users, roles, schemas, and row-level data.
- **Create Script**, **Sync All**, and **per-finding Sync** — with **Swap** direction toggle and optional **revert scripts**.
- Export full reports to JSON with an opt-in secrets prompt.

---

## 🎨 Experience

- Section-card layout, resizable panels, platform-aware styling (native-feeling macOS toolbars).
- **i18n** — English and Hebrew with full RTL.
- **Tips & Tricks** ambient notifications.
- **User profiles** with avatar, display name, password protection, auto-lock.
- **Automatic updates** with in-app release notes.

---

## 🔒 Privacy

- AI runs **100% locally**.
- Anonymous analytics guide development — **no connection details, credentials, query text, or result data are ever collected** — and can be disabled in **Settings → General → Usage Analytics**.

---

## 📦 Installation

- **Windows** — `.exe` installer
- **macOS** — `.dmg` (Intel & Apple Silicon)
- **Linux** — `.AppImage`, `.deb`, `.rpm`

---

Thanks for trying Spiral. Feedback and bug reports welcome! 🙌
