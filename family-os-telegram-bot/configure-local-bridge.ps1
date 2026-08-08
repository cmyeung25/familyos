$ErrorActionPreference = "Stop"

$apiConfigPath = Join-Path $PSScriptRoot "..\family-os-apps-script\local-api-config.json"
$userApiUrl = [Environment]::GetEnvironmentVariable("FAMILY_OS_API_URL", "User")
$userApiKey = [Environment]::GetEnvironmentVariable("FAMILY_OS_API_KEY", "User")

if ((-not $userApiUrl -or -not $userApiKey) -and -not (Test-Path -LiteralPath $apiConfigPath)) {
    if ($env:FAMILY_OS_API_URL -and $env:FAMILY_OS_API_KEY) {
        Write-Output "Saving the current Family OS API configuration for standalone bot startup."
        [Environment]::SetEnvironmentVariable("FAMILY_OS_API_URL", $env:FAMILY_OS_API_URL, "User")
        [Environment]::SetEnvironmentVariable("FAMILY_OS_API_KEY", $env:FAMILY_OS_API_KEY, "User")
        $secureApiKey = ConvertTo-SecureString $env:FAMILY_OS_API_KEY -AsPlainText -Force
        @{
            api_url = $env:FAMILY_OS_API_URL
            api_key_dpapi = ConvertFrom-SecureString $secureApiKey
        } | ConvertTo-Json | Set-Content -LiteralPath $apiConfigPath -Encoding utf8
    }
    else {
        Write-Output "Configure the Family OS Google Sheets API first."
        & (Join-Path $PSScriptRoot "..\family-os-apps-script\configure-local-api.ps1")
    }
}
else {
    Write-Output "Existing Family OS API configuration found."
}

& (Join-Path $PSScriptRoot "configure-local-bot.ps1")

$env:FAMILY_OS_BOT_CHECK_ONLY = "1"
try {
    $startBotScript = Join-Path $PSScriptRoot "start-bot.ps1"
    if (-not (Test-Path -LiteralPath $startBotScript)) {
        $startBotScript = Join-Path $PSScriptRoot "start-bot-deepseek.ps1"
    }
    & $startBotScript
}
finally {
    Remove-Item Env:FAMILY_OS_BOT_CHECK_ONLY -ErrorAction SilentlyContinue
}

Write-Output ""
Write-Output "Local Telegram Codex Bridge configuration passed."
Write-Output "Start the bot with: .\family-os-telegram-bot\start-bot.cmd"
