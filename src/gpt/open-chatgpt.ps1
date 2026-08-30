<#
Opens the official ChatGPT app, working around a Windows problem on this machine:
the packaged app is frequently created SUSPENDED and never resumed, so it sits at
one suspended thread with no window, and - because GPT is single-instance - every
later launch is silently swallowed by that frozen process.

This script clears any frozen leftovers, launches the app, and resumes it if it
comes up suspended. It applies no RTL/Hebrew correction; it just opens GPT.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class GptResume {
    [DllImport("ntdll.dll")] private static extern int NtResumeProcess(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(int access, bool inherit, int processId);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);

    public static bool Resume(int processId) {
        IntPtr handle = OpenProcess(0x0800 | 0x0400, false, processId);
        if (handle == IntPtr.Zero) return false;
        try { return NtResumeProcess(handle) == 0; }
        finally { CloseHandle(handle); }
    }
}
'@

function Get-MainProcesses {
    return @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object {
        $_.Threads.Count -gt 0
    })
}

function Test-Frozen {
    param($Process)
    $threads = @($Process.Threads)
    return $threads.Count -le 2 -and
        @($threads | Where-Object { "$($_.WaitReason)" -eq "Suspended" }).Count -gt 0
}

# 1. A frozen leftover swallows new launches - clear those first.
foreach ($process in Get-MainProcesses) {
    if ($process.MainWindowHandle -eq [IntPtr]::Zero -and (Test-Frozen $process)) {
        Write-Host "Clearing frozen GPT process $($process.Id)..."
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
}

# 2. If GPT is already up with a window, just bring it forward.
$alive = @(Get-MainProcesses | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
if ($alive.Count -gt 0) {
    Write-Host "ChatGPT is already open."
    exit 0
}

# 3. Launch through the shell, the same way the Start menu does.
$package = Get-AppxPackage -Name "OpenAI.Codex" | Sort-Object Version -Descending | Select-Object -First 1
if (-not $package) { throw "The official ChatGPT app is not installed." }
Write-Host "Opening ChatGPT..."
Start-Process "explorer.exe" -ArgumentList "shell:AppsFolder\$($package.PackageFamilyName)!App"

# 4. Resume it if Windows hands it back suspended.
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    foreach ($process in Get-MainProcesses) {
        if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
            Write-Host "ChatGPT is open."
            exit 0
        }
        if (Test-Frozen $process) {
            if ([GptResume]::Resume($process.Id)) {
                Write-Host "ChatGPT started suspended - resumed it."
            }
        }
    }
    Start-Sleep -Milliseconds 500
}

Write-Warning "ChatGPT did not show a window within 30 seconds."
exit 1
