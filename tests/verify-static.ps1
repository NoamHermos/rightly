$ErrorActionPreference = "Stop"

function Assert-True {
    param([bool] $Condition, [string] $Message)
    if (-not $Condition) { throw $Message }
}

function Read-RepoFile {
    param([string] $RelativePath)
    return Get-Content -LiteralPath (Join-Path $repoRoot $RelativePath) -Raw
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$required = @(
    "README.md",
    "LICENSE",
    ".github\SECURITY.md",
    "docs\THIRD_PARTY_NOTICES.md",
    "installer\install.ps1",
    "installer\install-online.ps1",
    "installer\install.bat",
    "installer\uninstall.ps1",
    "installer\uninstall-online.ps1",
    "installer\uninstall.bat",
    "installer\run-repair.ps1",
    "installer\lib\Rightly.Install.ps1",
    "assets\rightly-logo.png",
    "assets\rightly.ico",
    "assets\rightly-gpt-logo.png",
    "assets\rightly-gpt.ico",
    "src\gpt\patch.ps1",
    "src\gpt\codex-rtl-payload.js",
    "src\gpt\gpt-rtl-cdp.js",
    "src\gpt\launch-gpt.ps1",
    "src\gpt\Rightly.Gpt.Launcher.cs",
    "src\gpt\lib\Rightly.GptLauncher.ps1",
    "src\claude\patch.ps1",
    "src\claude\claude-rtl-payload.js",
    "tests\verify-package.ps1"
)
foreach ($relative in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $repoRoot $relative)) "Required file is missing: $relative"
}
Assert-True (-not (Test-Path -LiteralPath (Join-Path $repoRoot "src\gpt\lib\Rightly.GptAsar.ps1"))) "Removed GPT ASAR helper is still present"

$obsolete = @(
    "fix-autoupdate-online.ps1", "install.ps1", "install-online.ps1", "install.bat",
    "uninstall.ps1", "uninstall-online.ps1", "uninstall.bat", "run-repair.ps1",
    "patch.ps1", "launch-gpt.ps1", "gpt-rtl-cdp.js", "codex-rtl-payload.js",
    "install-online.sh", "patch.sh", "uninstall-online.sh", "status.bat",
    "claude\README.md", "claude\install-online.ps1", "claude\install.bat",
    "claude\status.bat", "claude\uninstall-online.ps1", "claude\uninstall.bat"
)
foreach ($relative in $obsolete) {
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relative))) "Obsolete entry point still exists: $relative"
}

$powerShellFiles = @(
    "installer\install.ps1", "installer\install-online.ps1", "installer\uninstall.ps1",
    "installer\uninstall-online.ps1", "installer\run-repair.ps1",
    "installer\lib\Rightly.Install.ps1", "tests\verify-package.ps1",
    "src\gpt\patch.ps1", "src\gpt\launch-gpt.ps1",
    "src\gpt\lib\Rightly.GptLauncher.ps1", "src\claude\patch.ps1"
)
foreach ($relative in $powerShellFiles) {
    $tokens = $null
    $errors = $null
    [void] [System.Management.Automation.Language.Parser]::ParseFile(
        (Join-Path $repoRoot $relative), [ref] $tokens, [ref] $errors)
    Assert-True (-not $errors) "$relative has PowerShell syntax errors: $errors"
}

$installer = Read-RepoFile "installer\install.ps1"
$onlineInstaller = Read-RepoFile "installer\install-online.ps1"
$installerModule = Read-RepoFile "installer\lib\Rightly.Install.ps1"
$uninstaller = Read-RepoFile "installer\uninstall.ps1"
$patcher = Read-RepoFile "src\gpt\patch.ps1"
$launcherModule = Read-RepoFile "src\gpt\lib\Rightly.GptLauncher.ps1"
$runtimeLauncher = Read-RepoFile "src\gpt\launch-gpt.ps1"
$runtimeInjector = Read-RepoFile "src\gpt\gpt-rtl-cdp.js"
$nativeLauncher = Read-RepoFile "src\gpt\Rightly.Gpt.Launcher.cs"
$payload = Read-RepoFile "src\gpt\codex-rtl-payload.js"
$claudePatcher = Read-RepoFile "src\claude\patch.ps1"
$repair = Read-RepoFile "installer\run-repair.ps1"
$readme = Read-RepoFile "README.md"
$thirdParty = Read-RepoFile "docs\THIRD_PARTY_NOTICES.md"

# GPT only installs its dedicated runtime and never mutates WindowsApps.
Assert-True ($patcher.Contains('architecture = "launcher-only-loopback-runtime"')) "Launcher-only GPT architecture is missing"
Assert-True ($patcher.Contains('officialPackageModified = $false')) "Untouched official package is not represented in state"
Assert-True ($patcher.Contains('Get-AppxPackage -Name "OpenAI.Codex"')) "Dynamic official package discovery is missing"
Assert-True ($patcher.Contains('$Script:RuntimeExe')) "Dedicated GPT executable is missing"
Assert-True ($patcher.Contains('New-RightlyGptLauncher')) "Dedicated GPT executable is not built"
Assert-True ($patcher.Contains('New-RightlyGptShortcuts')) "GPT launcher shortcuts are not created"
Assert-True (-not $patcher.Contains('New-RightlyGptAsar')) "ASAR builder remains active"
Assert-True (-not $patcher.Contains('Grant-AsarWriteAccess')) "WindowsApps ACL mutation remains active"
Assert-True (-not $patcher.Contains('takeown.exe')) "WindowsApps ownership mutation remains active"
Assert-True (-not $patcher.Contains('robocopy.exe')) "ASAR replacement remains active"
Assert-True (-not $patcher.Contains('architecture = "official-in-place-asar"')) "Persistent ASAR is still an install architecture"
Assert-True (-not $installerModule.Contains('"src\gpt\lib\Rightly.GptAsar.ps1",')) "Repair bundle still ships ASAR tooling"
Assert-True ($installerModule.Contains('Remove-Item -LiteralPath (Join-Path $Script:RightlyRepairDir "src\gpt\lib\Rightly.GptAsar.ps1")')) "Installed repair bundles do not delete obsolete ASAR tooling"
Assert-True ($installerModule.Contains('if ($Target -eq "GptWork") { return $false }')) "GPT-only installation still elevates"
Assert-True (-not $patcher.Contains('Register-ScheduledTask')) "GPT must not register background repair"

# Legacy persistent releases can only be restored with exact identity and hashes.
Assert-True ($patcher.Contains('Restore-LegacyPersistentPatch')) "Legacy ASAR migration is missing"
Assert-True ($patcher.Contains('packageFullName -ne $Official.PackageFullName')) "Legacy package version isolation is missing"
Assert-True ($patcher.Contains('rollback backup failed SHA-256 verification')) "Legacy backup verification is missing"
Assert-True ($patcher.Contains('Nothing was changed')) "Unsafe legacy state is not preserved"

# Native launcher and runtime verification behavior.
Assert-True ($launcherModule.Contains('$shortcut.TargetPath = $LauncherPath')) "GPT shortcut does not target the EXE"
Assert-True ($launcherModule.Contains('$shortcut.IconLocation = "$IconPath,0"')) "GPT shortcut does not use its icon"
Assert-True ($launcherModule.Contains('User Pinned\TaskBar')) "Existing GPT taskbar pins are not refreshed"
Assert-True ($nativeLauncher.Contains('MutexName')) "GPT launcher has no single-instance lock"
Assert-True ($nativeLauncher.Contains('class StatusWindow')) "GPT launcher has no progress GUI"
Assert-True ($runtimeLauncher.Contains('Test-RunningRightlyPayload')) "Existing GPT payload is not verified"
Assert-True ($runtimeLauncher.Contains('Test-RunningRightlyHost')) "Tray-only corrected GPT is not recognized"
Assert-True ($runtimeLauncher.Contains('Start-Injector $port')) "New GPT renderers are not injected"
Assert-True ($runtimeInjector.Contains('verifyRunningInstance')) "GPT injector lacks verify-only mode"
Assert-True ($runtimeInjector.Contains('hasRightlyMarker')) "GPT injector does not verify the marker"

# Direction rules remain application-specific and performance-bounded.
Assert-True ($payload.Contains('hasHebrew')) "Hebrew-anywhere detection is missing"
Assert-True ($payload.Contains('APP_CHROME_SEL')) "Application chrome exclusion is missing"
Assert-True ($payload.Contains('processTables')) "RTL table processing is missing"
Assert-True ($payload.Contains('list-style-position:outside!important')) "RTL list styling is missing"
Assert-True ($payload.Contains('requestIdleCallback')) "Long-chat work is not idle-scheduled"
Assert-True ($payload.Contains('PROCESS_BATCH_SIZE = 3')) "Long-chat processing is not bounded"
Assert-True ($payload.Contains('normalizeSidebarTitleText')) "Mixed Hebrew sidebar titles are not normalized"

# Shared installer and repair command stay current and user-triggered.
Assert-True ($installer.Contains('lib\Rightly.Install.ps1')) "Installer does not load the shared module"
Assert-True ($installerModule.Contains('ValidateSet("install", "repair", "uninstall")')) "Interactive operations are incomplete"
Assert-True ($installerModule.Contains('assets\rightly.ico')) "Repair bundle does not include the icon"
Assert-True ($installerModule.Contains('installer\install-online.ps1')) "Repair bundle cannot refresh from main"
Assert-True ($installerModule.Contains('"Repair RTL.lnk"')) "Interactive repair shortcut is missing"
Assert-True ($installerModule.Contains('-Target Prompt')) "Repair shortcut does not open the target menu"
Assert-True (-not $installerModule.Contains('@("Codex.lnk"')) "Installer may delete an official Codex shortcut"
Assert-True ($repair.Contains('& $onlineInstaller -Repo "NoamHermos/rightly" -Branch "main" -Target $Target -RepairMode')) "Repair runner does not fetch main"
Assert-True ($onlineInstaller.Contains('$installerArguments += "-RepairMode"')) "Online installer does not forward repair mode"
Assert-True ($repair.Contains('Start-Transcript')) "Repair failures are not logged"
Assert-True ($repair.Contains('Show-RightlySuccess')) "Repair has no clear success result"
Assert-True ($installer.Contains('-IsolateApplicationOutput')) "Claude output is not isolated"
Assert-True ($uninstaller.Contains('Select-RightlyTarget -Operation "uninstall"')) "Unified uninstall menu is missing"

# Claude remains the verified in-place integration.
Assert-True ($claudePatcher.Contains('$Script:UpstreamCommit')) "Pinned Claude revision is missing"
Assert-True ($claudePatcher.Contains('$Script:UpstreamSha256')) "Pinned Claude SHA-256 is missing"
Assert-True ($claudePatcher.Contains('Remove-AutomaticPatching')) "Legacy Claude watcher cleanup is missing"
Assert-True ($claudePatcher.Contains('Remove-LegacyCopy')) "Legacy Claude copy cleanup is missing"
Assert-True (-not $claudePatcher.Contains('Register-ScheduledTask')) "Claude must not register background repair"
Assert-True ($claudePatcher.Contains('--no-deprecation')) "Claude deprecation warning suppression is missing"
Assert-True ((Read-RepoFile "src\claude\claude-rtl-payload.js").Contains('processInteractiveQuestions')) "Claude question panels are not processed"

# Brand assets are real PNG/ICO files.
foreach ($relative in @("assets\rightly-logo.png", "assets\rightly-gpt-logo.png")) {
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $repoRoot $relative))
    Assert-True ($bytes.Length -gt 10000 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) "$relative is invalid"
}
foreach ($relative in @("assets\rightly.ico", "assets\rightly-gpt.ico")) {
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $repoRoot $relative))
    Assert-True ($bytes.Length -gt 10000 -and $bytes[0] -eq 0 -and $bytes[1] -eq 0 -and $bytes[2] -eq 1) "$relative is invalid"
}

# Repository and public documentation describe only the current design.
Assert-True (-not (Test-Path -LiteralPath (Join-Path $repoRoot "OLD"))) "Legacy copied-app archive must not ship"
$allowedRootFiles = @(".gitattributes", ".gitignore", "LICENSE", "README.md")
$unexpectedRootFiles = @(Get-ChildItem -LiteralPath $repoRoot -File -Force | Where-Object Name -NotIn $allowedRootFiles)
Assert-True ($unexpectedRootFiles.Count -eq 0) "Unexpected root files remain: $($unexpectedRootFiles.Name -join ', ')"
Assert-True ($readme.Contains('NoamHermos/rightly/main/installer/install-online.ps1')) "README installer URL is wrong"
Assert-True ($readme.Contains('## GPT and Claude integrations')) "README comparison is missing"
Assert-True ($readme.Contains('never writes to the Microsoft Store installation')) "README does not explain GPT architecture"
Assert-True ($readme.Contains('What happens after an official update?')) "README does not explain update behavior"
Assert-True ($readme.Contains('No scheduled task')) "README does not state that repair is user-triggered"
Assert-True (-not $readme.Contains('persistent in-place ASAR patch')) "README still documents removed GPT mode"
Assert-True ($readme -notmatch '[\u0590-\u05FF\uFB1D-\uFB4F]') "README must be entirely English"
Assert-True ($readme -notmatch '(?m)!\[') "README must not embed Markdown images"
Assert-True ($thirdParty.Contains('Copyright (c) 2026 RT-AI')) "Original MIT attribution is missing"
Assert-True ($thirdParty.Contains('Copyright (c) 2026 shraga100')) "Claude engine attribution is missing"

& node.exe (Join-Path $PSScriptRoot "direction.test.js")
Assert-True ($LASTEXITCODE -eq 0) "GPT direction behavior tests failed"
& node.exe (Join-Path $PSScriptRoot "claude-direction.test.js")
Assert-True ($LASTEXITCODE -eq 0) "Claude direction behavior tests failed"
& node.exe --check (Join-Path $repoRoot "src\gpt\gpt-rtl-cdp.js")
Assert-True ($LASTEXITCODE -eq 0) "GPT injector has JavaScript syntax errors"

Write-Host "Rightly static verification passed." -ForegroundColor Green
