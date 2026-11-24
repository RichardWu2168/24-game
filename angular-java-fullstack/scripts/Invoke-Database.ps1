#requires -Version 5.1
[CmdletBinding()]
param([ValidateSet('Start', 'Stop', 'Status')][string]$Task = 'Start')

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This launcher is intended for Windows.' }
. (Join-Path $PSScriptRoot 'Dev-Common.ps1')
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
    throw 'Docker is missing. Run scripts/Install-DevTools.ps1 and open Docker Desktop.'
}
$serverOs = (& docker.exe info --format '{{.OSType}}' | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and wait for the engine to be ready.' }
if ($serverOs -ne 'linux') { throw 'Switch Docker Desktop to Linux containers.' }

$changes = Read-LocalDatabaseSettings -ProjectRoot $projectRoot
$changes['COMPOSE_PROJECT_NAME'] = 'math24-java-dev'
$previous = @{}
$locationPushed = $false
try {
    foreach ($key in $changes.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $changes[$key], 'Process')
    }
    Push-Location (Join-Path $projectRoot 'infra')
    $locationPushed = $true
    $composeArgs = @('compose', '--env-file', '.env', '-f', 'compose.yaml')
    switch ($Task) {
        'Start' {
            Invoke-DevCommand -FilePath 'docker.exe' -Arguments ($composeArgs + @('up', '-d', '--wait'))
            Invoke-DevCommand -FilePath 'docker.exe' -Arguments ($composeArgs + @('ps'))
        }
        'Stop' {
            Invoke-DevCommand -FilePath 'docker.exe' -Arguments ($composeArgs + @('stop'))
        }
        'Status' {
            Invoke-DevCommand -FilePath 'docker.exe' -Arguments ($composeArgs + @('ps'))
        }
    }
}
finally {
    if ($locationPushed) { Pop-Location }
    foreach ($key in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
}
