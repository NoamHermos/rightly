<#
.SYNOPSIS
Installs the Rightly launcher for the official GPT Work / Codex application.

.DESCRIPTION
GPT is always corrected at launch through Rightly GPT.exe and a short-lived,
loopback-only DevTools connection. The Microsoft Store package and app.asar are
never modified. The launcher discovers the newest installed OpenAI.Codex
package every time it runs, so a Store update does not invalidate its path.
#>

[CmdletBinding()]
param(
    [switch] $Install,
    [switch] $Uninstall,
    [switch] $Status,
    [switch] $Launch,
    [switch] $NoLaunch,
    [switch] $Elevated
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$Script:ModuleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script:ProjectRoot = Split-Path -Parent (Split-Path -Parent $Script:ModuleRoot)
$Script:PayloadPath = Join-Path $Script:ModuleRoot "codex-rtl-payload.js"
$Script:InjectorPath = Join-Path $Script:ModuleRoot "gpt-rtl-cdp.js"
$Script:PowerShellLauncherPath = Join-Path $Script:ModuleRoot "launch-gpt.ps1"
$Script:LauncherSourcePath = Join-Path $Script:ModuleRoot "Rightly.Gpt.Launcher.cs"
$Script:LauncherModulePath = Join-Path $Script:ModuleRoot "lib\Rightly.GptLauncher.ps1"
$Script:LauncherIconPath = Join-Path $Script:ProjectRoot "assets\rightly-gpt.ico"

$Script:RuntimeDir = Join-Path $env:LOCALAPPDATA "Programs\Rightly\GPT"
$Script:RuntimeExe = Join-Path $Script:RuntimeDir "Rightly GPT.exe"
$Script:RuntimeIcon = Join-Path $Script:RuntimeDir "Rightly GPT.ico"
$Script:RuntimeState = Join-Path $Script:RuntimeDir "state.json"
$Script:RuntimeFileNames = @(
    "codex-rtl-payload.js",
    "gpt-rtl-cdp.js",
    "launch-gpt.ps1"
)

# Releases before the launcher-only design could modify app.asar. These paths
# exist only for a one-time, hash-verified migration back to the official file.
$Script:LegacyPersistentRoot = Join-Path $env:ProgramData "Rightly\GPT"
$Script:LegacyPersistentState = Join-Path $Script:LegacyPersistentRoot "state.json"
$Script:LegacyPersistentBackup = Join-Path $Script:LegacyPersistentRoot "backup\app.asar"
$Script:LegacyCopyDirs = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Codex-RT-AI"),
    (Join-Path $env:LOCALAPPDATA "Programs\Codex-RT-AI-patcher"),
    (Join-Path $env:LOCALAPPDATA "Programs\Rightly-GPT-Embedded")
)
$Script:LegacyStateDirs = @(
    (Join-Path $env:ProgramData "GptwRtlPatch"),
    (Join-Path $env:ProgramData "CodexRtAi")
)
$Script:LegacyTaskNames = @("Codex RT-AI RTL Auto-Update")
$Script:LegacyModificationNames = @(
    "RT.AI.Codex.RTL.Modification",
    "OpenAI.Codex.RtAiRtl"
)

if (-not (Test-Path -LiteralPath $Script:LauncherModulePath -PathType Leaf)) {
    throw "GPT launcher helper is missing: $($Script:LauncherModulePath)"
}
. $Script:LauncherModulePath

function Write-Step { param([string] $Message); Write-Host ""; Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok { param([string] $Message); Write-Host "  [+] $Message" -ForegroundColor Green }
function Write-Info { param([string] $Message); Write-Host "  [*] $Message" -ForegroundColor DarkGray }
function Write-Warn { param([string] $Message); Write-Host "  [!] $Message" -ForegroundColor Yellow }

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal] $identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

function Get-OfficialCodexPackage {
    $package = Get-AppxPackage -Name "OpenAI.Codex" -ErrorAction SilentlyContinue |
        Sort-Object Version -Descending | Select-Object -First 1
    if (-not $package) { throw "The official GPT Work / Codex app is not installed." }

    $appDir = Join-Path $package.InstallLocation "app"
    $exe = Join-Path $appDir "ChatGPT.exe"
    $asar = Join-Path $appDir "resources\app.asar"
    foreach ($path in @($exe, $asar)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Official GPT file is missing: $path"
        }
    }

    return [pscustomobject]@{
        PackageFullName = [string] $package.PackageFullName
        Version = [string] $package.Version
        AppDir = [System.IO.Path]::GetFullPath($appDir)
        Exe = [System.IO.Path]::GetFullPath($exe)
        Asar = [System.IO.Path]::GetFullPath($asar)
    }
}

function Get-Sha256 {
    param([Parameter(Mandatory)][string] $Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-ExactPath {
    param([Parameter(Mandatory)][string] $Actual, [Parameter(Mandatory)][string] $Expected)
    $actualFull = [System.IO.Path]::GetFullPath($Actual).TrimEnd('\')
    $expectedFull = [System.IO.Path]::GetFullPath($Expected).TrimEnd('\')
    if (-not $actualFull.Equals($expectedFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to manage an unexpected path: $actualFull"
    }
    return $actualFull
}

function Remove-ExactDirectory {
    param([Parameter(Mandatory)][string] $Path, [Parameter(Mandatory)][string] $Expected)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $verified = Assert-ExactPath -Actual $Path -Expected $Expected
    Remove-Item -LiteralPath $verified -Recurse -Force
}

function Read-LegacyPersistentState {
    if (-not (Test-Path -LiteralPath $Script:LegacyPersistentState -PathType Leaf)) { return $null }
    try { return Get-Content -LiteralPath $Script:LegacyPersistentState -Raw | ConvertFrom-Json }
    catch { throw "The legacy GPT rollback state is invalid. It was left untouched at $($Script:LegacyPersistentState)" }
}

function Invoke-ElevatedLegacyMigrationIfNeeded {
    param([ValidateSet("Install", "Uninstall")][string] $Action)
    if (-not (Test-Path -LiteralPath $Script:LegacyPersistentState -PathType Leaf)) { return $false }
    if (Test-IsAdministrator) { return $false }
    if ($Elevated) { throw "Administrator rights were requested but were not granted." }

    Write-Step "Requesting administrator rights for one-time legacy ASAR restoration"
    $powershell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -$Action -Elevated -NoLaunch"
    $process = Start-Process -FilePath $powershell -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "The legacy GPT migration exited with code $($process.ExitCode)."
    }
    return $true
}

function Restore-LegacyPersistentPatch {
    param([pscustomobject] $Official)
    $state = Read-LegacyPersistentState
    if (-not $state) { return }
    if ([string] $state.architecture -ne "official-in-place-asar") {
        throw "Unexpected legacy GPT state architecture. It was left untouched for safety."
    }

    # A Store update creates a new versioned package directory. Its ASAR is
    # already official, so an old package backup must never be copied into it.
    if ([string] $state.packageFullName -ne $Official.PackageFullName) {
        Remove-ExactDirectory -Path $Script:LegacyPersistentRoot -Expected $Script:LegacyPersistentRoot
        Write-Info "Removed obsolete ASAR state from an older GPT package version."
        return
    }

    if (-not (Test-IsAdministrator)) {
        throw "Administrator rights are required to restore the legacy GPT ASAR."
    }
    $recordedAsar = Assert-ExactPath -Actual ([string] $state.asarPath) -Expected $Official.Asar
    $recordedBackup = Assert-ExactPath -Actual ([string] $state.backupPath) -Expected $Script:LegacyPersistentBackup
    if (-not (Test-Path -LiteralPath $recordedBackup -PathType Leaf)) {
        throw "The legacy GPT rollback backup is missing. The state was preserved for manual recovery."
    }
    if ((Get-Sha256 $recordedBackup) -ne [string] $state.originalHash) {
        throw "The legacy GPT rollback backup failed SHA-256 verification. Nothing was changed."
    }

    $currentHash = Get-Sha256 $recordedAsar
    if ($currentHash -eq [string] $state.patchedHash) {
        [System.IO.File]::Copy($recordedBackup, $recordedAsar, $true)
        if ((Get-Sha256 $recordedAsar) -ne [string] $state.originalHash) {
            throw "The original GPT ASAR could not be verified after restoration."
        }
        Write-Ok "Restored the verified official ASAR from the previous Rightly release."
    } elseif ($currentHash -ne [string] $state.originalHash) {
        throw "The legacy GPT ASAR no longer matches its recorded original or patched hash. Nothing was changed."
    }

    Remove-ExactDirectory -Path $Script:LegacyPersistentRoot -Expected $Script:LegacyPersistentRoot
}

function Remove-LegacyArtifacts {
    foreach ($taskName in $Script:LegacyTaskNames) {
        if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
            $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
            if ($task) {
                Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
                Write-Info "Removed legacy automatic task: $taskName"
            }
        }
    }
    foreach ($name in $Script:LegacyModificationNames) {
        foreach ($package in @(Get-AppxPackage -Name $name -PackageTypeFilter Optional -ErrorAction SilentlyContinue)) {
            Remove-AppxPackage -Package $package.PackageFullName -ErrorAction SilentlyContinue
            Write-Info "Removed obsolete GPT modification package: $($package.PackageFullName)"
        }
    }
    foreach ($path in $Script:LegacyCopyDirs) {
        Remove-ExactDirectory -Path $path -Expected $path
    }
    foreach ($path in $Script:LegacyStateDirs) {
        Remove-ExactDirectory -Path $path -Expected $path
    }
    foreach ($folder in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"))) {
        foreach ($name in @("Codex RT-AI.lnk", "Codex RTL.lnk")) {
            Remove-Item -LiteralPath (Join-Path $folder $name) -Force -ErrorAction SilentlyContinue
        }
    }
}

function Copy-RuntimeFile {
    param([Parameter(Mandatory)][string] $Name)
    $source = Join-Path $Script:ModuleRoot $Name
    $destination = Join-Path $Script:RuntimeDir $Name
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Rightly runtime source file is missing: $source"
    }
    Copy-Item -LiteralPath $source -Destination $destination -Force
}

function Remove-ObsoleteRuntimeFiles {
    $allowedNames = @($Script:RuntimeFileNames) + @("Rightly GPT.exe", "Rightly GPT.ico", "state.json", "logs")
    foreach ($item in @(Get-ChildItem -LiteralPath $Script:RuntimeDir -Force -ErrorAction SilentlyContinue)) {
        if ($item.Name -notin $allowedNames) {
            Remove-Item -LiteralPath $item.FullName -Recurse -Force
        }
    }
}

function Install-LauncherOnlyRuntime {
    if (Invoke-ElevatedLegacyMigrationIfNeeded "Install") { return }
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
        throw "Node.js LTS is required to run Rightly GPT."
    }

    $official = Get-OfficialCodexPackage
    Restore-LegacyPersistentPatch $official
    Remove-LegacyArtifacts

    Write-Step "Installing the standalone Rightly GPT launcher"
    New-Item -ItemType Directory -Path $Script:RuntimeDir -Force | Out-Null
    foreach ($name in $Script:RuntimeFileNames) { Copy-RuntimeFile $name }
    Copy-Item -LiteralPath $Script:LauncherIconPath -Destination $Script:RuntimeIcon -Force
    [void] (New-RightlyGptLauncher -SourcePath $Script:LauncherSourcePath `
        -DestinationPath $Script:RuntimeExe -IconPath $Script:RuntimeIcon)

    [ordered]@{
        architecture = "launcher-only-loopback-runtime"
        officialPackageFullName = $official.PackageFullName
        officialPackageVersion = $official.Version
        payloadHash = Get-Sha256 (Join-Path $Script:RuntimeDir "codex-rtl-payload.js")
        injectorHash = Get-Sha256 (Join-Path $Script:RuntimeDir "gpt-rtl-cdp.js")
        launcherHash = Get-Sha256 $Script:RuntimeExe
        installedAt = (Get-Date).ToString("o")
        officialPackageModified = $false
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Script:RuntimeState -Encoding UTF8

    Remove-ObsoleteRuntimeFiles
    foreach ($shortcutPath in @(New-RightlyGptShortcuts -LauncherPath $Script:RuntimeExe `
        -WorkingDirectory $Script:RuntimeDir -IconPath $Script:RuntimeIcon)) {
        Write-Ok "Created or refreshed shortcut: $shortcutPath"
    }
    Write-Ok "Rightly GPT is installed. The official Store package was not modified."

    if ($NoLaunch) { Write-Info "Launch deferred to the unified installer." }
    else { Start-InstalledRightlyGpt }
}

function Remove-RightlyGptShortcuts {
    $shell = New-Object -ComObject WScript.Shell
    $paths = @(
        (Join-Path ([Environment]::GetFolderPath("Desktop")) "Rightly GPT.lnk"),
        (Join-Path (Join-Path ([Environment]::GetFolderPath("Programs")) "Rightly") "Rightly GPT.lnk")
    )
    $taskbarDir = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
    foreach ($item in @(Get-ChildItem -LiteralPath $taskbarDir -Filter "*.lnk" -ErrorAction SilentlyContinue)) {
        try {
            $shortcut = $shell.CreateShortcut($item.FullName)
            if ($shortcut.TargetPath -and [System.IO.Path]::GetFullPath($shortcut.TargetPath).Equals(
                    [System.IO.Path]::GetFullPath($Script:RuntimeExe),
                    [System.StringComparison]::OrdinalIgnoreCase)) {
                $paths += $item.FullName
            }
        } catch { }
    }
    foreach ($path in @($paths | Select-Object -Unique)) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
}

function Uninstall-LauncherOnlyRuntime {
    if (Invoke-ElevatedLegacyMigrationIfNeeded "Uninstall") { return }
    $official = Get-OfficialCodexPackage
    Restore-LegacyPersistentPatch $official

    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf(
            $Script:RuntimeDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Remove-RightlyGptShortcuts
    Remove-ExactDirectory -Path $Script:RuntimeDir -Expected $Script:RuntimeDir
    Remove-LegacyArtifacts
    Write-Ok "Rightly GPT was removed. The official GPT package was not changed."
}

function Start-InstalledRightlyGpt {
    if (-not (Test-Path -LiteralPath $Script:RuntimeExe -PathType Leaf)) {
        throw "Rightly GPT is not installed. Run Repair RTL and select GPT first."
    }
    $process = Start-Process -FilePath $Script:RuntimeExe -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        $log = Join-Path $Script:RuntimeDir "logs\gpt-runtime.log"
        throw "GPT opened without a verified Rightly payload. See $log"
    }
    Write-Ok "GPT Work / Codex opened with a verified Rightly payload."
}

function Show-LauncherOnlyStatus {
    $official = Get-OfficialCodexPackage
    Write-Host ""
    Write-Host "Rightly for GPT Work / Codex - Status" -ForegroundColor Cyan
    Write-Info "Current official package: $($official.PackageFullName)"
    if (-not (Test-Path -LiteralPath $Script:RuntimeState -PathType Leaf)) {
        Write-Warn "Rightly GPT is not installed."
        return
    }

    $state = Get-Content -LiteralPath $Script:RuntimeState -Raw | ConvertFrom-Json
    if ([string] $state.architecture -ne "launcher-only-loopback-runtime") {
        Write-Warn "The installed GPT runtime uses an obsolete architecture. Run Repair RTL."
        return
    }
    foreach ($name in @($Script:RuntimeFileNames + @("Rightly GPT.exe", "Rightly GPT.ico"))) {
        if (-not (Test-Path -LiteralPath (Join-Path $Script:RuntimeDir $name) -PathType Leaf)) {
            Write-Warn "Runtime file is missing: $name"
            return
        }
    }
    if ((Get-Sha256 (Join-Path $Script:RuntimeDir "codex-rtl-payload.js")) -ne [string] $state.payloadHash) {
        Write-Warn "The installed RTL payload failed SHA-256 verification. Run Repair RTL."
        return
    }

    Write-Ok "Launcher-only Rightly GPT is installed and verified."
    Write-Info "The official app.asar is not modified by this release."
    if ([string] $state.officialPackageFullName -ne $official.PackageFullName) {
        Write-Warn "GPT was updated since Rightly was installed. The launcher will locate the new package automatically, but Repair RTL is recommended to refresh compatibility."
    }
}

$actions = @()
if ($Install) { $actions += "Install" }
if ($Uninstall) { $actions += "Uninstall" }
if ($Status) { $actions += "Status" }
if ($Launch) { $actions += "Launch" }
if ($actions.Count -eq 0) { $Install = $true; $actions = @("Install") }
if ($actions.Count -gt 1) { throw "Choose only one action: -Install, -Uninstall, -Status, or -Launch." }

if ($Install) { Install-LauncherOnlyRuntime }
elseif ($Uninstall) { Uninstall-LauncherOnlyRuntime }
elseif ($Status) { Show-LauncherOnlyStatus }
elseif ($Launch) { Start-InstalledRightlyGpt }
