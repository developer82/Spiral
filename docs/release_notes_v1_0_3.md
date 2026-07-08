# Spiral v1.0.3 🌀

This release adds anonymous-login support for credential-free connections, a redesigned Take Screenshot experience, and a new Resize Window tool.

---

## 🔌 Connections

- **Anonymous Login** — the Add/Edit Connection dialog now has an **Anonymous Login** checkbox under the **Username** field (same style as **Remember Password**). When ticked, the **Username** and **Password** fields are disabled and their values are **not persisted** even if they were entered first. Connecting to an anonymous-login connection from the Explorer sidebar connects straight away with no credentials and never shows the **Enter Password** prompt. Available for SQL Server, PostgreSQL, MySQL, MongoDB, and Redis connections.

---

## 📸 Screenshots

- **Take Screenshot dialog** — **Help → Take Screenshot** now opens a dialog with a live preview of the current window and a size picker instead of silently resizing and saving. Choose **Current** size, a **common size** (1920×1080, 1280×720, 1280×768, 1024×768, 800×600), a **screen aspect ratio** (16:9, 4:3, 3:2, 1:1, 16:10), or a **Custom** width × height, then **Capture** to save a PNG. When a chosen size requires resizing the window, it is captured at that size and then **restored to its original size and position** (re-maximizing if it was maximized) — no more window left resized after a screenshot.

---

## 🪟 Window

- **Resize Window** — the new **Help → Resize Window** action opens a dialog that reuses the same size picker as Take Screenshot to resize the app window itself. Pick **Current**, a **common size**, a **screen aspect ratio**, or a **Custom** width × height, then **Resize** — the window is set to that size and **re-centered** on your display. Handy for producing consistent window sizes for demos or documentation.

---

Thanks for using Spiral! 🙌
