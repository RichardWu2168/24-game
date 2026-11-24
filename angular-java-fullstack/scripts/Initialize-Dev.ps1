#requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This setup script is intended for Windows.' }
. (Join-Path $PSScriptRoot 'Dev-Common.ps1')
$projectRoot = Split-Path -Parent $PSScriptRoot

Assert-CompatibleNode
Use-Jdk25

$localEnvPath = Join-Path $projectRoot 'infra/.env'
if (-not (Test-Path -LiteralPath $localEnvPath)) {
    $passwordBytes = New-Object byte[] 24
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($passwordBytes) }
    finally { $generator.Dispose() }
    $localPassword = [BitConverter]::ToString($passwordBytes).Replace('-', '').ToLowerInvariant()
    $content = @(
        '# Local development only. This file is ignored by Git.'
        'POSTGRES_DB=math24_java'
        'POSTGRES_USER=math24'
        "POSTGRES_PASSWORD=$localPassword"
        'POSTGRES_PORT=5433'
    ) -join [Environment]::NewLine
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($localEnvPath, $content + [Environment]::NewLine, $utf8)
    Write-Host 'Created infra/.env with a generated local database password.'
}
else {
    Write-Host 'Keeping the existing infra/.env.'
}
$null = Read-LocalDatabaseSettings -ProjectRoot $projectRoot

Push-Location (Join-Path $projectRoot 'frontend')
try {
    Invoke-DevCommand -FilePath 'npm.cmd' -Arguments @('ci')
    Invoke-DevCommand -FilePath 'npm.cmd' -Arguments @('run', 'build')
    Invoke-DevCommand -FilePath 'npm.cmd' -Arguments @('test', '--', '--watch=false')
}
finally { Pop-Location }

Push-Location (Join-Path $projectRoot 'backend')
try {
    Invoke-DevCommand -FilePath './mvnw.cmd' -Arguments @('--version')
    Invoke-DevCommand -FilePath './mvnw.cmd' -Arguments @('-B', 'test-compile')
}
finally { Pop-Location }

Write-Host ''
Write-Host 'Setup checks passed: frontend build/tests and backend source/test compilation.'
Write-Host 'The database-backed Java test has not run yet.'
Write-Host 'Next: start Docker Desktop, then follow the PostgreSQL startup steps in README.md.'
