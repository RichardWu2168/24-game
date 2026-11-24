#requires -Version 5.1
[CmdletBinding()]
param([switch]$SkipDocker)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This installer is intended for Windows.' }
. (Join-Path $PSScriptRoot 'Dev-Common.ps1')

function Refresh-ProcessPath {
    $pathSources = @(
        [Environment]::GetEnvironmentVariable('Path', 'Machine')
        [Environment]::GetEnvironmentVariable('Path', 'User')
        $env:Path
    )
    $entries = foreach ($source in $pathSources) {
        if ($source) {
            foreach ($entry in ($source -split ';')) {
                if ($entry.Trim()) { $entry.Trim() }
            }
        }
    }
    $env:Path = ($entries | Select-Object -Unique) -join ';'
}

function Install-WinGetPackage {
    param([Parameter(Mandatory = $true)][string]$Id)
    Write-Host "Installing $Id..."
    Invoke-DevCommand -FilePath 'winget.exe' -Arguments @(
        'install', '--id', $Id, '--exact', '--source', 'winget',
        '--accept-source-agreements', '--accept-package-agreements'
    )
    Refresh-ProcessPath
}

if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw 'WinGet is missing. Install/update Microsoft App Installer, then reopen PowerShell.'
}
Refresh-ProcessPath

if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    Install-WinGetPackage -Id 'Git.Git'
}

try { Assert-CompatibleNode }
catch {
    Install-WinGetPackage -Id 'OpenJS.NodeJS.LTS'
    Assert-CompatibleNode
}

try { Use-Jdk25 }
catch {
    Install-WinGetPackage -Id 'Microsoft.OpenJDK.25'
    Use-Jdk25
}

if (-not (Get-Command code.cmd -ErrorAction SilentlyContinue)) {
    Install-WinGetPackage -Id 'Microsoft.VisualStudioCode'
}
if (-not (Get-Command code.cmd -ErrorAction SilentlyContinue)) {
    throw 'VS Code was installed but code.cmd is unavailable. Reopen PowerShell and rerun this script.'
}
foreach ($extension in @(
    'Angular.ng-template',
    'vscjava.vscode-java-pack',
    'vmware.vscode-boot-dev-pack'
)) {
    Invoke-DevCommand -FilePath 'code.cmd' -Arguments @('--install-extension', $extension)
}

if (-not $SkipDocker) {
    if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
        Install-WinGetPackage -Id 'Docker.DockerDesktop'
    }
    Write-Host 'Open Docker Desktop and complete its first-run setup before starting PostgreSQL.'
    Write-Host 'If Docker requests WSL setup or a restart, complete that step before continuing.'
}

Write-Host ''
Write-Host 'Development tools installed. Reopen PowerShell (and VS Code) to refresh environment settings.'
Write-Host 'Next: run ./scripts/Initialize-Dev.ps1 from angular-java-fullstack.'
