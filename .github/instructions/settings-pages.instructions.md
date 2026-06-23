---
applyTo: "src/renderer/src/pages/Settings/**/*"
---

# Settings Page Design Guidelines

## Overview

The Settings page uses a two-column layout: a fixed-width sidebar for category navigation and a scrollable content area for the active settings section. It does **not** use the shared `pages.css` layout; it manages its own full-height flex container via `SettingsPage.css`.

---

## Layout

```
┌─────────────────────────────────────────────────────┐
│  Settings sidebar (280px)  │  Content area (flex-1)  │
│  bg: --color-topbar-bg     │  bg: --color-bg         │
│  border-right: --color-border                        │
└─────────────────────────────────────────────────────┘
```

- **Root element** `.settings`: `display: flex; height: 100%; overflow: hidden;`
- **Sidebar** `.settings__sidebar`: fixed at `280px`, vertically scrollable.
- **Content** `.settings__content`: `flex: 1`, vertically scrollable, renders the active section.

---

## Sidebar Navigation

### Groups

Navigation items are divided into named groups. Each group has:
- A `.settings__nav-label`: `10px`, `700` weight, uppercase, `0.18em` letter-spacing, `--color-muted`.
- A `<nav>` block of `.settings__nav-item` buttons.

Current groups:
| Group heading | Sections |
|---|---|
| Application Settings | General, Security, Notifications, Data Management, Sync & Backup |
| Developer | Console Config, API Access |

### Nav item anatomy

```tsx
<button className="settings__nav-item settings__nav-item--active">
  <Icon className="settings__nav-icon" strokeWidth={1.5} />
  <span>Label</span>
</button>
```

- Icon size: `18px × 18px` via `.settings__nav-icon`.
- Default state: `--color-muted` text, transparent background.
- Hover: `--color-on-surface` text, `--color-surface-hover` background.
- Active (`.settings__nav-item--active`): `--color-primary` text, `rgba(161, 250, 255, 0.08)` background.
- Use `aria-current="page"` on the active button.

### Icon library

Use **Lucide React** icons, matching those already used across the project. Set `strokeWidth={1.5}` on all icons.

| Section | Icon |
|---|---|
| General | `Settings2` |
| Security | `ShieldCheck` |
| Notifications | `Bell` |
| Data Management | `Database` |
| Sync & Backup | `RefreshCcw` |
| Console Config | `Terminal` |
| API Access | `Key` |

---

## Content Sections

Each settings section lives in its own component file inside `src/renderer/src/pages/Settings/` (e.g., `GeneralSettings.tsx`).

### Section wrapper

All section content uses `.settings-general` (or equivalently named class per section) left-aligned with `max-width: 860px`, `padding: 40px 48px`, and `margin: 0` (no centering — the content sits flush to the left with consistent horizontal padding).

### Section header

The header uses a flex row: title + subtitle on the left, **Reset Defaults** button on the right. Settings are applied immediately on change — there is no Save button.

```tsx
<div className="settings-general__header">
  <div>
    <h1 className="settings-general__title">General Settings</h1>
    <p className="settings-general__subtitle">Description of the section.</p>
  </div>
  <button className="settings-btn settings-btn--ghost" onClick={handleReset}>Reset Defaults</button>
</div>
```

- Header: `display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;`.
- Title: Space Grotesk, `28px`, `700`, `--color-on-surface`, `letter-spacing: -0.02em`.
- Subtitle: Inter, `13px`, `--color-muted`.
- Separated from the content by a bottom border (`--color-border`) and `margin-bottom: 40px`.

### Sub-section headings

```tsx
<h2 className="settings-general__section-title">Workspace Preferences</h2>
```

- `11px`, `700`, uppercase, `0.12em` letter-spacing, `--color-primary`.

---

## Settings Cards

### Standalone card (`.settings-card`)

Use for settings items that stand alone with their own border and rounded corners.

```tsx
<div className="settings-card">
  <div className="settings-card__info">
    <p className="settings-card__title">Setting Name</p>
    <p className="settings-card__desc">Short description.</p>
  </div>
  {/* control: select, input, swatches, etc. */}
</div>
```

- Background: `--color-topbar-bg`.
- Border: `1px solid --color-border`, `border-radius: 8px`.
- Hover: border transitions to `rgba(161, 250, 255, 0.15)`.
- Title: `13px`, `700`, `--color-on-surface`.
- Description: `12px`, `--color-muted`.

### Grouped card rows (`.settings-card-group`)

Use when multiple related toggles or options share a single bordered container with dividers between rows.

```tsx
<div className="settings-card-group">
  <div className="settings-card-group__row">
    <div className="settings-card__info">...</div>
    <Toggle ... />
  </div>
  <div className="settings-card-group__row">...</div>
</div>
```

- The container has `border-radius: 8px` and `overflow: hidden`.
- Rows are separated by `border-top: 1px solid --color-border`.

---

## Form Controls

### Select dropdown (`.settings-select`)

```tsx
<select className="settings-select" value={value} onChange={...}>
  <option value="standard">Standard Editor</option>
</select>
```

- Background: `#22262f`, border `1px solid rgba(255,255,255,0.1)`, `border-radius: 4px`.
- Focus: border changes to `--color-primary`.

### Text input (`.settings-input`)

```tsx
<input className="settings-input" type="text" value={value} onChange={...} />
```

- Width: `80px`, centered text. Same background and border as `.settings-select`.
- Focus: border changes to `--color-primary`.

### Color swatches (`.settings-colors` / `.settings-color-swatch`)

```tsx
<div className="settings-colors">
  {COLORS.map(({ id, hex }) => (
    <button
      key={id}
      className={`settings-color-swatch${active === id ? ' settings-color-swatch--active' : ''}`}
      style={{ backgroundColor: hex }}
      onClick={() => setActive(id)}
    />
  ))}
</div>
```

- Swatches are `24px` circles.
- Active swatch gets `border: 2px solid rgba(255,255,255,0.5)`.
- Hover: `transform: scale(1.12)`.

### Toggle switch (`.settings-toggle`)

Implemented as an accessible `<label>` wrapping a visually-hidden checkbox and a custom track + thumb.

```tsx
<label className="settings-toggle" htmlFor={id}>
  <input id={id} type="checkbox" className="settings-toggle__input" checked={...} onChange={...} />
  <span className="settings-toggle__track">
    <span className="settings-toggle__thumb" />
  </span>
</label>
```

- Track: `44px × 24px`, `border-radius: 12px`. Default `#374151`, checked `--color-primary`.
- Thumb: `20px` white circle, translateX `20px` when checked.
- Animation: `200ms ease` on both track color and thumb position.

---

## Reset Button

Settings are applied and saved immediately when changed. There is no "Save Changes" button.

Each section has a **Reset Defaults** button in the top-right of the section header (`.settings-btn--ghost`). It resets all local state back to the section's `DEFAULT_STATE`.

| Button | Class | Style |
|---|---|---|
| Reset Defaults | `.settings-btn--ghost` | No background, `--color-muted` text, hover to `--color-on-surface` |

---

## Adding a New Settings Section

1. Create `src/renderer/src/pages/Settings/<SectionName>Settings.tsx`.
2. Add the section ID to the `SettingsSectionId` union type in `SettingsPage.tsx`.
3. Add a nav item entry to `APP_SETTINGS_ITEMS` or `DEVELOPER_ITEMS` in `SettingsPage.tsx`.
4. Add a render branch in the `settings__content` area of `SettingsPage.tsx`.
5. Write tests covering the new section's state interactions.

---

## CSS Variables Used

| Variable | Value | Usage |
|---|---|---|
| `--color-bg` | `#0b0e14` | Content area background |
| `--color-topbar-bg` | `#10131a` | Sidebar and card backgrounds |
| `--color-border` | `rgba(255,255,255,0.05)` | Dividers and card borders |
| `--color-primary` | `#a1faff` | Active nav item, section headings, toggle on-state |
| `--color-on-surface` | `#ecedf6` | Card titles, control text |
| `--color-muted` | `#73757d` | Nav labels, card descriptions, ghost button |
| `--color-surface-hover` | `rgba(255,255,255,0.05)` | Sidebar item hover background |

---

## File Structure

```
src/renderer/src/pages/Settings/
├── SettingsPage.tsx        # Page shell: sidebar + content routing
├── SettingsPage.css        # All settings styles (sidebar, cards, controls)
├── GeneralSettings.tsx     # General section content component
└── <Section>Settings.tsx   # Future section components (one per section)
```

All styles for the settings page live exclusively in `SettingsPage.css`. Do not add settings-specific styles to `pages.css` or `base.css`.
