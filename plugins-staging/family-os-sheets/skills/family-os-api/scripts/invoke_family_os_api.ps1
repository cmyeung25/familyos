$ErrorActionPreference = "Stop"

$configPath = Join-Path $PSScriptRoot "..\..\..\family-os-apps-script\local-api-config.json"
if ((-not $env:FAMILY_OS_API_URL -or -not $env:FAMILY_OS_API_KEY) -and (Test-Path -LiteralPath $configPath)) {
    $config = Get-Content -LiteralPath $configPath -Encoding utf8 -Raw | ConvertFrom-Json
    $secureApiKey = ConvertTo-SecureString $config.api_key_dpapi
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)
    try {
        $env:FAMILY_OS_API_URL = [string]$config.api_url
        $env:FAMILY_OS_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

if (-not $env:FAMILY_OS_API_URL) {
    $env:FAMILY_OS_API_URL = [Environment]::GetEnvironmentVariable("FAMILY_OS_API_URL", "User")
}
if (-not $env:FAMILY_OS_API_KEY) {
    $env:FAMILY_OS_API_KEY = [Environment]::GetEnvironmentVariable("FAMILY_OS_API_KEY", "User")
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js is not available in PATH."
}

$client = Join-Path $PSScriptRoot "family_os_api_client.mjs"
& $node.Source --use-system-ca $client @args
exit $LASTEXITCODE
