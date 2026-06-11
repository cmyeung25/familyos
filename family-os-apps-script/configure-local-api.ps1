$ErrorActionPreference = "Stop"

$apiUrl = "https://script.google.com/macros/s/AKfycbz3JlKM3J3D6kSwJ54mzKPEPDpdqQmQFZYVOAGhaapbLdjgmvM37kSu4wFWYJXcoQQO/exec"
$configPath = Join-Path $PSScriptRoot "local-api-config.json"
$secureApiKey = Read-Host "Enter FAMILY_OS_API_KEY from Apps Script Project Settings" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)

try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 32) {
        throw "FAMILY_OS_API_KEY must contain at least 32 characters."
    }

    [Environment]::SetEnvironmentVariable("FAMILY_OS_API_URL", $apiUrl, "User")
    [Environment]::SetEnvironmentVariable("FAMILY_OS_API_KEY", $apiKey, "User")
    $encryptedApiKey = ConvertFrom-SecureString $secureApiKey
    @{
        api_url = $apiUrl
        api_key_dpapi = $encryptedApiKey
    } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8

    $body = @{
        api_key = $apiKey
        action = "health"
        payload = @{}
        actor_id = "local_setup"
    } | ConvertTo-Json -Depth 5

    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -ContentType "application/json" -Body $body
    if (-not $response.ok) {
        throw "Family OS API health check failed: $($response.error)"
    }

    Write-Output "Family OS API configured successfully."
    Write-Output "Schema version: $($response.result.schema_version)"
    Write-Output "Local DPAPI config saved for this Windows account."
}
finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    Remove-Variable apiKey -ErrorAction SilentlyContinue
}
