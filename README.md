# Rightly

Smart Hebrew and Arabic right-to-left support for GPT Work / Codex and Claude Desktop on Windows.

Rightly detects RTL characters anywhere in a line, aligns mixed-language content correctly, and keeps code, application controls, and English-only text left-to-right. It also handles lists, tables, the message composer, and mixed Hebrew-English task titles in the sidebar.

## Features

- Hebrew or Arabic anywhere in a line switches that line to RTL, even when it starts in English.
- English-only content and application chrome remain LTR.
- Inline code and code blocks remain LTR.
- Bullets and numbered-list markers stay on the correct side.
- RTL tables are centered and their cells are aligned correctly.
- Mixed Hebrew-English sidebar titles preserve their reading order while remaining left-aligned.
- Long conversations are processed in small idle-time batches to avoid blocking the interface.
- No scheduled task, watcher, persistent Node process, or background repair service is installed.

## Requirements

- Windows 10 or Windows 11.
- The official GPT Work / Codex app and/or Claude Desktop.
- [Node.js LTS](https://nodejs.org/) for ASAR tooling and, on protected MSIX builds, the short launch-time injector.
- An internet connection during installation.
- Administrator approval when requested. It is required for Claude patching and legacy-installation cleanup.

## Installation

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/NoamHermos/rightly/main/installer/install-online.ps1 | iex
```

Choose one target from the interactive menu:

1. `GPT Work / Codex`
2. `Claude Desktop / Code`
3. `Both`

Rightly force-closes the selected application's complete process tree before patching, waits for its files to be released, and then reopens only that application. Save any active work in the selected app first. The installer also creates one desktop shortcut named **Repair RTL**, using the Rightly icon.

For a reviewable local installation, download the repository, inspect the scripts, and run `installer/install.bat` instead of executing the online command directly.

## Usage and updates

- The selected app opens with the RTL correction active after installation.
- **Repair RTL** downloads the current `main` snapshot before showing the target menu, so every successful repair uses the latest project code. An internet connection is required.
- When GPT accepts the persistent patch, it can be opened normally. When Windows keeps its MSIX files immutable, open it with the **Rightly GPT** desktop shortcut so the launch-time payload can be injected.
- Claude remains corrected after a normal close, relaunch, or Windows restart and can be opened normally.
- After an official app update, run **Repair RTL** and select only the app that was updated.
- GPT is reported as successful only after either its rebuilt ASAR passes SHA-256 verification or its launch-time payload marker is verified in a live renderer.
- Claude is patched in place and remains corrected until an official update replaces its files.
- The local repair bundle refreshes itself during each repair. Rightly does not keep an automatic updater or repair process running in the background.

## How it works

### GPT Work / Codex

Rightly first creates a version-specific backup of the official external `app.asar`, embeds `codex-rtl-payload.js` into the renderer entry bundles, rebuilds the ASAR, and verifies both the original and patched files with SHA-256. It retries access-denied replacement with Windows backup-mode copy and never treats the copy as successful until the installed hash matches.

The persistent in-place ASAR patch modifies a file inside the Microsoft Store package. Rightly records the exact package version and never restores a backup across versions. If Windows reports success but keeps the file immutable, Rightly verifies that the original is intact and switches to a loopback-only launch-time injector. That fallback creates a **Rightly GPT** shortcut, keeps the official package untouched, verifies the payload marker in the live renderer, and disconnects its DevTools session after startup. Neither mode copies the application or installs a watcher, scheduled task, or persistent Node process.

### Claude Desktop / Code

Rightly downloads a pinned revision of [`shraga100/claude-desktop-rtl-patch`](https://github.com/shraga100/claude-desktop-rtl-patch), verifies its known SHA-256 digest, replaces its RTL payload, and applies it directly to Claude's official ASAR with backup and rollback support. Rightly does not create a copied Claude application, and it removes known legacy auto-update mechanisms.

> [!WARNING]
> The persistent GPT mode and the Claude integration modify signed application files. Claude also uses the upstream patch engine's local self-signed certificate mechanism. The protected-package GPT fallback uses a loopback DevTools endpoint during startup instead. These are unofficial modifications, may conflict with product terms or future app updates, and are used at your own risk.

### Direction rules

- A line containing a Hebrew or Arabic letter is rendered RTL, regardless of its first word.
- A line without RTL letters remains LTR.
- Inline code and code blocks remain LTR.
- Lists place their markers on the correct side.
- RTL tables stay within the message width and are centered in the content area.
- Sidebar task titles remain left-aligned; titles containing Hebrew receive a hidden `U+200F` mark to preserve word order.
- Long threads are updated in bounded idle-time batches rather than full-page synchronous scans.

## Project structure

| Path | Responsibility |
| --- | --- |
| `installer/` | Online and local entry points, repair wrapper, and shared installation helpers |
| `src/gpt/` | GPT ASAR patcher, protected-package runtime fallback, reusable builder, and direction payload |
| `src/claude/` | Verified Claude patcher and direction payload |
| `assets/` | Rightly branding used by the repair shortcut |
| `docs/` | Third-party notices and supporting documentation |
| `.github/` | GitHub Actions and the security policy |
| `tests/` | Behavior, structure, and integration verification |

The payloads are standalone files applied to each renderer as one unit. GPT embeds its payload when the package is writable and injects that same file at launch when MSIX protection prevents a verified replacement. Installation code is separated by responsibility so each target can be repaired or removed independently.

## Privacy and security

- Rightly does not send conversation content to its own server.
- GPT backup and installed-file hashes are recorded per Microsoft Store package version; rollback refuses mismatched files. The runtime fallback binds its DevTools endpoint to `127.0.0.1`, verifies the payload marker, and disconnects after startup.
- The external Claude engine is pinned to an exact commit and verified with SHA-256 before execution.
- No automatic patcher, scheduled task, watcher, or persistent Node process is installed.
- Read the [security policy](.github/SECURITY.md) before reporting a vulnerability.

## Uninstallation

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/NoamHermos/rightly/main/installer/uninstall-online.ps1 | iex
```

Choose GPT, Claude, or both. Persistent installations restore only their verified, version-matched official backup; protected-package GPT installations remove their runtime and **Rightly GPT** shortcut. Selecting both also removes the repair bundle and repair shortcut.

## Troubleshooting

- Repair shortcut logs: `%LOCALAPPDATA%\Programs\Rightly\Repair\logs`
- Persistent GPT state and rollback backup: `%ProgramData%\Rightly\GPT`
- Protected-package GPT runtime, state, and launch log: `%LOCALAPPDATA%\Programs\Rightly\GPT`
- Claude startup stdout and stderr are kept in the repair log directory instead of appearing after the final success message.
- If an app update changes the interface, run **Repair RTL** for that app.
- If GPT was updated, Rightly detects the new Store package version and refreshes either the version-specific patch or the protected-package runtime fallback.
- If Claude installation fails, do not delete `.bak` files manually; use the uninstaller so the rollback engine can restore them.

## Development

Run the complete local verification suite from PowerShell:

```powershell
node tests/direction.test.js
node tests/claude-direction.test.js
./tests/verify-static.ps1
./tests/verify-package.ps1
./tests/verify-codex.ps1 -SkipInstalledBuild
./tests/verify-claude.ps1 -SkipInstalledBuild
```

Rightly is an independent project and is not affiliated with OpenAI or Anthropic. Product names belong to their respective owners. The project is distributed under the [MIT License](LICENSE); third-party licenses and attribution are listed in [THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md).
