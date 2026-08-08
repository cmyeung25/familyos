$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot ".."))

function Resolve-FamilyOsPath([string]$Value, [string]$Fallback, [string]$BasePath) {
    $candidate = if ([string]::IsNullOrWhiteSpace($Value)) { $Fallback } else { $Value }
    if ([System.IO.Path]::IsPathRooted($candidate)) {
        return [System.IO.Path]::GetFullPath($candidate)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $candidate))
}

function Import-FamilyOsEnvironmentFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    Get-Content -LiteralPath $Path -Encoding utf8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            return
        }
        if ($line.StartsWith("export ")) {
            $line = $line.Substring(7).Trim()
        }

        $separatorIndex = $line.IndexOf("=")
        if ($separatorIndex -lt 1) {
            return
        }

        $name = $line.Substring(0, $separatorIndex).Trim()
        if ($name -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
            return
        }
        if ($null -ne [Environment]::GetEnvironmentVariable($name, "Process")) {
            return
        }

        $value = $line.Substring($separatorIndex + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

function Import-DpapiSecret([string]$EncryptedValue) {
    if ([string]::IsNullOrWhiteSpace($EncryptedValue)) {
        return ""
    }
    $secureValue = ConvertTo-SecureString $EncryptedValue
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

$defaultInstanceRoot = Join-Path $workspaceRoot "instances\gary"
if (-not (Test-Path -LiteralPath $defaultInstanceRoot)) {
    $defaultInstanceRoot = $scriptRoot
}

$instanceRoot = Resolve-FamilyOsPath $env:FAMILY_OS_INSTANCE_ROOT $defaultInstanceRoot $workspaceRoot
$configRoot = Resolve-FamilyOsPath $env:FAMILY_OS_CONFIG_ROOT (Join-Path $instanceRoot "config") $workspaceRoot
$stateRoot = Resolve-FamilyOsPath $env:FAMILY_OS_STATE_ROOT (Join-Path $instanceRoot "state") $workspaceRoot
$logsRoot = Resolve-FamilyOsPath $env:FAMILY_OS_LOGS_ROOT (Join-Path $instanceRoot "logs") $workspaceRoot

foreach ($directoryPath in @($instanceRoot, $configRoot, $stateRoot, $logsRoot)) {
    New-Item -ItemType Directory -Force -Path $directoryPath | Out-Null
}

Import-FamilyOsEnvironmentFile -Path (Join-Path $instanceRoot ".env")

$env:FAMILY_OS_WORKSPACE = $workspaceRoot
$env:FAMILY_OS_INSTANCE_ROOT = $instanceRoot
$env:FAMILY_OS_CONFIG_ROOT = $configRoot
$env:FAMILY_OS_STATE_ROOT = $stateRoot
$env:FAMILY_OS_LOGS_ROOT = $logsRoot
$env:FAMILY_OS_CODEX_HOME = Resolve-FamilyOsPath $env:FAMILY_OS_CODEX_HOME (Join-Path $instanceRoot ".codex-home") $workspaceRoot
$env:CODEX_HOME = $env:FAMILY_OS_CODEX_HOME
$env:FAMILY_OS_SKILLS_ROOT = Resolve-FamilyOsPath $env:FAMILY_OS_SKILLS_ROOT (Join-Path $workspaceRoot ".agents\skills") $workspaceRoot
$env:FAMILY_OS_RUNTIME_CONFIG_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_RUNTIME_CONFIG_PATH (Join-Path $workspaceRoot "plugins-staging\family-os-bb-inventory\runtime\telegram-runtime.json") $workspaceRoot
$env:FAMILY_OS_BOT_CONFIG_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_BOT_CONFIG_PATH (Join-Path $instanceRoot "secrets\local-bot-config.json") $workspaceRoot
$env:FAMILY_OS_API_CONFIG_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_API_CONFIG_PATH (Join-Path $instanceRoot "secrets\local-api-config.json") $workspaceRoot
$env:FAMILY_OS_REMINDER_CONFIG_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_REMINDER_CONFIG_PATH (Join-Path $configRoot "reminder-config.json") $workspaceRoot
$env:FAMILY_OS_BRIDGE_STATE_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_BRIDGE_STATE_PATH (Join-Path $stateRoot ".codex-bridge-state.json") $workspaceRoot
$env:FAMILY_OS_BRIDGE_ERROR_LOG_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_BRIDGE_ERROR_LOG_PATH (Join-Path $logsRoot "bridge-error.log") $workspaceRoot
$env:FAMILY_OS_BOT_LOCK_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_BOT_LOCK_PATH (Join-Path $stateRoot "bot.lock") $workspaceRoot
$env:FAMILY_OS_BOT_ACTIVITY_LOG_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_BOT_ACTIVITY_LOG_PATH (Join-Path $logsRoot "bot-activity.log") $workspaceRoot
$env:FAMILY_OS_BOT_FATAL_LOG_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_BOT_FATAL_LOG_PATH (Join-Path $logsRoot "bot-fatal.log") $workspaceRoot
$env:FAMILY_OS_BOT_STARTUP_DEBUG_LOG_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_BOT_STARTUP_DEBUG_LOG_PATH (Join-Path $logsRoot "bot-startup-debug.log") $workspaceRoot
$env:FAMILY_OS_BOT_RUNTIME_STATE_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_BOT_RUNTIME_STATE_PATH (Join-Path $stateRoot "bot-runtime-state.json") $workspaceRoot
$env:FAMILY_OS_BOT_HEARTBEAT_PATH = Resolve-FamilyOsPath $env:FAMILY_OS_BOT_HEARTBEAT_PATH (Join-Path $stateRoot "bot-heartbeat.json") $workspaceRoot

if (Test-Path -LiteralPath $env:FAMILY_OS_BOT_CONFIG_PATH) {
    $botConfig = Get-Content -LiteralPath $env:FAMILY_OS_BOT_CONFIG_PATH -Encoding utf8 -Raw | ConvertFrom-Json
    if (-not $env:TELEGRAM_BOT_TOKEN -and $botConfig.telegram_bot_token_dpapi) {
        $env:TELEGRAM_BOT_TOKEN = Import-DpapiSecret $botConfig.telegram_bot_token_dpapi
    }
    if (-not $env:TELEGRAM_ALLOWED_USER_IDS -and $botConfig.telegram_allowed_user_ids) {
        $env:TELEGRAM_ALLOWED_USER_IDS = [string]$botConfig.telegram_allowed_user_ids
    }
}

if (Test-Path -LiteralPath $env:FAMILY_OS_API_CONFIG_PATH) {
    $apiConfig = Get-Content -LiteralPath $env:FAMILY_OS_API_CONFIG_PATH -Encoding utf8 -Raw | ConvertFrom-Json
    if (-not $env:FAMILY_OS_API_URL) {
        $env:FAMILY_OS_API_URL = [string]$apiConfig.api_url
    }
    if (-not $env:FAMILY_OS_API_KEY -and $apiConfig.api_key_dpapi) {
        $env:FAMILY_OS_API_KEY = Import-DpapiSecret $apiConfig.api_key_dpapi
    }
}

if (-not $env:TELEGRAM_BOT_TOKEN) {
    throw "TELEGRAM_BOT_TOKEN is not configured."
}
if (-not $env:FAMILY_OS_API_URL -or -not $env:FAMILY_OS_API_KEY) {
    throw "Family OS API is not configured."
}
if ($env:FAMILY_OS_LLM_PROVIDER -ne "deepseek") {
    throw "FAMILY_OS_LLM_PROVIDER must be deepseek for this fallback launcher."
}
if (-not $env:DEEPSEEK_API_KEY -and -not $env:FAMILY_OS_LLM_API_KEY) {
    throw "DeepSeek API key is not configured."
}

& node (Join-Path $scriptRoot "sync_skills.mjs")
if ($LASTEXITCODE -ne 0) {
    throw "Family OS skill sync failed."
}

if ($env:FAMILY_OS_BOT_CHECK_ONLY -eq "1") {
    Write-Output "Family OS Telegram Bot DeepSeek fallback configuration is available."
    exit 0
}

$process = Start-Process -FilePath "node.exe" -ArgumentList @("--use-system-ca", "bot.mjs") -WorkingDirectory $scriptRoot -WindowStyle Hidden -PassThru
Write-Output "Family OS Telegram Bot DeepSeek fallback PID: $($process.Id)"
