#requires -Version 5.1
[CmdletBinding()]
param([ValidateSet('Run', 'Test', 'Compile')][string]$Task = 'Run')

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This launcher is intended for Windows.' }
. (Join-Path $PSScriptRoot 'Dev-Common.ps1')
$projectRoot = Split-Path -Parent $PSScriptRoot
Use-Jdk25

$changes = @{}
if ($Task -ne 'Compile') {
    $database = Read-LocalDatabaseSettings -ProjectRoot $projectRoot
    $changes = @{
        'SPRING_PROFILES_ACTIVE' = 'local'
        'SPRING_DATASOURCE_URL' = 'jdbc:postgresql://localhost:' + $database['POSTGRES_PORT'] + '/' + $database['POSTGRES_DB']
        'SPRING_DATASOURCE_USERNAME' = $database['POSTGRES_USER']
        'SPRING_DATASOURCE_PASSWORD' = $database['POSTGRES_PASSWORD']
        'SPRING_FLYWAY_ENABLED' = 'true'
    }
}
$previous = @{}
$locationPushed = $false
try {
    foreach ($key in $changes.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $changes[$key], 'Process')
    }
    Push-Location (Join-Path $projectRoot 'backend')
    $locationPushed = $true
    switch ($Task) {
        'Run' {
            Invoke-DevCommand -FilePath './mvnw.cmd' -Arguments @('spring-boot:run')
        }
        'Test' {
            Invoke-DevCommand -FilePath './mvnw.cmd' -Arguments @('-B', 'test')
        }
        'Compile' {
            Invoke-DevCommand -FilePath './mvnw.cmd' -Arguments @('-B', 'test-compile')
        }
    }
}
finally {
    if ($locationPushed) { Pop-Location }
    foreach ($key in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
}
