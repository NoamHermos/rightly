# Rightly

Rightly adds intelligent Hebrew and Arabic right-to-left rendering to the official GPT Work / Codex and Claude Desktop applications on Windows.

It detects RTL letters anywhere in a line, including lines that begin with an English word. Mixed-language messages, lists, tables, task titles, and interactive question panels are displayed in the correct reading direction, while code and English-only interface elements remain left-to-right.

## Requirements

- Windows 10 or Windows 11.
- The official GPT Work / Codex application and/or Claude Desktop.
- [Node.js LTS](https://nodejs.org/).
- An internet connection during installation and repair.
- Administrator approval for the Claude integration. GPT installation itself does not require access to `WindowsApps`.

Save active work before installation or repair. Claude must be restarted while its files are patched. GPT may be restarted once if it is already open without a verified Rightly session.

## Installation

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/NoamHermos/rightly/main/installer/install-online.ps1 | iex
```

Choose one target:

1. `GPT Work / Codex`
2. `Claude Desktop / Code`
3. `Both`

The installer downloads the current `main` revision, removes known obsolete Rightly installations, and installs only the selected integration.

It creates these shortcuts when applicable:

| Shortcut | Purpose | Normal use |
| --- | --- | --- |
| **Rightly GPT** | Opens the official GPT application and verifies the RTL payload in its live renderer | Use this instead of the normal GPT shortcut |
| **Repair RTL** | Downloads the latest Rightly revision and repairs GPT, Claude, or both | Use after an official application update or a Rightly update |

The **Rightly GPT** executable is also added to the Start menu. Existing taskbar pins that already target the managed launcher are refreshed during repair.

Claude continues to use its normal official shortcut after installation. Rightly never creates a copied GPT or Claude application.

## GPT and Claude integrations

Both integrations use the same direction rules, but the official applications require different delivery methods.

| Behavior | GPT Work / Codex | Claude Desktop / Code |
| --- | --- | --- |
| Official package | Protected Microsoft Store package | Official desktop installation whose application files can currently be patched |
| Rightly delivery | Dedicated launch-time executable and a short-lived loopback injector | Verified in-place patch with backup and rollback support |
| Does Rightly replace `app.asar`? | No | Claude's verified patch engine updates the required application resources |
| Normal way to open | **Rightly GPT** | The normal Claude shortcut |
| Work performed at startup | The launcher injects and verifies each newly created GPT renderer | No Rightly startup process is required after patching |
| If the last window is closed to the notification area | **Rightly GPT** asks the existing corrected process to create a new window, then verifies that renderer | Claude follows its normal behavior |
| After an official update | Run **Repair RTL**, select GPT, then keep using **Rightly GPT** | Run **Repair RTL** and select Claude |
| Administrator approval | Not normally required | Required for the installed application files |
| Permanent background service | None | None |

GPT's Store `app.asar` is intentionally left untouched. Current Windows builds deny write access to that file even from an elevated process, and changing a protected package is less reliable than a version-independent launcher.

## Everyday GPT behavior

**Rightly GPT.exe** is a small native Windows launcher with a branded progress window. It reports whether it is checking, opening, injecting, or verifying GPT.

Its behavior depends on GPT's current state:

| GPT state | Rightly action |
| --- | --- |
| Not running | Locates the newest installed `OpenAI.Codex` package, opens it with a private loopback debugging endpoint, injects the payload, and verifies its marker |
| Open and already corrected | Verifies the live marker, preserves the process, and focuses its window |
| Minimized to the taskbar | Restores and focuses the corrected window |
| Running only in the notification area | Preserves the corrected process, creates a new official window, applies Rightly to the new renderer, and verifies it |
| Open without a verified correction | Closes that uncorrected process tree once and reopens the official app through Rightly |
| Launcher clicked twice | A Windows single-instance lock keeps the first launch active; the second click reports that GPT is already starting |

On success, the progress window confirms that Rightly is active and closes automatically. On failure, it remains visible with a clear message and a path to the diagnostic log.

## How it works

### Direction engine

Rightly installs a renderer payload tailored to each application. The payload follows these rules:

- A text line containing a Hebrew or Arabic letter is rendered RTL, regardless of its first word.
- A line without RTL letters remains LTR.
- Inline code, code blocks, and technical controls remain LTR.
- Bullets and numbered-list markers stay on the correct side.
- Tables containing RTL text are centered within the message width, use the correct column direction, and align RTL cells correctly.
- Mixed Hebrew-English task titles remain left-aligned in the sidebar while receiving an invisible `U+200F` mark that preserves their reading order.
- Claude interactive question and answer panels receive the same direction rules as normal messages.
- Long conversations are processed in small idle-time batches instead of synchronous full-page scans.

DOM mutations are queued and processed incrementally. Newly streamed messages and newly opened chats are handled without repeatedly scanning the complete conversation.

### GPT Work / Codex

The GPT integration never writes to the Microsoft Store installation:

1. `Rightly GPT.exe` starts its hidden PowerShell controller and shows a native status window.
2. The controller discovers the newest installed `OpenAI.Codex` package instead of storing a version-specific executable path.
3. It reserves a random local port bound to `127.0.0.1` and activates the official package with Chromium's loopback DevTools endpoint.
4. A short-lived Node.js injector connects only to page-specific local WebSockets.
5. It evaluates the Rightly renderer payload and checks `globalThis.__RT_AI_CODEX_RTL_PATCH__` in the live renderer.
6. Startup succeeds only after the marker returns `true`.
7. The injector disconnects after its bounded startup window. No persistent Node process remains.

If GPT is already running, the launcher first checks its command line and live marker. A verified process is preserved. An unverified process is restarted once because Chromium debugging flags cannot be added to an existing Electron process.

### Claude Desktop / Code

Rightly downloads a pinned revision of the upstream Claude patch engine, verifies its expected SHA-256 digest, replaces its direction payload with Rightly's current implementation, and runs the verified engine with backup and rollback support.

The verified engine applies it directly to Claude. Rightly does not create a copied Claude application.

The integration removes known legacy automatic patchers and copied-app shortcuts. After installation, Claude can be opened normally until an official update replaces the modified resources.

## What happens after an official update?

An official GPT update installs a new versioned Store directory. It does not overwrite **Rightly GPT.exe**, which is stored separately under the current user profile. The launcher discovers the new package on its next run, so an update does not make its shortcut point to an obsolete GPT path.

However, a major GPT update can change renderer structure or security behavior. Run **Repair RTL** after an update so the launcher, injector, and payload are refreshed from the latest Rightly revision. The launcher's live marker verification prevents a silent success when the updated renderer is no longer compatible.

Claude updates can replace the resources modified by its in-place integration, so Claude must also be repaired after an official update.

No scheduled task, watcher, persistent Node process, or automatic repair service is installed. Repair is intentionally user-triggered.

## Installed files

The GPT launcher, payload, injector, state, and logs are stored under:

```text
%LOCALAPPDATA%\Programs\Rightly\GPT
```

The repair command is stored under:

```text
%LOCALAPPDATA%\Programs\Rightly\Repair
```

Rightly does not store a GPT ASAR backup because the GPT package is not modified.

## Uninstallation

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/NoamHermos/rightly/main/installer/uninstall-online.ps1 | iex
```

Choose GPT, Claude, or both.

- GPT removal deletes the managed launcher, payload, state, logs, and shortcuts. It does not touch the official Store package.
- Claude removal uses the verified rollback mechanism of its patch engine.
- Selecting both also removes the shared repair bundle and **Repair RTL** shortcut.

## Privacy and security

Rightly does not send conversation content to a Rightly server. The GPT debugging endpoint accepts loopback connections only, and the injector disconnects after live verification.

Rightly is an independent, unofficial project and is not affiliated with OpenAI or Anthropic. Application updates can affect compatibility, and the project is used at your own risk.

The project is distributed under the [MIT License](LICENSE). Third-party licenses and attribution are listed in [THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md), and security information is available in the [security policy](.github/SECURITY.md).
