<#
.SYNOPSIS
    Runner & Development Launcher for Media Cataloger Web UI & REST Server.

.DESCRIPTION
    Launches and manages the React 19 Frontend and NestJS Server.

.EXAMPLE
    .\run.ps1              # Run NestJS server with auto-reload (port 8000)
    .\run.ps1 dev          # Run Vite frontend dev server (port 5173 / proxy)
    .\run.ps1 server       # Run NestJS server with auto-reload (port 8000)
    .\run.ps1 build        # Build React bundle and NestJS server
    .\run.ps1 test         # Run full test suite
    .\run.ps1 up           # Launch Docker container (port 8000)
    .\run.ps1 down         # Stop Docker container
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command = "server",

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "       Media Cataloger Web UI - Command Runner           " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

switch ($Command.ToLower()) {
    { $_ -in @("dev", "client") } {
        npm run dev -- @ExtraArgs
    }
    { $_ -in @("server", "server:dev", "api") } {
        npm run server:dev -- @ExtraArgs
    }
    { $_ -in @("build") } {
        npm run build
        npm run server:build
    }
    { $_ -in @("test") } {
        npm test -- @ExtraArgs
    }
    { $_ -in @("typecheck") } {
        npm run typecheck
    }
    { $_ -in @("up", "docker") } {
        docker compose up -d @ExtraArgs
    }
    { $_ -in @("down") } {
        docker compose down @ExtraArgs
    }
    default {
        Write-Host "Starting NestJS Server on port 8000..." -ForegroundColor Green
        npm run server:dev
    }
}
