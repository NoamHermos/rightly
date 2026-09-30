<# Install the local Chrome package; Chrome owns extension registration/reload. #>
Set-StrictMode -Version 2.0

function Get-RightlyJsonProperty {
    param($Object, [string] $Name)
    if ($null -ne $Object -and $Object.PSObject.Properties[$Name]) { return $Object.$Name }
    return $null
}

function Test-RightlyChromePackage {
    param([string] $Path)
    try {
        $manifest = Get-Content -LiteralPath (Join-Path $Path 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($manifest.name -ne 'Rightly for ChatGPT' -or $manifest.manifest_version -ne 3) { return $false }
        $scripts = @($manifest.content_scripts | ForEach-Object { $_.js })
        $matches = @($manifest.content_scripts | ForEach-Object { $_.matches })
        return ($scripts -contains 'chatgpt-rtl.js' -and $matches.Count -gt 0 -and
            @($matches | Where-Object { $_ -notin @('https://chatgpt.com/*', 'https://chat.openai.com/*') }).Count -eq 0)
    } catch { return $false }
}

function Get-RightlyChromeInstallations {
    param([string] $UserDataDir = (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'))
    if (-not (Test-Path -LiteralPath $UserDataDir -PathType Container)) { return }
    foreach ($profile in @(Get-ChildItem -LiteralPath $UserDataDir -Directory)) {
        $seen = @{}
        foreach ($name in @('Secure Preferences', 'Preferences')) {
            $preferencePath = Join-Path $profile.FullName $name
            if (-not (Test-Path -LiteralPath $preferencePath -PathType Leaf)) { continue }
            try {
                # Read only. Never register extensions by editing Chrome preferences.
                $preferences = Get-Content -LiteralPath $preferencePath -Raw -Encoding UTF8 | ConvertFrom-Json
                $extensions = Get-RightlyJsonProperty $preferences 'extensions'
                $settings = Get-RightlyJsonProperty $extensions 'settings'
                if ($null -eq $settings) { continue }
                foreach ($entry in $settings.PSObject.Properties) {
                    if ($seen.ContainsKey($entry.Name)) { continue }
                    $seen[$entry.Name] = $true
                    $location = Get-RightlyJsonProperty $entry.Value 'location'
                    $path = Get-RightlyJsonProperty $entry.Value 'path'
                    # Only existing unpacked installs, not store-managed packages.
                    if ($location -ne 4 -or -not $path -or -not [IO.Path]::IsPathRooted($path)) { continue }
                    if (Test-RightlyChromePackage -Path $path) {
                        [pscustomobject]@{ Path = [IO.Path]::GetFullPath($path).TrimEnd('\'); Id = $entry.Name; Profile = $profile.Name }
                    }
                }
            } catch {
                throw "Could not inspect Chrome profile '$($profile.Name)'. Close Chrome and try again. No Chrome preferences were changed. $($_.Exception.Message)"
            }
        }
    }
}

function Get-RightlyChromeChildPath {
    param([string] $Root, [string] $RelativePath)
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    $full = [IO.Path]::GetFullPath((Join-Path $rootFull $RelativePath))
    if (-not $full.StartsWith($rootFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Chrome package path leaves its directory: $RelativePath"
    }
    # Refuse junction/symlink redirection inside the extension directory.
    for ($parent = $full; $parent.Length -ge $rootFull.Length; $parent = Split-Path -Parent $parent) {
        if ((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Chrome package path is a symbolic link or junction: $parent"
        }
        if ($parent.Equals($rootFull, [StringComparison]::OrdinalIgnoreCase)) { break }
    }
    return $full
}

function Install-RightlyChromeFiles {
    param([Parameter(Mandatory)][string] $Source, [Parameter(Mandatory)][string] $Destination,
        [string] $BackupRoot = (Join-Path $env:LOCALAPPDATA 'Programs\Rightly\Backups\Chrome'))
    $Source = [IO.Path]::GetFullPath($Source).TrimEnd('\')
    $Destination = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
    if (-not (Test-RightlyChromePackage $Source)) { throw "Invalid Rightly Chrome source package: $Source" }
    if ((Test-Path -LiteralPath $Destination) -and @(Get-ChildItem -LiteralPath $Destination -Force).Count -gt 0 -and
        -not (Test-RightlyChromePackage $Destination)) { throw "Refusing to overwrite an unrelated directory: $Destination" }
    $manifest = Get-Content -LiteralPath (Join-Path $Source 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $references = @($manifest.content_scripts | ForEach-Object { $_.js; $_.css }) + @($manifest.icons.PSObject.Properties.Value)
    foreach ($relative in $references) {
        if (-not (Test-Path -LiteralPath (Get-RightlyChromeChildPath $Source $relative) -PathType Leaf)) {
            throw "Chrome package asset is missing: $relative"
        }
    }
    # Publish the manifest last, after all scripts/assets have been verified.
    $files = @(Get-ChildItem -LiteralPath $Source -File -Recurse | Sort-Object @{Expression = { $_.Name -eq 'manifest.json' }}, FullName)
    $plan = @($files | ForEach-Object {
        $relative = $_.FullName.Substring($Source.Length + 1)
        [pscustomobject]@{ Source = (Get-RightlyChromeChildPath $Source $relative)
            Destination = (Get-RightlyChromeChildPath $Destination $relative); Relative = $relative
            Existed = (Test-Path -LiteralPath (Join-Path $Destination $relative) -PathType Leaf)
            Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    })
    if ($Source.Equals($Destination, [StringComparison]::OrdinalIgnoreCase)) {
        return [pscustomobject]@{ Path = $Destination; Version = $manifest.version; Backup = $null; FileCount = $plan.Count }
    }
    $backup = Join-Path $BackupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
    foreach ($item in $plan | Where-Object Existed) {
        $saved = Get-RightlyChromeChildPath $backup $item.Relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $saved) -Force | Out-Null
        Copy-Item -LiteralPath $item.Destination -Destination $saved -Force
        if ((Get-FileHash -LiteralPath $saved).Hash -ne (Get-FileHash -LiteralPath $item.Destination).Hash) { throw 'Chrome backup verification failed' }
    }
    $attempted = @()
    try {
        foreach ($item in $plan) {
            New-Item -ItemType Directory -Path (Split-Path -Parent $item.Destination) -Force | Out-Null
            $attempted += $item
            Copy-Item -LiteralPath $item.Source -Destination $item.Destination -Force
            if ((Get-FileHash -LiteralPath $item.Destination -Algorithm SHA256).Hash -ne $item.Hash) { throw "Chrome file verification failed: $($item.Relative)" }
        }
    } catch {
        foreach ($item in $attempted) {
            if ($item.Existed) { Copy-Item -LiteralPath (Get-RightlyChromeChildPath $backup $item.Relative) -Destination $item.Destination -Force }
            elseif (Test-Path -LiteralPath $item.Destination -PathType Leaf) { Remove-Item -LiteralPath $item.Destination -Force }
        }
        throw
    }
    [pscustomobject]@{ Path = $Destination; Version = $manifest.version
        Backup = $(if (Test-Path -LiteralPath $backup) { $backup } else { $null }); FileCount = $plan.Count }
}

function Install-RightlyChromeExtension {
    param([switch] $NoLaunch,
        [string] $UserDataDir = (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'),
        [string] $DefaultInstallPath = (Join-Path $env:LOCALAPPDATA 'Programs\Rightly\Chrome'))
    Write-RightlyStep 'Installing/updating Rightly for ChatGPT in Chrome'
    $registrations = @(Get-RightlyChromeInstallations -UserDataDir $UserDataDir)
    $destinations = @($registrations | Select-Object -ExpandProperty Path | Sort-Object -Unique)
    if ($destinations.Count -eq 0) { $destinations = @($DefaultInstallPath) }
    foreach ($destination in $destinations) {
        $result = Install-RightlyChromeFiles -Source (Join-Path $Script:RightlyRoot 'src\chrome') -Destination $destination
        Write-RightlyOk "Chrome extension files verified: version $($result.Version), $($result.FileCount) files"
        Write-Host "  Extension folder: $($result.Path)" -ForegroundColor Cyan
    }
    Write-Host ''
    if ($registrations.Count -gt 0) {
        Write-Host '  Browser step: click Reload on Rightly for ChatGPT in chrome://extensions.' -ForegroundColor Yellow
        foreach ($registration in $registrations) { Write-Host "  Chrome profile: $($registration.Profile); extension: $($registration.Id)" }
    } else {
        Write-Host '  Browser step: open chrome://extensions, enable Developer mode, click Load unpacked,' -ForegroundColor Yellow
        Write-Host "  and choose: $DefaultInstallPath" -ForegroundColor Yellow
    }
    Write-Host '  Then refresh your ChatGPT tabs. Browser activation is still pending.' -ForegroundColor Yellow
    if (-not $NoLaunch) {
        $candidates = @((Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
            (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
            (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'))
        $chrome = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
        if ($chrome) {
            $arguments = @('chrome://extensions/')
            if ($registrations.Count -gt 0) {
                $profileName = $registrations[0].Profile
                # Directory names come from disk; quotes are illegal in Windows names.
                $arguments = @("--profile-directory=`"$profileName`"", "chrome://extensions/?id=$($registrations[0].Id)")
            }
            Start-Process -FilePath $chrome -ArgumentList $arguments
        } else { Write-RightlyInfo 'Chrome was not found. Install Chrome, then follow the browser step above.' }
    }
}
