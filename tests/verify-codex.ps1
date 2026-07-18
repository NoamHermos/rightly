[CmdletBinding()]
param([switch] $SkipInstalledBuild)

$ErrorActionPreference = "Stop"

function Assert-True {
    param([bool] $Condition, [string] $Message)
    if (-not $Condition) { throw $Message }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$paths = @{
    Patcher = Join-Path $repoRoot "src\gpt\patch.ps1"
    Payload = Join-Path $repoRoot "src\gpt\codex-rtl-payload.js"
    Injector = Join-Path $repoRoot "src\gpt\gpt-rtl-cdp.js"
    RuntimeLauncher = Join-Path $repoRoot "src\gpt\launch-gpt.ps1"
    LauncherSource = Join-Path $repoRoot "src\gpt\Rightly.Gpt.Launcher.cs"
    LauncherModule = Join-Path $repoRoot "src\gpt\lib\Rightly.GptLauncher.ps1"
    Installer = Join-Path $repoRoot "installer\install.ps1"
    InstallerModule = Join-Path $repoRoot "installer\lib\Rightly.Install.ps1"
    Repair = Join-Path $repoRoot "installer\run-repair.ps1"
}

foreach ($path in $paths.Values) {
    Assert-True (Test-Path -LiteralPath $path -PathType Leaf) "Required GPT file is missing: $path"
}
foreach ($path in @($paths.Patcher, $paths.RuntimeLauncher, $paths.LauncherModule, $paths.Installer, $paths.InstallerModule, $paths.Repair)) {
    $tokens = $null
    $errors = $null
    [void] [System.Management.Automation.Language.Parser]::ParseFile($path, [ref] $tokens, [ref] $errors)
    Assert-True (-not $errors) "$path has PowerShell syntax errors: $errors"
}

$patcher = Get-Content -LiteralPath $paths.Patcher -Raw
$payload = Get-Content -LiteralPath $paths.Payload -Raw
$injector = Get-Content -LiteralPath $paths.Injector -Raw
$runtimeLauncher = Get-Content -LiteralPath $paths.RuntimeLauncher -Raw
$launcherModule = Get-Content -LiteralPath $paths.LauncherModule -Raw
$nativeLauncher = Get-Content -LiteralPath $paths.LauncherSource -Raw
$installerModule = Get-Content -LiteralPath $paths.InstallerModule -Raw

# GPT has one supported architecture: a dedicated launcher outside WindowsApps.
Assert-True ($patcher.Contains('architecture = "launcher-only-loopback-runtime"')) "Launcher-only GPT architecture is missing"
Assert-True ($patcher.Contains('Get-AppxPackage -Name "OpenAI.Codex"')) "Latest official GPT package discovery is missing"
Assert-True ($patcher.Contains('officialPackageModified = $false')) "GPT state does not explicitly record that the package is untouched"
Assert-True ($patcher.Contains('Start-Process -FilePath $Script:RuntimeExe -Wait -PassThru')) "The GPT action does not run the dedicated executable"
Assert-True ($patcher.Contains('Restore-LegacyPersistentPatch')) "Safe migration from old ASAR releases is missing"
Assert-True ($patcher.Contains('packageFullName -ne $Official.PackageFullName')) "Legacy state is not isolated by package version"
Assert-True ($patcher.Contains('rollback backup failed SHA-256 verification')) "Legacy rollback verification is missing"
Assert-True (-not $patcher.Contains('New-RightlyGptAsar')) "ASAR rebuilding is still active"
Assert-True (-not $patcher.Contains('Grant-AsarWriteAccess')) "WindowsApps ACL modification is still active"
Assert-True (-not $patcher.Contains('takeown.exe')) "GPT still attempts WindowsApps ownership changes"
Assert-True (-not $patcher.Contains('robocopy.exe')) "GPT still attempts backup-mode ASAR replacement"
Assert-True (-not $patcher.Contains('npx.cmd')) "GPT installation still depends on ASAR build tooling"
Assert-True (-not (Test-Path -LiteralPath (Join-Path $repoRoot "src\gpt\lib\Rightly.GptAsar.ps1"))) "Obsolete GPT ASAR helper still exists"
Assert-True (-not $patcher.Contains('Register-ScheduledTask')) "GPT must not install automatic background repair"

# Runtime behavior verifies a live payload and handles every official app state.
Assert-True ($runtimeLauncher.Contains('Test-RunningRightlyPayload')) "Rightly GPT does not verify an existing app"
Assert-True ($runtimeLauncher.Contains('already open with a verified Rightly payload; leaving it running')) "Verified GPT instances are not preserved"
Assert-True ($runtimeLauncher.Contains('open without a verified Rightly payload; restarting it')) "Uncorrected GPT instances are not restarted"
Assert-True ($runtimeLauncher.Contains('Test-RunningRightlyHost')) "A background-only Rightly host cannot be identified"
Assert-True ($runtimeLauncher.Contains('Test-OfficialCodexHasVisibleWindow')) "A tray-only GPT process cannot be distinguished from a visible window"
Assert-True ($runtimeLauncher.Contains('Start-PackagedCodex -AppUserModelId $official.AppUserModelId -Arguments ""')) "Tray-only GPT is not reactivated through its package identity"
Assert-True ($runtimeLauncher.Contains('Start-Injector $port')) "A new renderer cannot receive the Rightly payload"
Assert-True ($runtimeLauncher.Contains('Set-RightlyStatus')) "The GPT runtime does not report progress"
Assert-True ($runtimeLauncher.Contains('SW_RESTORE = 9')) "A minimized GPT window is not restored"
Assert-True ($runtimeLauncher.Contains('SetForegroundWindow')) "A corrected GPT window is not focused"
Assert-True ($injector.Contains('verifyRunningInstance')) "The injector has no marker-only verification mode"
Assert-True ($injector.Contains('hasRightlyMarker')) "The injector does not inspect the renderer marker"

# The native EXE supplies the GUI, icon, and duplicate-launch protection.
Assert-True ($patcher.Contains('New-RightlyGptLauncher')) "The native launcher is not built during installation"
Assert-True ($patcher.Contains('New-RightlyGptShortcuts')) "Managed GPT shortcuts are not created"
Assert-True ($launcherModule.Contains('$shortcut.TargetPath = $LauncherPath')) "Rightly GPT shortcuts do not target the native executable"
Assert-True ($launcherModule.Contains('$shortcut.IconLocation = "$IconPath,0"')) "Rightly GPT shortcuts do not use the branded icon"
Assert-True ($launcherModule.Contains('User Pinned\TaskBar')) "Existing taskbar pins are not refreshed"
Assert-True ($nativeLauncher.Contains('MutexName')) "The launcher has no single-instance lock"
Assert-True ($nativeLauncher.Contains('Rightly GPT is already starting')) "Duplicate launches have no user message"
Assert-True ($nativeLauncher.Contains('class StatusWindow')) "The launcher has no native status window"
Assert-True ($nativeLauncher.Contains('BackgroundWorker')) "The launcher can block its GUI thread"

# GPT-only installation remains unelevated; Claude keeps its administrator flow.
Assert-True ($installerModule.Contains('if ($Target -eq "GptWork") { return $false }')) "GPT-only installation still requests elevation"

# Direction behavior remains independent of the installation method.
Assert-True ($payload.Contains('hasHebrew')) "Hebrew-anywhere detection is missing"
Assert-True ($payload.Contains('APP_CHROME_SEL')) "Application chrome exclusion is missing"
Assert-True ($payload.Contains('processTables')) "RTL table processing is missing"
Assert-True ($payload.Contains('list-style-position:outside!important')) "RTL list styling is missing"
Assert-True ($payload.Contains('requestIdleCallback')) "Long-chat work is not idle-scheduled"
Assert-True ($payload.Contains('PROCESS_BATCH_SIZE = 3')) "Long-chat processing is not bounded"
Assert-True ($payload.Contains('normalizeSidebarTitleText')) "Mixed Hebrew sidebar title handling is missing"

& node.exe --check $paths.Injector
Assert-True ($LASTEXITCODE -eq 0) "GPT injector has JavaScript syntax errors"
& node.exe (Join-Path $PSScriptRoot "direction.test.js")
Assert-True ($LASTEXITCODE -eq 0) "GPT direction behavior tests failed"

# Compile the launcher exactly as installation does, without opening GPT.
$sandbox = Join-Path ([System.IO.Path]::GetTempPath()) ("rightly-gpt-launcher-test-" + [guid]::NewGuid().ToString("N"))
try {
    New-Item -ItemType Directory -Path $sandbox | Out-Null
    . $paths.LauncherModule
    $testExe = Join-Path $sandbox "Rightly GPT.exe"
    [void] (New-RightlyGptLauncher -SourcePath $paths.LauncherSource -DestinationPath $testExe `
        -IconPath (Join-Path $repoRoot "assets\rightly-gpt.ico"))
    Assert-True ((Get-Item -LiteralPath $testExe).Length -gt 4096) "Compiled GPT launcher is invalid"
} finally {
    Remove-Item -LiteralPath $sandbox -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not $SkipInstalledBuild) {
    $runtimeRoot = Join-Path $env:LOCALAPPDATA "Programs\Rightly\GPT"
    $statePath = Join-Path $runtimeRoot "state.json"
    Assert-True (Test-Path -LiteralPath $statePath -PathType Leaf) "Rightly GPT is not installed"
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    Assert-True ($state.architecture -eq "launcher-only-loopback-runtime") "Installed GPT state uses an obsolete architecture"
    Assert-True (-not $state.officialPackageModified) "Installed state incorrectly claims that GPT was modified"
    foreach ($name in @("codex-rtl-payload.js", "gpt-rtl-cdp.js", "launch-gpt.ps1", "Rightly GPT.exe", "Rightly GPT.ico")) {
        Assert-True (Test-Path -LiteralPath (Join-Path $runtimeRoot $name) -PathType Leaf) "Installed GPT runtime file is missing: $name"
    }
    $payloadHash = (Get-FileHash -LiteralPath (Join-Path $runtimeRoot "codex-rtl-payload.js") -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-True ($payloadHash -eq $state.payloadHash) "Installed GPT payload hash does not match state"
}

Write-Host "Rightly GPT launcher-only verification passed." -ForegroundColor Green
