$ErrorActionPreference = "Stop"

$configPath = Join-Path $PSScriptRoot "local-bot-config.json"
$statusPath = Join-Path $PSScriptRoot "local-codex-key-status.txt"

function Write-SetupStatus([string]$Status) {
    Set-Content -LiteralPath $statusPath -Value $Status -Encoding utf8
}

Write-SetupStatus "started"
try {
    if (-not (Test-Path -LiteralPath $configPath)) {
        throw "Telegram Bot local configuration is missing. Run configure-local-bot-window.ps1 first."
    }

    $config = Get-Content -LiteralPath $configPath -Encoding utf8 -Raw | ConvertFrom-Json
    $secureCodexApiKey = Read-Host "Enter CODEX_API_KEY for the local Codex Bridge" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCodexApiKey)
    try {
        $codexApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        if ([string]::IsNullOrWhiteSpace($codexApiKey)) {
            throw "CODEX_API_KEY is required."
        }
        if ($codexApiKey -notmatch '^sk-[A-Za-z0-9_-]+$') {
            throw "CODEX_API_KEY must be an OpenAI Platform API key starting with sk-. Do not enter the Family OS API key or Telegram token."
        }
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }

    $config | Add-Member -NotePropertyName codex_api_key_dpapi -NotePropertyValue (ConvertFrom-SecureString $secureCodexApiKey) -Force
    $config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
    Write-SetupStatus "completed"
    Write-Host ""
    Write-Host "CODEX_API_KEY encrypted local configuration saved." -ForegroundColor Green
}
catch {
    Write-SetupStatus "failed: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "CODEX_API_KEY local configuration failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close this window"
