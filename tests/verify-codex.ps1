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
    AsarModule = Join-Path $repoRoot "src\gpt\lib\Rightly.GptAsar.ps1"
    Installer = Join-Path $repoRoot "installer\install.ps1"
    InstallerModule = Join-Path $repoRoot "installer\lib\Rightly.Install.ps1"
    Repair = Join-Path $repoRoot "installer\run-repair.ps1"
}

foreach ($path in $paths.Values) {
    Assert-True (Test-Path -LiteralPath $path -PathType Leaf) "Required GPT file is missing: $path"
}
foreach ($path in @($paths.Patcher, $paths.RuntimeLauncher, $paths.AsarModule, $paths.Installer, $paths.InstallerModule, $paths.Repair)) {
    $tokens = $null
    $errors = $null
    [void] [System.Management.Automation.Language.Parser]::ParseFile($path, [ref] $tokens, [ref] $errors)
    Assert-True (-not $errors) "$path has PowerShell syntax errors: $errors"
}

$patcher = Get-Content -LiteralPath $paths.Patcher -Raw
$payload = Get-Content -LiteralPath $paths.Payload -Raw
$asarModule = Get-Content -LiteralPath $paths.AsarModule -Raw
$installer = Get-Content -LiteralPath $paths.Installer -Raw
$installerModule = Get-Content -LiteralPath $paths.InstallerModule -Raw
$repair = Get-Content -LiteralPath $paths.Repair -Raw

# GPT prefers a version-bound in-place patch and safely falls back at launch.
Assert-True ($patcher.Contains('Get-AppxPackage -Name "OpenAI.Codex"')) "Official GPT package discovery is missing"
Assert-True ($patcher.Contains('architecture = "official-in-place-asar"')) "Persistent GPT architecture is missing"
Assert-True ($patcher.Contains('New-RightlyGptAsar')) "Shared ASAR builder is not used"
Assert-True ($patcher.Contains('Grant-AsarWriteAccess')) "Official ASAR write preparation is missing"
Assert-True ($patcher.Contains('originalHash')) "Original ASAR hash metadata is missing"
Assert-True ($patcher.Contains('patchedHash')) "Patched ASAR hash metadata is missing"
Assert-True ($patcher.Contains('rollback backup failed SHA-256 verification')) "Rollback hash validation is missing"
Assert-True ($patcher.Contains('return $Official.Asar')) "GPT builds must use the official ASAR beside app.asar.unpacked"
Assert-True (-not $patcher.Contains('return $backup')) "GPT must not build from the detached rollback ASAR"
Assert-True ($patcher.Contains('Copy-VerifiedAsar -Source $Script:BackupPath')) "Failed installs do not restore the managed backup"
Assert-True ($patcher.Contains('Assert-AsarCanBeReplaced')) "GPT ASAR replacement preflight is missing"
Assert-True ($patcher.Contains('The official GPT/Codex app is already closed.')) "An already-closed GPT app is not handled as success"
Assert-True ($patcher.Contains('Stop-ProcessTree')) "Official Codex child process trees are not force-closed"
Assert-True ($patcher.Contains('Invoke-NativeUtility')) "Native process failures are not handled by exit code"
Assert-True ($patcher.Contains('AddSeconds(10)')) "GPT ASAR handle-release polling is missing"
Assert-True ($patcher.Contains('take ownership of the official GPT resources folder')) "WindowsApps parent permissions are not prepared"
Assert-True ($patcher.Contains('WindowsIdentity]::GetCurrent().User.Value')) "The elevated repair user is not granted explicit ASAR access"
Assert-True ($patcher.Contains('"-R", "-S", "-H"')) "The read-only WindowsApps ASAR attribute is not cleared before writing"
Assert-True ($patcher.Contains('/inheritance:r')) "An inherited deny ACE on the official ASAR is not detached"
Assert-True ($patcher.Contains('/remove:d')) "Explicit deny ACEs on the official ASAR are not removed"
Assert-True ($patcher.Contains('*S-1-15-2-1:(RX)')) "The packaged app loses read access to the ASAR after the grant"
Assert-True ($patcher.Contains('Copy-AsarWithBackupMode')) "Access-denied ASAR replacement has no backup-mode fallback"
Assert-True ($patcher.Contains('robocopy.exe')) "Windows backup-mode copy utility is missing"
Assert-True ($patcher.Contains('$exitCode -ge 8')) "Robocopy failure exit codes are not handled"
Assert-True ($patcher.Contains('return "Backup"')) "The replacement preflight does not distinguish permission state from a live lock"
Assert-True (-not $patcher.Contains('Set-AsarByRename')) "The invalid WindowsApps rename fallback is still active"
Assert-True ($patcher.Contains('Test-IsAccessDeniedException')) "A wrapped access-denied exception is not unwrapped before backup mode"
Assert-True ($patcher.Contains('Write-AsarAccessDiagnostics')) "ASAR permission diagnostics are not logged"
Assert-True ($patcher.Contains('resources folder before grant')) "The resources folder ACL is not diagnosed before permission changes"
Assert-True ($patcher.Contains('resources folder after grant')) "The resources folder ACL is not diagnosed after permission changes"
Assert-True ($patcher.Contains('Remove-LegacyRuntime')) "Legacy runtime cleanup is missing"
Assert-True ($patcher.Contains('Remove-LegacyModificationPackage')) "Legacy overlay cleanup is missing"
Assert-True ($patcher.Contains('Remove-LegacyCopiedApps')) "Legacy copied-app cleanup is missing"
Assert-True (-not $patcher.Contains('Register-ScheduledTask')) "GPT must not install automatic background repair"
Assert-True ($patcher.Contains('architecture = "loopback-cdp-runtime"')) "Protected-package runtime fallback is missing"
Assert-True ($patcher.Contains('Deploy-RightlyRuntimeFallback')) "Unsupported ASAR replacement does not deploy the runtime fallback"
Assert-True ($patcher.Contains('Test-IsUnsupportedAsarReplacement')) "ASAR replacement failures are not scoped before fallback"
Assert-True ($patcher.Contains('Windows protected this Codex package')) "Protected-package fallback is not explained"

Assert-True ($asarModule.Contains('@electron/asar')) "Electron ASAR tooling is missing"
Assert-True ($asarModule.Contains('webview\assets\app-main-*.js')) "GPT renderer entry discovery is missing"
Assert-True ($asarModule.Contains('The source ASAR already contains a Rightly marker')) "Double-patch protection is missing"
Assert-True ($asarModule.Contains('50MB')) "Truncated ASAR protection is missing"

# Renderer rules cover mixed RTL text while preserving app chrome and code.
Assert-True ($payload.Contains('RT-AI CODEX RTL PATCH START')) "RTL payload marker is missing"
Assert-True ($payload.Contains('__RT_AI_CODEX_RTL_PATCH__')) "RTL payload is not idempotent"
Assert-True ($payload.Contains('requestIdleCallback')) "Long-chat work is not deferred"
Assert-True ($payload.Contains('PROCESS_BATCH_SIZE = 3')) "Long-chat processing is not bounded"
Assert-True ($payload.Contains('enqueueWorkInSubtree')) "Mutations still trigger broad page rescans"
Assert-True ($payload.Contains('processTables')) "RTL table handling is missing"
Assert-True ($payload.Contains('list-style-position:outside!important')) "RTL list handling is missing"
Assert-True ($payload.Contains('aside [data-thread-title=\"true\"]')) "Sidebar title targeting is missing"
Assert-True ($payload.Contains('SIDEBAR_RTL_MARK = "\u200f"')) "Invisible RTL sidebar mark is missing"
Assert-True ($payload.Contains('el.style.textAlign = "left"')) "Sidebar titles are not kept left-aligned"

# The repair bundle carries both verified installation modes.
Assert-True ($installer.Contains('lib\Rightly.Install.ps1')) "Installer does not load the shared module"
Assert-True ($installerModule.Contains('"src\gpt\lib\Rightly.GptAsar.ps1"')) "Repair bundle omits the ASAR helper"
Assert-True (([regex]::Matches($installerModule, 'src\\gpt\\gpt-rtl-cdp\.js')).Count -eq 1) "Repair bundle must include the runtime injector once"
Assert-True (([regex]::Matches($installerModule, 'src\\gpt\\launch-gpt\.ps1')).Count -eq 1) "Repair bundle must include the runtime launcher once"
Assert-True ($installerModule.Contains('"assets\rightly.ico"')) "Repair bundle omits the Rightly icon"
Assert-True ($installerModule.Contains('"Repair RTL.lnk"')) "Interactive repair shortcut is missing"
Assert-True ($repair.Contains('persistent ASAR patch or its protected-package launch-time payload')) "Repair success text is stale"

if (-not $SkipInstalledBuild) {
    $package = Get-AppxPackage -Name "OpenAI.Codex" -ErrorAction SilentlyContinue |
        Sort-Object Version -Descending | Select-Object -First 1
    Assert-True ($null -ne $package) "The official GPT Work / Codex package is not installed"
    Assert-True ($package.Status -eq "Ok") "The official GPT Work / Codex package is not healthy"

    $asarPath = Join-Path $package.InstallLocation "app\resources\app.asar"
    $persistentStatePath = Join-Path $env:ProgramData "Rightly\GPT\state.json"
    $runtimeRoot = Join-Path $env:LOCALAPPDATA "Programs\Rightly\GPT"
    $runtimeStatePath = Join-Path $runtimeRoot "state.json"
    if (Test-Path -LiteralPath $persistentStatePath -PathType Leaf) {
        $state = Get-Content -LiteralPath $persistentStatePath -Raw | ConvertFrom-Json
        Assert-True ($state.architecture -eq "official-in-place-asar") "Installed GPT state describes the wrong architecture"
        Assert-True ($state.packageFullName -eq $package.PackageFullName) "Installed GPT state belongs to another package version"
        Assert-True (Test-Path -LiteralPath $state.backupPath -PathType Leaf) "GPT rollback backup is missing"
        $originalHash = (Get-FileHash -LiteralPath $state.backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $installedHash = (Get-FileHash -LiteralPath $asarPath -Algorithm SHA256).Hash.ToLowerInvariant()
        Assert-True ($originalHash -eq $state.originalHash) "GPT rollback backup hash does not match state"
        Assert-True ($installedHash -eq $state.patchedHash) "Official GPT ASAR is not the verified Rightly build"
        Assert-True ($installedHash -ne $originalHash) "Official and rollback ASAR hashes must differ"
        Write-Host "Installed persistent GPT patch verified." -ForegroundColor Green
    } else {
        Assert-True (Test-Path -LiteralPath $runtimeStatePath -PathType Leaf) "Neither GPT installation mode is installed"
        $state = Get-Content -LiteralPath $runtimeStatePath -Raw | ConvertFrom-Json
        Assert-True ($state.architecture -eq "loopback-cdp-runtime") "Installed GPT fallback state describes the wrong architecture"
        Assert-True ($state.officialPackageFullName -eq $package.PackageFullName) "GPT runtime belongs to another package version"
        foreach ($name in @("codex-rtl-payload.js", "gpt-rtl-cdp.js", "launch-gpt.ps1")) {
            Assert-True (Test-Path -LiteralPath (Join-Path $runtimeRoot $name) -PathType Leaf) "GPT runtime file is missing: $name"
        }
        $payloadHash = (Get-FileHash -LiteralPath (Join-Path $runtimeRoot "codex-rtl-payload.js") -Algorithm SHA256).Hash.ToLowerInvariant()
        Assert-True ($payloadHash -eq $state.payloadHash) "Installed GPT runtime payload hash does not match state"
        Write-Host "Installed launch-time GPT fallback verified." -ForegroundColor Green
    }

    $automaticTask = Get-ScheduledTask -TaskName "Codex RT-AI RTL Auto-Update" -ErrorAction SilentlyContinue
    Assert-True (-not $automaticTask) "A legacy automatic GPT RTL task is still installed"
}

Write-Host "Rightly GPT verification passed." -ForegroundColor Green
