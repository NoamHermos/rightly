# Security policy

## Supported version

Only the latest published Rightly release is supported. The `main` branch is
the development source used by the default one-line installer; versioned tags
provide immutable source snapshots for users who prefer a pinned installation.

## Reporting a vulnerability

Please report security issues privately through a
[GitHub Security Advisory](https://github.com/NoamHermos/rightly/security/advisories/new).
Do not open a public issue for a vulnerability that could put users at risk.

Include the affected Rightly commit or release, Windows version, target app and
version, reproduction steps, and any relevant log excerpt with personal data
removed.

## Trust model

Rightly performs privileged and application-integrity-sensitive operations, so
users should review the installer before running it.

- **GPT Work / Codex:** Rightly modifies the official package's external
  `app.asar` in place. Before doing so, it creates a package-version-specific
  backup and records SHA-256 hashes for the original and patched files. Restore
  operations refuse backups from another version or unexpected file contents.
- **Claude:** Rightly downloads one pinned upstream patch script, verifies its
  exact SHA-256 digest, replaces only its renderer payload and non-interactive
  entry point, then relies on that engine's backup and rollback flow. That
  engine modifies signed Claude binaries and uses a local self-signed
  certificate as documented by the upstream project.
- **Background activity:** Rightly does not install a scheduled task, watcher,
  service, or persistent Node process. Installers remove known legacy tasks.
- **Online installer and repair shortcut:** both download this repository from
  the branch or tag named in `installer/install-online.ps1`. The desktop repair
  shortcut deliberately uses `main` so it can repair an updated app with the
  current project code. Running code from `main` always carries normal
  branch-compromise risk; a versioned release should be preferred when automatic
  updates are not required.

## In scope

- Unsafe command execution or argument handling.
- GPT package-version, hash-verification, or rollback bypasses.
- Hash-verification bypasses in the Claude integration.
- Path traversal or deletion outside Rightly's documented managed directories.
- Failure of backup or rollback logic that can leave an official app unusable.
- Accidental capture or transmission of conversation content.

## Out of scope

- UI breakage caused by an unsupported future app version when no security
  boundary is crossed.
- Issues caused by locally modified scripts or disabled hash checks.
- Security behavior of OpenAI, Anthropic, Electron, Node.js, or the pinned
  upstream project outside the way Rightly invokes them.
