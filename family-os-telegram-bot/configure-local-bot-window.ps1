$ErrorActionPreference = "Stop"

$statusPath = Join-Path $PSScriptRoot "local-setup-status.txt"

function Write-SetupStatus([string]$Status) {
    Set-Content -LiteralPath $statusPath -Value $Status -Encoding utf8
}

Write-SetupStatus "started"
try {
    & (Join-Path $PSScriptRoot "configure-local-bot.ps1")
    Write-SetupStatus "completed"
    Write-Host ""
    Write-Host "Telegram Bot local configuration completed successfully." -ForegroundColor Green
}
catch {
    Write-SetupStatus "failed: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "Telegram Bot local configuration failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close this window"
