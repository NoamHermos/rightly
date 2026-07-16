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
- [Node.js LTS](https://nodejs.org/) for ASAR tooling during installation and repair.
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
- GPT and Claude remain corrected after a normal close, relaunch, or Windows restart. Open either app from its normal Start menu or taskbar shortcut.
- After an official app update, run **Repair RTL** and select only the app that was updated.
- GPT is reported as successful only after its rebuilt ASAR and rollback metadata pass SHA-256 verification.
- Claude is patched in place and remains corrected until an official update replaces its files.
- The local repair bundle refreshes itself during each repair. Rightly does not keep an automatic updater or repair process running in the background.

## How it works

### GPT Work / Codex

Rightly creates a version-specific backup of the official external `app.asar`, embeds `codex-rtl-payload.js` into the renderer entry bundles, rebuilds the ASAR, and verifies both the original and patched files with SHA-256. The official app is not copied, and it starts normally without a DevTools endpoint, launcher wrapper, watcher, or background injector.

The persistent in-place ASAR patch modifies a file inside the Microsoft Store package. Rightly records the exact package version and never restores a backup across versions. If an install fails, it restores the verified original before returning an error.

### Claude Desktop / Code

Rightly downloads a pinned revision of [`shraga100/claude-desktop-rtl-patch`](https://github.com/shraga100/claude-desktop-rtl-patch), verifies its known SHA-256 digest, replaces its RTL payload, and applies it directly to Claude's official ASAR with backup and rollback support. Rightly does not create a copied Claude application, and it removes known legacy auto-update mechanisms.

> [!WARNING]
> The GPT and Claude integrations modify signed application files. Claude also uses the upstream patch engine's local self-signed certificate mechanism. These are unofficial modifications, may conflict with product terms or future app updates, and are used at your own risk.

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
| `src/gpt/` | Persistent GPT ASAR patcher, reusable ASAR builder, and direction payload |
| `src/claude/` | Verified Claude patcher and direction payload |
| `assets/` | Rightly branding used by the repair shortcut |
| `docs/` | Third-party notices and supporting documentation |
| `.github/` | GitHub Actions and the security policy |
| `tests/` | Behavior, structure, and integration verification |

The payloads are intentionally standalone files embedded into each renderer as one unit without a runtime dependency. Installation code is separated by responsibility so each target can be repaired or removed independently.

## Privacy and security

- Rightly does not send conversation content to its own server.
- GPT backup and installed-file hashes are recorded per Microsoft Store package version; rollback refuses mismatched files.
- The external Claude engine is pinned to an exact commit and verified with SHA-256 before execution.
- No automatic patcher, scheduled task, watcher, or persistent Node process is installed.
- Read the [security policy](.github/SECURITY.md) before reporting a vulnerability.

## Uninstallation

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/NoamHermos/rightly/main/installer/uninstall-online.ps1 | iex
```

Choose GPT, Claude, or both. Each target restores only its verified, version-matched official backup. Selecting both also removes the repair bundle and desktop shortcut.

## Troubleshooting

- Repair shortcut logs: `%LOCALAPPDATA%\Programs\Rightly\Repair\logs`
- GPT state and rollback backup: `%ProgramData%\Rightly\GPT`
- Claude startup stdout and stderr are kept in the repair log directory instead of appearing after the final success message.
- If an app update changes the interface, run **Repair RTL** for that app.
- If GPT was updated, Rightly detects the new Store package version and creates a fresh version-specific backup before patching it.
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
