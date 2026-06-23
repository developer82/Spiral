# Building, Publishing, and Auto-Updates

This guide explains how to build the Spiral application, publish new versions to GitHub, and configure the auto-update system.

## 1. Prerequisites

Before you can publish a new version, ensure you have:

1.  **GitHub Repository**: A repository created on GitHub for the project.
2.  **Personal Access Token (PAT)**: A GitHub token with `repo` scope.
    - Go to **Settings > Developer settings > Personal access tokens > Tokens (classic)**.
    - Generate a new token with the `repo` permission.
    - Save this token securely as you will need it for the `GH_TOKEN` environment variable.

## 2. Configuration

### GitHub Repository Details

Update the following files with your GitHub username (owner) and repository name:

1.  **`electron-builder.yml`**:
    ```yaml
    publish:
      provider: github
      owner: your-github-username
      repo: Spiral
    ```

2.  **`dev-app-update.yml`** (for local testing):
    ```yaml
    provider: github
    owner: your-github-username
    repo: Spiral
    ```

### Authentication

Set the `GH_TOKEN` environment variable in your terminal before running the publish command:

**Windows (PowerShell):**
```powershell
$env:GH_TOKEN = "your_github_token_here"
```

**macOS/Linux:**
```bash
export GH_TOKEN=your_github_token_here
```

## 3. Versioning

Before publishing, you **must** increment the version number in `package.json`:

```json
{
  "name": "Spiral",
  "version": "1.1.0",
  ...
}
```

Spiral uses Semantic Versioning (SemVer). The auto-updater compares this version string to determine if an update is available.

## 4. Building and Publishing

### Building Locally (No Publish)

To test the build locally without uploading to GitHub, use the following scripts:

- **Windows**: `npm run build:win`
- **macOS**: `npm run build:mac`
- **Linux**: `npm run build:linux`

Artifacts will be generated in the `dist/` directory.

### Publishing to GitHub

To build and automatically upload the artifacts to GitHub as a **Draft Release**:

```bash
# Windows
npm run build && npx electron-builder --win --publish always

# macOS
npm run build && npx electron-builder --mac --publish always

# Linux
npm run build && npx electron-builder --linux --publish always
```

*Note: You can also add a dedicated `publish` script to `package.json` for convenience.*

## 5. Completing the Release on GitHub

After the publish command finishes:

1.  Navigate to your repository on GitHub.
2.  Go to **Releases**. You should see a new **Draft** release.
3.  **Release Notes**: Edit the draft and enter your release notes in the description box. Spiral fetches these notes and displays them to users in the "Update Available" and "Release Notes" dialogs.
4.  **Publish**: Click **Publish release**. Once published, the auto-updater in existing installations will detect the new version.

### Release Notes Format
The application pulls the body of the GitHub release as the release notes. Use Markdown for formatting. If you want to group notes by version in the "Release History" view, ensure each release body is concise and relevant to that specific version.

## 6. How Auto-Update Works

- **Check**: Spiral checks for updates 5 seconds after launch and can be manually triggered from **Settings > General**.
- **Download**: Updates are NOT downloaded automatically. The user must click **Update Now** in the update dialog.
- **Install**: The app uses `electron-updater`'s `quitAndInstall(false, true)`. It closes the app and restarts it immediately with the new version applied.
- **State**: The app tracks its previous version to show an "Updated — see what's new" notification on the first launch after a successful update.

## 7. Local Testing of Auto-Updates

To test the update flow without a fully published production app:

1.  Ensure `dev-app-update.yml` is present in the root.
2.  Run the app in development mode: `npm run dev`.
3.  The `autoUpdater` will use `dev-app-update.yml` to check against the GitHub repository.
4.  *Note: You cannot fully "install" an update in dev mode, but you can verify that the "Update Available" dialog appears and the release notes are fetched correctly.*

## 8. Relevant Files

- `package.json`: Versioning and build scripts.
- `electron-builder.yml`: Main build and publish configuration.
- `dev-app-update.yml`: Update configuration for development.
- `src/main/updater.ts`: Backend logic for checking, downloading, and installing updates.
- `docs/features.md`: Additional details on the Auto-Update feature implementation.
