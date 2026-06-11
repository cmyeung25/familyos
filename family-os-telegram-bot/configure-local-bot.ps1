$ErrorActionPreference = "Stop"
$configPath = Join-Path $PSScriptRoot "local-bot-config.json"
$existingConfig = if (Test-Path -LiteralPath $configPath) {
    Get-Content -LiteralPath $configPath -Encoding utf8 -Raw | ConvertFrom-Json
}
else {
    $null
}

function Read-Secret([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

$telegramToken = Read-Secret "Enter TELEGRAM_BOT_TOKEN from BotFather, or leave blank to keep the saved token"
$allowedUserIds = Read-Host "Enter allowed Telegram user IDs, comma-separated; leave blank to keep the saved value or for first /whoami"

$telegramToken = $telegramToken.Trim()
$allowedUserIds = $allowedUserIds.Trim()

if ([string]::IsNullOrWhiteSpace($telegramToken) -and -not $existingConfig.telegram_bot_token_dpapi) {
    throw "TELEGRAM_BOT_TOKEN is required during first-time setup."
}
if (-not [string]::IsNullOrWhiteSpace($telegramToken) -and $telegramToken -notmatch '^\d+:[A-Za-z0-9_-]+$') {
    throw "TELEGRAM_BOT_TOKEN format is invalid. Paste only the token value returned by @BotFather."
}
if (-not [string]::IsNullOrWhiteSpace($allowedUserIds) -and $allowedUserIds -notmatch '^\d+(,\s*\d+)*$') {
    throw "Telegram user IDs must be comma-separated numbers."
}

$encryptedTelegramToken = if (-not [string]::IsNullOrWhiteSpace($telegramToken)) {
    ConvertFrom-SecureString (ConvertTo-SecureString $telegramToken -AsPlainText -Force)
}
else {
    [string]$existingConfig.telegram_bot_token_dpapi
}

$savedAllowedUserIds = if (-not [string]::IsNullOrWhiteSpace($allowedUserIds)) {
    $allowedUserIds
}
else {
    [string]$existingConfig.telegram_allowed_user_ids
}

@{
    telegram_bot_token_dpapi = $encryptedTelegramToken
    telegram_allowed_user_ids = $savedAllowedUserIds
} | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8

Write-Output "Telegram Bot encrypted local configuration saved."
if ([string]::IsNullOrWhiteSpace($savedAllowedUserIds)) {
    Write-Output "Allowlist is empty. Start the bot and send /whoami, then run this setup again with your Telegram user ID."
}
Write-Output "Natural-language routing will use the local Codex login. No OpenAI Platform API key is required."
Write-Output "If 'codex login status' says Not logged in, run 'codex login --device-auth' in the same Windows user session."
Write-Output "Start the bot with: .\family-os-telegram-bot\start-bot.cmd"
