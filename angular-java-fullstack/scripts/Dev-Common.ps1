Set-StrictMode -Version Latest

function Invoke-DevCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @()
    )
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code $LASTEXITCODE."
    }
}

function Assert-CompatibleNode {
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
        throw 'Node.js is missing. Run scripts/Install-DevTools.ps1 first.'
    }
    $versionText = (& node.exe --version).Trim().TrimStart('v')
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the Node.js version.' }
    $version = [version]$versionText
    $supported = (
        ($version.Major -eq 22 -and $version -ge [version]'22.22.3') -or
        ($version.Major -eq 24 -and $version -ge [version]'24.15.0') -or
        ($version.Major -eq 26)
    )
    if (-not $supported) {
        throw "Node $version is outside the Angular 22 compatibility range. Install Node 26 LTS."
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'npm.cmd is missing. Reopen PowerShell after installing Node.js.'
    }
    Write-Host "Node.js $version is compatible with Angular 22."
}

function Use-Jdk25 {
    $candidates = @()
    if ($env:JAVA_HOME) { $candidates += $env:JAVA_HOME }
    $compiler = Get-Command javac.exe -ErrorAction SilentlyContinue
    if ($compiler) {
        $candidates += Split-Path -Parent (Split-Path -Parent $compiler.Source)
    }
    foreach ($basePath in @(
        (Join-Path $env:ProgramFiles 'Microsoft'),
        (Join-Path $env:LOCALAPPDATA 'Programs/Microsoft')
    )) {
        if (Test-Path -LiteralPath $basePath) {
            $candidates += @(Get-ChildItem -LiteralPath $basePath -Directory -Filter 'jdk-25*' |
                Sort-Object Name -Descending | Select-Object -ExpandProperty FullName)
        }
    }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        $compilerPath = Join-Path $candidate 'bin/javac.exe'
        if (-not (Test-Path -LiteralPath $compilerPath)) { continue }
        $versionText = (& $compilerPath --version 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -eq 0 -and $versionText -match '^javac 25([.]|$)') {
            $env:JAVA_HOME = $candidate
            $env:Path = (Join-Path $candidate 'bin') + ';' + $env:Path
            Write-Host "Using $versionText from $candidate"
            return
        }
    }
    throw 'JDK 25 was not found. Install Microsoft.OpenJDK.25, reopen PowerShell, and retry.'
}

function Read-LocalDatabaseSettings {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)
    $envPath = Join-Path $ProjectRoot 'infra/.env'
    if (-not (Test-Path -LiteralPath $envPath)) {
        throw 'Local database settings are missing. Run scripts/Initialize-Dev.ps1 first.'
    }
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $envPath) {
        $entry = $line.Trim()
        if (-not $entry -or $entry.StartsWith('#')) { continue }
        $parts = $entry -split '=', 2
        if ($parts.Count -ne 2) { throw 'Invalid line in infra/.env. Expected NAME=value.' }
        $key = $parts[0].Trim()
        if ($key -notin @('POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_PORT')) {
            throw "Unsupported local database setting: $key"
        }
        $values[$key] = $parts[1].Trim()
    }
    foreach ($key in @('POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_PORT')) {
        if (-not $values.ContainsKey($key) -or -not $values[$key]) {
            throw "Missing local database setting: $key"
        }
    }
    foreach ($key in @('POSTGRES_DB', 'POSTGRES_USER')) {
        if ($values[$key] -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
            throw "$key must use letters, digits, and underscores."
        }
    }
    if ($values['POSTGRES_PASSWORD'] -notmatch '^[A-Za-z0-9_-]{16,}$') {
        throw 'Use an unquoted local password of at least 16 letters, digits, underscores, or hyphens.'
    }
    $databasePort = 0
    if (-not [int]::TryParse($values['POSTGRES_PORT'], [ref]$databasePort) -or
        $databasePort -lt 1024 -or $databasePort -gt 65535) {
        throw 'POSTGRES_PORT must be an unquoted port between 1024 and 65535.'
    }
    return $values
}
