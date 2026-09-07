$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

# Import only function definitions, never execute a patcher's entry point.
$path = Join-Path $PSScriptRoot '..\src\claude\patch.ps1'
$ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$null)
foreach ($name in @('Install-VerifiedClaudePatch', 'Wait-ClaudePatchVerified', 'Start-OfficialClaude', 'Get-ClaudePatchVerification')) {
    $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $false)
    . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert-True([bool] $Value, [string] $Message) { if (-not $Value) { throw $Message } }
function Assert-Throws([scriptblock] $Action, [string] $Pattern) {
    $message = ''
    try { & $Action } catch { $message = $_.Exception.Message }
    Assert-True ($message -match $Pattern) "Expected error '$Pattern'; got '$message'"
}
function Write-Step { param($Message) }
function Write-Ok { param($Message) }
function Write-Warn { param($Message) }
function Start-Sleep { param($Seconds) }
function Remove-AutomaticPatching { }

# Simulate registration replacement during the engine AND after its final close.
foreach ($swapAt in @('engine', 'close', 'none', 'always')) {
    & {
        $script:version = 1; $script:patched = 0; $script:runs = 0; $script:stops = 0
        function Get-OfficialClaudePackage { [pscustomobject]@{ AppDir = "C:\Claude$script:version"; Package = @{ Version = $script:version } } }
        function Stop-ClaudeProcesses {
            $script:stops++
            if ($swapAt -eq 'close' -and $script:stops -eq 2) { $script:version++ }
        }
        function Invoke-InPlaceAction {
            param($Action)
            $script:runs++; $script:patched = $script:version
            if (($swapAt -eq 'engine' -and $script:runs -eq 1) -or $swapAt -eq 'always') { $script:version++ }
        }
        function Get-ClaudePatchVerification {
            [pscustomobject]@{ Verified = ($script:patched -eq $script:version); Official = (Get-OfficialClaudePackage) }
        }
        if ($swapAt -eq 'always') {
            Assert-Throws { Install-VerifiedClaudePatch } 'after three attempts'
            Assert-True ($script:runs -eq 3) 'Repair retries must be bounded'
        } else {
            Install-VerifiedClaudePatch
            $expected = if ($swapAt -eq 'none') { 1 } else { 2 }
            Assert-True ($script:runs -eq $expected) "Wrong retry count for $swapAt"
            Assert-True ($script:version -eq $script:patched) "Reported success for obsolete package ($swapAt)"
        }
    }
}

# Do not retry genuine engine errors against an unchanged package.
& {
    function Stop-ClaudeProcesses { }
    function Get-OfficialClaudePackage { [pscustomobject]@{ AppDir = 'C:\Claude'; Package = @{ Version = 1 } } }
    function Invoke-InPlaceAction { throw 'engine failed' }
    Assert-Throws { Install-VerifiedClaudePatch } 'engine failed'
}

# Update in the elevation handoff, and during the final activation itself.
foreach ($swapAt in @('handoff', 'activation', 'never-starts')) {
    & {
        $script:version = 1; $script:patched = 1; $script:repairs = 0; $script:activations = 0
        if ($swapAt -eq 'handoff') { $script:version = 2 }
        function Get-ClaudePatchVerification {
            [pscustomobject]@{ Verified = ($script:patched -eq $script:version); Official = [pscustomobject]@{
                AppDir = "C:\Claude$script:version"; Package = @{ Version = $script:version }
            }; Reason = 'package replaced' }
        }
        function Invoke-ClaudeRepairForLaunch { $script:repairs++; $script:patched = $script:version }
        function Invoke-ClaudeActivation {
            $script:activations++
            if ($swapAt -eq 'activation' -and $script:activations -eq 1) { $script:version++ }
        }
        function Get-ClaudeProcesses { param($Roots) if ($swapAt -ne 'never-starts') { [pscustomobject]@{ CommandLine = 'claude.exe' } } }
        if ($swapAt -eq 'never-starts') {
            Assert-Throws { Start-OfficialClaude } 'after three launch attempts'
            Assert-True ($script:activations -eq 3) 'Launch retries must be bounded'
        } else {
            Start-OfficialClaude
            Assert-True ($script:repairs -eq 1) "Missing repair during $swapAt"
            Assert-True ($script:patched -eq $script:version) 'Launched an unpatched package'
        }
    }
}

# A stale state file must fail before reading the ASAR, not count as success.
& {
    $script:StateDir = $PSScriptRoot
    function Get-OfficialClaudePackage { [pscustomobject]@{ AppDir = 'C:\New\app'; Package = @{ Version = '2'; InstallLocation = 'C:\New' } } }
    function Get-Content { '{"patchedVersion":"1","patchedInstallPath":"C:\\Old"}' }
    $result = Get-ClaudePatchVerification
    Assert-True (-not $result.Verified -and $result.Reason -match 'another Claude package') 'Stale state was trusted'
}
Write-Host 'Claude repair race tests passed.' -ForegroundColor Green
