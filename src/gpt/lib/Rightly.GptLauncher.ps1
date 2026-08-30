<#
.SYNOPSIS
Creates the Windows shortcuts that start Rightly GPT.

.DESCRIPTION
Rightly GPT is launched entirely through Windows PowerShell. Earlier releases
compiled a small .NET executable to give the shortcuts a native identity, but
that binary was unsigned, so Windows Smart App Control blocked it outright while
adding nothing beyond a status window - which rightly-gpt-ui.ps1 now provides.
#>

function New-RightlyGptShortcuts {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string] $ScriptPath,
        [Parameter(Mandatory)][string] $OpenerScriptPath,
        [Parameter(Mandatory)][string] $WorkingDirectory,
        [Parameter(Mandatory)][string] $IconPath
    )

    foreach ($path in @($ScriptPath, $OpenerScriptPath, $IconPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Rightly GPT shortcut dependency is missing: $path"
        }
    }

    $powerShellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    if (-not (Test-Path -LiteralPath $powerShellPath -PathType Leaf)) {
        throw "Windows PowerShell is unavailable at $powerShellPath"
    }
    $powerShellArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

    $desktop = [Environment]::GetFolderPath("Desktop")
    $programs = Join-Path ([Environment]::GetFolderPath("Programs")) "Rightly"
    $shortcutPaths = @(
        (Join-Path $desktop "Rightly GPT.lnk"),
        (Join-Path $programs "Rightly GPT.lnk")
    )
    $shell = New-Object -ComObject WScript.Shell

    # Windows owns taskbar pin creation, but an existing pin is still a normal
    # shortcut. Refresh only pins that already point at a Rightly launcher: the
    # removed EXE, or the PowerShell controller.
    $legacyExe = Join-Path $WorkingDirectory "Rightly GPT.exe"
    $taskbarDirectory = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
    foreach ($pinnedPath in @(Get-ChildItem -LiteralPath $taskbarDirectory -Filter "*.lnk" -ErrorAction SilentlyContinue)) {
        try {
            $pinned = $shell.CreateShortcut($pinnedPath.FullName)
            if (-not $pinned.TargetPath) { continue }
            $target = [System.IO.Path]::GetFullPath($pinned.TargetPath)
            $targetsOldLauncher = $target.Equals(
                [System.IO.Path]::GetFullPath($legacyExe),
                [System.StringComparison]::OrdinalIgnoreCase)
            $targetsController = $target.Equals(
                [System.IO.Path]::GetFullPath($powerShellPath),
                [System.StringComparison]::OrdinalIgnoreCase) -and
                $pinned.Arguments.IndexOf($ScriptPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
            if ($targetsOldLauncher -or $targetsController) {
                $shortcutPaths += $pinnedPath.FullName
            }
        } catch { }
    }

    foreach ($shortcutPath in @($shortcutPaths | Select-Object -Unique)) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $shortcutPath) -Force | Out-Null
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $powerShellPath
        $shortcut.WorkingDirectory = $WorkingDirectory
        $shortcut.Arguments = $powerShellArguments
        $shortcut.IconLocation = "$IconPath,0"
        $shortcut.Description = "Rightly RTL for the official GPT Work / Codex app"
        $shortcut.Save()
        Write-Output $shortcutPath
    }

    # Windows sometimes starts the packaged GPT app suspended and never resumes
    # it, leaving a windowless process that swallows every later launch. This
    # second shortcut opens GPT and clears that state, without applying RTL.
    $openerPath = Join-Path $desktop "ChatGPT (Fix).lnk"
    $opener = $shell.CreateShortcut($openerPath)
    $opener.TargetPath = $powerShellPath
    $opener.WorkingDirectory = $WorkingDirectory
    $opener.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$OpenerScriptPath`""
    $opener.IconLocation = "$IconPath,0"
    $opener.Description = "Open ChatGPT (resumes it if Windows starts it suspended)"
    $opener.Save()
    Write-Output $openerPath
}
