<#
.SYNOPSIS
Builds the Rightly GPT status-window executable and creates its shortcuts.

.DESCRIPTION
The native executable owns only the progress UI and stable Windows identity. It
delegates all launch, already-running, live-marker, suspended-process, and new-
window handling to the current audited launch-gpt.ps1 controller.
#>

function New-RightlyGptLauncher {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string] $SourcePath,
        [Parameter(Mandatory)][string] $DestinationPath,
        [Parameter(Mandatory)][string] $IconPath
    )

    foreach ($path in @($SourcePath, $IconPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Rightly GPT launcher build input is missing: $path"
        }
    }
    $destinationDirectory = Split-Path -Parent $DestinationPath
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    $temporaryExe = Join-Path $destinationDirectory ("Rightly.Gpt.Launcher.{0}.tmp.exe" -f [guid]::NewGuid().ToString("N"))
    try {
        $compiler = @(
            (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
            (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
        ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
        if (-not $compiler) { throw "Windows' built-in .NET Framework C# compiler is unavailable." }

        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $compilerOutput = @(& $compiler @(
                "/nologo", "/target:winexe", "/optimize+", "/platform:anycpu",
                "/reference:System.Drawing.dll", "/reference:System.Windows.Forms.dll",
                "/win32icon:$IconPath", "/out:$temporaryExe", $SourcePath
            ) 2>&1)
            $compilerExitCode = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previousPreference }
        if ($compilerExitCode -ne 0) {
            $details = (@($compilerOutput | ForEach-Object { [string] $_ }) -join " ").Trim()
            throw "Could not compile the Rightly GPT launcher (exit code $compilerExitCode): $details"
        }
        if (-not (Test-Path -LiteralPath $temporaryExe -PathType Leaf) -or
            (Get-Item -LiteralPath $temporaryExe).Length -lt 4096) {
            throw "The compiled Rightly GPT launcher is missing or unexpectedly small."
        }
        Move-Item -LiteralPath $temporaryExe -Destination $DestinationPath -Force
        return [System.IO.Path]::GetFullPath($DestinationPath)
    } finally {
        Remove-Item -LiteralPath $temporaryExe -Force -ErrorAction SilentlyContinue
    }
}

function New-RightlyGptShortcuts {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string] $LauncherPath,
        [Parameter(Mandatory)][string] $OpenerScriptPath,
        [Parameter(Mandatory)][string] $WorkingDirectory,
        [Parameter(Mandatory)][string] $IconPath
    )

    foreach ($path in @($LauncherPath, $OpenerScriptPath, $IconPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Rightly GPT shortcut dependency is missing: $path"
        }
    }

    $powerShellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    if (-not (Test-Path -LiteralPath $powerShellPath -PathType Leaf)) {
        throw "Windows PowerShell is unavailable at $powerShellPath"
    }
    $desktop = [Environment]::GetFolderPath("Desktop")
    $programs = Join-Path ([Environment]::GetFolderPath("Programs")) "Rightly"
    $shortcutPaths = @(
        (Join-Path $desktop "Rightly GPT.lnk"),
        (Join-Path $programs "Rightly GPT.lnk")
    )
    $shell = New-Object -ComObject WScript.Shell

    # Windows owns taskbar pin creation, but an existing pin is still a normal
    # shortcut. Refresh pins targeting either the restored EXE or the interim
    # PowerShell status-window shortcut.
    $interimUi = Join-Path $WorkingDirectory "rightly-gpt-ui.ps1"
    $taskbarDirectory = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
    foreach ($pinnedPath in @(Get-ChildItem -LiteralPath $taskbarDirectory -Filter "*.lnk" -ErrorAction SilentlyContinue)) {
        try {
            $pinned = $shell.CreateShortcut($pinnedPath.FullName)
            if (-not $pinned.TargetPath) { continue }
            $target = [System.IO.Path]::GetFullPath($pinned.TargetPath)
            $targetsLauncher = $target.Equals(
                [System.IO.Path]::GetFullPath($LauncherPath),
                [System.StringComparison]::OrdinalIgnoreCase)
            $targetsController = $target.Equals(
                [System.IO.Path]::GetFullPath($powerShellPath),
                [System.StringComparison]::OrdinalIgnoreCase) -and
                $pinned.Arguments.IndexOf($interimUi, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
            if ($targetsLauncher -or $targetsController) {
                $shortcutPaths += $pinnedPath.FullName
            }
        } catch { }
    }

    foreach ($shortcutPath in @($shortcutPaths | Select-Object -Unique)) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $shortcutPath) -Force | Out-Null
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $LauncherPath
        $shortcut.WorkingDirectory = $WorkingDirectory
        $shortcut.Arguments = ""
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
