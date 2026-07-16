<# Shared, side-effect-free helpers for rebuilding GPT's Electron ASAR. #>

Set-StrictMode -Version 2.0

function Get-RightlyToolPath {
    param([Parameter(Mandatory)][string[]] $Names)

    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command -and $command.Source) { return $command.Source }
        if ($command -and $command.Path) { return $command.Path }
    }
    return $null
}

function Invoke-RightlyCheckedCommand {
    param(
        [Parameter(Mandatory)][string] $FilePath,
        [Parameter(Mandatory)][string[]] $Arguments
    )

    & $FilePath @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code $LASTEXITCODE."
    }
}

function New-RightlyGptAsar {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string] $SourceAsar,
        [Parameter(Mandatory)][string] $DestinationAsar,
        [Parameter(Mandatory)][string] $PayloadPath,
        [Parameter(Mandatory)][string] $NpxPath
    )

    foreach ($path in @($SourceAsar, $PayloadPath, $NpxPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Required GPT patch input is missing: $path"
        }
    }

    $destinationDirectory = Split-Path -Parent $DestinationAsar
    $extractDirectory = Join-Path $destinationDirectory "app"
    if (Test-Path -LiteralPath $extractDirectory) {
        Remove-Item -LiteralPath $extractDirectory -Recurse -Force
    }
    New-Item -ItemType Directory -Path $extractDirectory -Force | Out-Null

    Write-Host ""
    Write-Host "==> Extracting the official GPT app.asar" -ForegroundColor Cyan
    Invoke-RightlyCheckedCommand $NpxPath @(
        "--yes", "@electron/asar", "extract", $SourceAsar, $extractDirectory
    )

    $targets = New-Object System.Collections.Generic.List[System.IO.FileInfo]
    foreach ($glob in @(
        "webview\assets\app-main-*.js",
        "webview\assets\index-*.js",
        "webview\assets\composer-*.js"
    )) {
        Get-ChildItem -Path (Join-Path $extractDirectory $glob) -File -ErrorAction SilentlyContinue |
            ForEach-Object { $targets.Add($_) }
    }

    $uniqueTargets = @($targets | Sort-Object FullName -Unique)
    if (@($uniqueTargets | Where-Object Name -Like "app-main-*.js").Count -eq 0) {
        throw "The current GPT renderer entry bundle was not found. No official file was changed."
    }

    Write-Host ""
    Write-Host "==> Embedding the persistent Rightly payload" -ForegroundColor Cyan
    $payload = Get-Content -LiteralPath $PayloadPath -Raw
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    foreach ($target in $uniqueTargets) {
        $text = [System.IO.File]::ReadAllText($target.FullName)
        if ($text.Contains("RT-AI CODEX RTL PATCH START")) {
            throw "The source ASAR already contains a Rightly marker: $($target.Name)"
        }
        [System.IO.File]::WriteAllText(
            $target.FullName,
            $payload + [Environment]::NewLine + $text,
            $utf8
        )
    }
    Write-Host "  [+] Embedded Rightly into $($uniqueTargets.Count) renderer bundle(s)." -ForegroundColor Green

    Write-Host ""
    Write-Host "==> Repacking and validating the patched ASAR" -ForegroundColor Cyan
    Invoke-RightlyCheckedCommand $NpxPath @(
        "--yes", "@electron/asar", "pack", $extractDirectory, $DestinationAsar
    )
    if (-not (Test-Path -LiteralPath $DestinationAsar -PathType Leaf)) {
        throw "The patched ASAR was not created."
    }
    if ((Get-Item -LiteralPath $DestinationAsar).Length -lt 50MB) {
        throw "The patched ASAR is unexpectedly small; refusing to install it."
    }

    return [pscustomobject]@{
        BundleCount = $uniqueTargets.Count
        Sha256 = (Get-FileHash -LiteralPath $DestinationAsar -Algorithm SHA256).Hash.ToLowerInvariant()
        Length = (Get-Item -LiteralPath $DestinationAsar).Length
    }
}
