<#
Status window for the Rightly GPT launcher.

Replaces the progress UI that "Rightly GPT.exe" used to provide (that EXE is
unsigned, so Smart App Control blocks it). It uses the same contract the EXE did:
launch-gpt.ps1 is started with -StatusFile and writes two lines into it, a status
code and a human-readable message, which this window polls and displays.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $root "launch-gpt.ps1"
$iconPath = Join-Path $root "Rightly GPT.ico"
$statusFile = Join-Path ([System.IO.Path]::GetTempPath()) `
    ("rightly-gpt-status-" + [guid]::NewGuid().ToString("N") + ".txt")

if (-not (Test-Path -LiteralPath $launcher)) { throw "Launcher not found: $launcher" }

# Single-instance lock, matching the mutex the previous native launcher held: a
# second click while a startup is already running must not start a rival
# launcher, because both would fight over restarting and injecting into GPT.
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\RightlyGptLauncher", [ref] $createdNew)
if (-not $createdNew) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [void][System.Windows.Forms.MessageBox]::Show(
            "Rightly GPT is already starting. Please wait for it to finish.",
            "Rightly GPT",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information)
    } catch { }
    exit 0
}

# ---------------------------------------------------------------- window ----
$form = New-Object System.Windows.Forms.Form
$form.Text = "Rightly GPT"
$form.ClientSize = New-Object System.Drawing.Size(430, 150)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [System.Drawing.Color]::White
if (Test-Path -LiteralPath $iconPath) {
    try { $form.Icon = New-Object System.Drawing.Icon($iconPath) } catch { }
}

$title = New-Object System.Windows.Forms.Label
$title.Text = "Starting ChatGPT with Hebrew correction"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(20, 18)
$title.Size = New-Object System.Drawing.Size(390, 24)
$form.Controls.Add($title)

$detail = New-Object System.Windows.Forms.Label
$detail.Text = "Preparing..."
$detail.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$detail.ForeColor = [System.Drawing.Color]::FromArgb(80, 80, 80)
$detail.Location = New-Object System.Drawing.Point(20, 46)
$detail.Size = New-Object System.Drawing.Size(390, 44)
$form.Controls.Add($detail)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
$bar.MarqueeAnimationSpeed = 30
$bar.Location = New-Object System.Drawing.Point(20, 98)
$bar.Size = New-Object System.Drawing.Size(390, 14)
$form.Controls.Add($bar)

$close = New-Object System.Windows.Forms.Button
$close.Text = "Close"
$close.Location = New-Object System.Drawing.Point(330, 118)
$close.Size = New-Object System.Drawing.Size(80, 26)
$close.Visible = $false
$close.Add_Click({ $form.Close() })
$form.Controls.Add($close)

# --------------------------------------------------------------- launcher ---
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = Join-Path $PSHOME "powershell.exe"
$startInfo.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
    $launcher + '" -StatusFile "' + $statusFile + '"'
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$process = [System.Diagnostics.Process]::Start($startInfo)

function Set-Failed {
    param([string] $Message)
    $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
    $bar.MarqueeAnimationSpeed = 0
    $bar.Value = 0
    $title.Text = "Could not apply the Hebrew correction"
    $title.ForeColor = [System.Drawing.Color]::FromArgb(170, 30, 30)
    $detail.Text = $Message + "`r`nChatGPT itself is fine - use the 'ChatGPT (Fix)' shortcut to open it."
    $close.Visible = $true
}

# ------------------------------------------------------------------ poll ----
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 250
$timer.Add_Tick({
    $code = $null
    $message = $null
    if (Test-Path -LiteralPath $statusFile) {
        try {
            $lines = @(Get-Content -LiteralPath $statusFile -ErrorAction Stop)
            if ($lines.Count -ge 1) { $code = $lines[0].Trim() }
            if ($lines.Count -ge 2) { $message = ($lines[1..($lines.Count - 1)] -join " ").Trim() }
        } catch { }   # the launcher may be mid-write; try again next tick
    }

    if ($message) { $detail.Text = $message }

    switch ($code) {
        "ready" {
            $timer.Stop()
            Remove-Item -LiteralPath $statusFile -Force -ErrorAction SilentlyContinue
            $form.Close()
            return
        }
        "failed" {
            $timer.Stop()
            Set-Failed ($(if ($message) { $message } else { "The launcher reported a failure." }))
            Remove-Item -LiteralPath $statusFile -Force -ErrorAction SilentlyContinue
            return
        }
    }

    # The launcher can also die without ever writing a status.
    if ($process.HasExited -and $code -ne "ready" -and $code -ne "failed") {
        $timer.Stop()
        if ($process.ExitCode -eq 0) {
            Remove-Item -LiteralPath $statusFile -Force -ErrorAction SilentlyContinue
            $form.Close()
        } else {
            Set-Failed "The launcher stopped unexpectedly (exit code $($process.ExitCode)). See logs\gpt-runtime.log."
            Remove-Item -LiteralPath $statusFile -Force -ErrorAction SilentlyContinue
        }
    }
})
$timer.Start()

$form.Add_FormClosed({
    $timer.Stop()
    Remove-Item -LiteralPath $statusFile -Force -ErrorAction SilentlyContinue
})

try {
    [void]$form.ShowDialog()
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
