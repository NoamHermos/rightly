# Code signing policy

Free code signing provided by SignPath.io, certificate by SignPath Foundation.

## Signed artifact

Only `Rightly GPT.exe` is submitted for signing. It is compiled from
`src/gpt/Rightly.Gpt.Launcher.cs` with the icon in `assets/rightly-gpt.ico` by
the repository's GitHub Actions workflow. Rightly does not submit Claude,
Codex, third-party binaries, downloaded files, or locally modified files for
signing under this project.

The signing workflow uploads the unsigned launcher as a GitHub workflow
artifact. SignPath verifies its GitHub build origin, applies the configured
metadata restrictions, requires release approval, and returns an Authenticode-
signed launcher. The SignPath private key remains in its managed HSM; this
project does not receive or store a PFX file.

## Team roles

- Authors, committers, and reviewers: [NoamHermos](https://github.com/NoamHermos)
- Signing approver: [NoamHermos](https://github.com/NoamHermos)

Changes from contributors who do not have commit access must be reviewed before
they are merged. Every release-signing request requires manual approval.

## Privacy

Rightly does not collect telemetry or send conversation content to a Rightly
service. This program will not transfer any information to other networked
systems unless specifically requested by the user or the person installing or
operating it.

User-requested installation and repair download Rightly source from GitHub and,
for the Claude integration, a pinned open-source patch engine whose digest is
verified before use. Rightly launches the separately installed official Codex
or Claude application; those applications' network activity is governed by
their respective providers' terms and privacy policies.

## User-visible system changes

Rightly documents its installation, repair, and uninstall operations in the
repository README. It does not install an automatic updater, scheduled task, or
persistent background service. The Claude integration modifies the selected
installed application only after an explicit user choice and administrator
approval, with backup and rollback support.

## SignPath configuration

The proposed artifact configuration is stored at
`.signpath/artifact-configuration.xml`. After SignPath Foundation approves the
project, configure these GitHub repository values:

- Secret: `SIGNPATH_API_TOKEN`
- Variable: `SIGNPATH_ORGANIZATION_ID`
- Variable: `SIGNPATH_PROJECT_SLUG`
- Variable: `SIGNPATH_SIGNING_POLICY_SLUG`
- Variable: `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`

Until those values exist, the signing workflow intentionally builds and uploads
only the unsigned provenance artifact and skips the signing request.
