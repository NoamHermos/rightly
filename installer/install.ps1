<#
.SYNOPSIS
Installs or repairs Rightly for GPT Work / Codex, Claude, or ChatGPT in Chrome.

.DESCRIPTION
The entry point intentionally contains only orchestration. Shared installer
plumbing lives in lib\Rightly.Install.ps1; each app keeps its own patcher.
#>

[CmdletBinding()]
param(
    [ValidateSet("Prompt", "GptWork", "ClaudeCode", "Both", "ChromeExtension")]
    [string] $Target = "Prompt",
    [switch] $NoLaunch,
    [switch] $RepairMode,
    [switch] $Elevated
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $PSScriptRoot "lib\Rightly.Install.ps1"
if (-not (Test-Path -LiteralPath $modulePath)) { throw "Installer module is missing: $modulePath" }
. $modulePath
Initialize-RightlyInstaller -Root $projectRoot

$gptPatcher = Join-Path $projectRoot "src\gpt\patch.ps1"
$claudePatcher = Join-Path $projectRoot "src\claude\patch.ps1"
$operation = if ($RepairMode) { "repair" } else { "install" }

if ($Target -eq "Prompt") { $Target = Select-RightlyTarget -Operation $operation }

$ranElevatedInstaller = Invoke-RightlyElevatedInstallerIfNeeded `
    -Target $Target -RepairMode:$RepairMode -NoLaunch:$NoLaunch -Elevated:$Elevated
if ($ranElevatedInstaller) {
    if (-not $NoLaunch) {
        if ($Target -in @("ClaudeCode", "Both")) {
            Invoke-RightlyOfficialLauncher -Name "Claude" -Path $claudePatcher -IsolateApplicationOutput
        }
        if ($Target -in @("GptWork", "Both")) {
            Invoke-RightlyOfficialLauncher -Name "GPT Work / Codex" -Path $gptPatcher
        }
    }
    return
}

if ($Target -ne 'ChromeExtension' -and -not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js is not installed. Install Node.js LTS from https://nodejs.org/ and run the installer again."
}

if ($Target -in @("GptWork", "Both")) {
    Invoke-RightlyPatcher -Name "GPT Work / Codex" -Path $gptPatcher
}
if ($Target -in @("ClaudeCode", "Both")) {
    Invoke-RightlyPatcher -Name "Claude Desktop / Code" -Path $claudePatcher
}
if ($Target -eq 'ChromeExtension') {
    Install-RightlyChromeExtension -NoLaunch:$NoLaunch
}

Install-RightlyRepairBundle
New-RightlyRepairShortcut

if (-not $NoLaunch) {
    # GPT opens last because it can move the active conversation to the new window.
    if ($Target -in @("ClaudeCode", "Both")) {
        Invoke-RightlyOfficialLauncher -Name "Claude" -Path $claudePatcher -IsolateApplicationOutput
    }
    if ($Target -in @("GptWork", "Both")) {
        Invoke-RightlyOfficialLauncher -Name "GPT Work / Codex" -Path $gptPatcher
    }
}

Write-Host ""
$completion = if ($RepairMode) { "RTL repair" } else { "Installation" }
if ($Target -eq 'ChromeExtension') {
    Write-Host 'Chrome extension files are ready. Complete the browser step above to activate them.' -ForegroundColor Yellow
} else { Write-Host "$completion completed successfully." -ForegroundColor Green }
Write-Host "Use the Repair RTL desktop shortcut for future repairs and extension updates." -ForegroundColor Green
