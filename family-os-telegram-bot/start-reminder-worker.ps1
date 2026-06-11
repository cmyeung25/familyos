param(
    [switch]$NoExitProcess
)

$ErrorActionPreference = "Stop"

function Import-UserEnvironmentVariable([string]$Name) {
    if (-not [Environment]::GetEnvironmentVariable($Name, "Process")) {
        $value = [Environment]::GetEnvironmentVariable($Name, "User")
        if ($value) {
            [Environment]::SetEnvironmentVariable($Name, $value, "Process")
        }
    }
}

foreach ($name in @(
    "TELEGRAM_BOT_TOKEN",
    "FAMILY_OS_API_URL",
    "FAMILY_OS_API_KEY"
)) {
    Import-UserEnvironmentVariable $name
}

$botConfigPath = Join-Path $PSScriptRoot "local-bot-config.json"
if (Test-Path -LiteralPath $botConfigPath) {
    $botConfig = Get-Content -LiteralPath $botConfigPath -Encoding utf8 -Raw | ConvertFrom-Json
    if (-not $env:TELEGRAM_BOT_TOKEN -and $botConfig.telegram_bot_token_dpapi) {
        $secureTelegramToken = ConvertTo-SecureString $botConfig.telegram_bot_token_dpapi
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureTelegramToken)
        try {
            $env:TELEGRAM_BOT_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        }
        finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

$apiConfigPath = Join-Path $PSScriptRoot "..\family-os-apps-script\local-api-config.json"
if ((-not $env:FAMILY_OS_API_URL -or -not $env:FAMILY_OS_API_KEY) -and (Test-Path -LiteralPath $apiConfigPath)) {
    $config = Get-Content -LiteralPath $apiConfigPath -Encoding utf8 -Raw | ConvertFrom-Json
    if (-not $env:FAMILY_OS_API_URL) {
        $env:FAMILY_OS_API_URL = [string]$config.api_url
    }
    if (-not $env:FAMILY_OS_API_KEY) {
        $secureApiKey = ConvertTo-SecureString $config.api_key_dpapi
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)
        try {
            $env:FAMILY_OS_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        }
        finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

if (-not $env:TELEGRAM_BOT_TOKEN) {
    throw "TELEGRAM_BOT_TOKEN is not configured. Run configure-local-bot.ps1."
}
if (-not $env:FAMILY_OS_API_URL -or -not $env:FAMILY_OS_API_KEY) {
    throw "Family OS API is not configured. Run ..\family-os-apps-script\configure-local-api.ps1."
}

& node --use-system-ca (Join-Path $PSScriptRoot "reminder_worker.mjs") @args
$exitCode = $LASTEXITCODE
if ($NoExitProcess) {
    return
}
exit $exitCode
