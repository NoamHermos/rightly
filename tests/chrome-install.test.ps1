[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$sandbox = Join-Path ([IO.Path]::GetTempPath()) ('rightly-chrome-test-' + [guid]::NewGuid().ToString('N'))
$oldLocalAppData = $env:LOCALAPPDATA
function Assert-True([bool] $Value, [string] $Message) { if (-not $Value) { throw $Message } }
function Assert-Throws([scriptblock] $Action, [string] $Pattern) {
    $message = ''; try { & $Action } catch { $message = $_.Exception.Message }
    Assert-True ($message -match $Pattern) "Expected '$Pattern'; got '$message'"
}
function Save-Json($Object, [string] $Path) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $Path) -Force | Out-Null
    $Object | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Path -Encoding UTF8
}
try {
    New-Item -ItemType Directory -Path $sandbox | Out-Null
    $env:LOCALAPPDATA = $sandbox
    . (Join-Path $repo 'installer\lib\Rightly.Install.ps1')
    . (Join-Path $repo 'src\gpt\lib\Rightly.GptLauncher.ps1')
    Initialize-RightlyInstaller -Root $repo
    Assert-True (-not (Invoke-RightlyElevatedInstallerIfNeeded -Target ChromeExtension)) 'Chrome must not request elevation'
    $source = Join-Path $repo 'src\chrome'
    $fresh = Join-Path $sandbox 'Programs\Rightly\Chrome'
    Install-RightlyChromeExtension -NoLaunch
    Assert-True (Test-RightlyChromePackage $fresh) 'Fresh extension was not prepared'
    foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse) {
        $relative = $file.FullName.Substring($source.Length + 1)
        Assert-True ((Get-FileHash -LiteralPath $file.FullName).Hash -eq (Get-FileHash -LiteralPath (Join-Path $fresh $relative)).Hash) "Fresh file differs: $relative"
    }

    # Existing unpacked paths may be outside the default install directory.
    $loaded = Join-Path $sandbox 'My extension\Chrome'
    New-Item -ItemType Directory -Path $loaded -Force | Out-Null
    $manifest = Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $manifest.version = '0.0.1'
    Save-Json $manifest (Join-Path $loaded 'manifest.json')
    Set-Content -LiteralPath (Join-Path $loaded 'chatgpt-rtl.js') -Value 'old source'
    Set-Content -LiteralPath (Join-Path $loaded 'keep.txt') -Value 'unrelated local file'
    $oldHash = (Get-FileHash -LiteralPath (Join-Path $loaded 'chatgpt-rtl.js')).Hash
    $userData = Join-Path $sandbox 'Google\Chrome\User Data'
    $prefs = Join-Path $userData 'Default\Secure Preferences'
    Save-Json @{extensions=@{settings=@{abcdefghijklmnopabcdefghijklmnop=@{location=4;path=$loaded}}}} $prefs
    $otherPrefs = Join-Path $userData 'Profile 1\Preferences'
    Save-Json @{extensions=@{settings=@{ponmlkjihgfedcbaponmlkjihgfedcba=@{location=4;path=$loaded};store=@{location=1;path=$fresh}}}} $otherPrefs
    $prefsHash = (Get-FileHash -LiteralPath $prefs).Hash
    $otherPrefsHash = (Get-FileHash -LiteralPath $otherPrefs).Hash
    Assert-True (@(Get-RightlyChromeInstallations).Count -eq 2) 'Must discover both unpacked registrations and exclude store entries'
    Install-RightlyChromeExtension -NoLaunch
    Assert-True ((Get-FileHash -LiteralPath $prefs).Hash -eq $prefsHash) 'Secure Preferences changed'
    Assert-True ((Get-FileHash -LiteralPath $otherPrefs).Hash -eq $otherPrefsHash) 'Preferences changed'
    Assert-True ((Get-FileHash -LiteralPath (Join-Path $loaded 'chatgpt-rtl.js')).Hash -eq (Get-FileHash -LiteralPath (Join-Path $source 'chatgpt-rtl.js')).Hash) 'Existing loaded directory was not updated'
    Assert-True ((Get-Content -LiteralPath (Join-Path $loaded 'keep.txt')) -eq 'unrelated local file') 'Unrelated file was removed'
    $backups = @(Get-ChildItem -LiteralPath (Join-Path $sandbox 'Programs\Rightly\Backups\Chrome') -Directory)
    Assert-True ($backups.Count -eq 1) 'A shared directory should be updated/backed up once'
    Assert-True ((Get-FileHash -LiteralPath (Join-Path $backups[0].FullName 'chatgpt-rtl.js')).Hash -eq $oldHash) 'Previous extension was not backed up'

    # Copy failure must restore overwritten files, including the old manifest.
    Save-Json $manifest (Join-Path $loaded 'manifest.json')
    Set-Content -LiteralPath (Join-Path $loaded 'chatgpt-rtl.css') -Value 'old css'
    $oldCssHash = (Get-FileHash -LiteralPath (Join-Path $loaded 'chatgpt-rtl.css')).Hash
    & {
        $script:copyFailureInjected = $false
        function Copy-Item {
            param($LiteralPath, $Destination, [switch] $Force)
            if (-not $script:copyFailureInjected -and $Destination -eq (Join-Path $loaded 'chatgpt-rtl.js')) {
                $script:copyFailureInjected = $true; throw 'simulated copy failure'
            }
            Microsoft.PowerShell.Management\Copy-Item -LiteralPath $LiteralPath -Destination $Destination -Force:$Force
        }
        Assert-Throws { Install-RightlyChromeFiles -Source $source -Destination $loaded } 'simulated copy failure'
    }
    Assert-True ((Get-FileHash -LiteralPath (Join-Path $loaded 'chatgpt-rtl.css')).Hash -eq $oldCssHash) 'Failed copy did not roll back CSS'
    Assert-True ((Get-Content -LiteralPath (Join-Path $loaded 'manifest.json') -Raw | ConvertFrom-Json).version -eq '0.0.1') 'Failed copy published a new manifest'
    Assert-Throws { Install-RightlyChromeFiles -Source $source -Destination $userData } 'unrelated directory'
    Assert-Throws { Get-RightlyChromeChildPath $loaded '..\outside.js' } 'leaves its directory'

    # Remove only the redundant Rightly shortcut, preserving a same-name link
    # to another helper and retaining a hash-verified backup of the real link.
    $desktop = Join-Path $sandbox 'Desktop'
    New-Item -ItemType Directory -Path $desktop | Out-Null
    $link = Join-Path $desktop 'ChatGPT (Fix).lnk'
    $opener = Join-Path $sandbox 'Programs\Rightly\GPT\open-chatgpt.ps1'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($link)
    $shortcut.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = '-File "C:\Unrelated\open.ps1"'; $shortcut.Save()
    Remove-RightlyGptFixShortcut -DesktopPath $desktop -OpenerScriptPath $opener
    Assert-True (Test-Path -LiteralPath $link) 'Unrelated shortcut was removed'
    $shortcut.Arguments = "-NoProfile -File `"$opener`""; $shortcut.Save()
    $linkHash = (Get-FileHash -LiteralPath $link).Hash
    Remove-RightlyGptFixShortcut -DesktopPath $desktop -OpenerScriptPath $opener
    Assert-True (-not (Test-Path -LiteralPath $link)) 'Obsolete Rightly shortcut remains'
    $savedLink = Get-ChildItem -LiteralPath (Join-Path $sandbox 'Programs\Rightly\Backups\Shortcuts') -File | Select-Object -First 1
    Assert-True ((Get-FileHash -LiteralPath $savedLink.FullName).Hash -eq $linkHash) 'Shortcut backup differs'
} finally {
    $env:LOCALAPPDATA = $oldLocalAppData
    $resolvedSandbox = [IO.Path]::GetFullPath($sandbox)
    $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\rightly-chrome-test-'
    if (-not $resolvedSandbox.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected test cleanup path' }
    Remove-Item -LiteralPath $resolvedSandbox -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host 'Chrome install/update, rollback, preference preservation and shortcut tests passed.' -ForegroundColor Green
