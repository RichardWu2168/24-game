#requires -Version 5.1
[CmdletBinding()]
param([ValidateSet('Info', 'Validate', 'Migrate')][string]$Task = 'Info')

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This launcher is intended for Windows.' }

# Credentials stay in process environment variables, never Maven arguments.
foreach ($name in @('FLYWAY_URL', 'FLYWAY_USER', 'FLYWAY_PASSWORD')) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
        throw "Set $name in this PowerShell session before running migrations."
    }
}
if ($env:FLYWAY_URL -notmatch '^jdbc:postgresql://') {
    throw 'FLYWAY_URL must be a PostgreSQL JDBC URL.'
}
if ($env:FLYWAY_URL -match '(?i)([?&](user|password)=|//[^/?#]*@)') {
    throw 'Keep credentials out of FLYWAY_URL. Use FLYWAY_USER and FLYWAY_PASSWORD.'
}
if ($env:FLYWAY_URL -match '(?i)://[^/?#]*-pooler[.]') {
    throw 'Use the direct Neon hostname for migrations, not its pooled hostname.'
}
try {
    $databaseUri = [Uri]$env:FLYWAY_URL.Substring(5)
}
catch {
    throw 'FLYWAY_URL must contain a valid database hostname and database name.'
}
if (-not $databaseUri.Host -or -not $databaseUri.AbsolutePath.Trim('/')) {
    throw 'FLYWAY_URL must contain a database hostname and database name.'
}
if ($databaseUri.Host -notin @('localhost', '127.0.0.1', '[::1]') -and
    $databaseUri.Query -notmatch '([?&]sslmode=(require|verify-ca|verify-full)(&|$)|[?&]ssl=true(&|$))') {
    throw 'The remote migration JDBC URL must enable TLS.'
}

. (Join-Path $PSScriptRoot 'Dev-Common.ps1')
Use-Jdk25
$projectRoot = Split-Path -Parent $PSScriptRoot
$arguments = @('-B', '-ntp', '-Pdatabase-migrations', '-Dflyway.cleanDisabled=true')
switch ($Task) {
    'Info' { $arguments += 'flyway:info' }
    'Validate' { $arguments += 'flyway:validate' }
    'Migrate' { $arguments += @('flyway:migrate', 'flyway:validate') }
}

Push-Location (Join-Path $projectRoot 'backend')
try {
    Invoke-DevCommand -FilePath './mvnw.cmd' -Arguments $arguments
}
finally {
    Pop-Location
}
