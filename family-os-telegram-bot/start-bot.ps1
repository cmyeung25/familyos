$ErrorActionPreference = "Stop"

$processPath = [Environment]::GetEnvironmentVariable("Path", "Process")
if ($processPath) {
    [Environment]::SetEnvironmentVariable("PATH", $null, "Process")
    [Environment]::SetEnvironmentVariable("Path", $processPath, "Process")
}

function Sync-CodexAuth([string]$SeedAuthPath, [string]$LocalAuthPath) {
    if (-not (Test-Path -LiteralPath $SeedAuthPath)) {
        return
    }

    if (-not (Test-Path -LiteralPath $LocalAuthPath)) {
        Copy-Item -LiteralPath $SeedAuthPath -Destination $LocalAuthPath -Force
        return
    }

    $seedItem = Get-Item -LiteralPath $SeedAuthPath
    $localItem = Get-Item -LiteralPath $LocalAuthPath
    if ($seedItem.LastWriteTimeUtc -gt $localItem.LastWriteTimeUtc) {
        Copy-Item -LiteralPath $SeedAuthPath -Destination $LocalAuthPath -Force
    }
}

function Sync-CodexConfig([string]$LocalCodexHome, [string]$WorkspaceRoot) {
    $configPath = Join-Path $LocalCodexHome "config.toml"
    $projectKey = $WorkspaceRoot.ToLowerInvariant()
    $modelName = if ($env:FAMILY_OS_AGENT_MODEL) { $env:FAMILY_OS_AGENT_MODEL } else { "gpt-5.4" }
    @"
model = "$modelName"
model_reasoning_effort = "medium"
approval_policy = "never"
sandbox_mode = "workspace-write"

[windows]
sandbox = "elevated"

[projects.'$projectKey']
trust_level = "trusted"

[sandbox_workspace_write]
network_access = true
writable_roots = ['$WorkspaceRoot']
"@ | Set-Content -LiteralPath $configPath -Encoding utf8
}

function Reset-LogFile([string]$Path) {
    Set-Content -LiteralPath $Path -Value "" -Encoding utf8
}

function Get-SupervisorMode {
    if ($env:FAMILY_OS_BOT_SUPERVISOR -eq "1") {
        return "background"
    }
    return "foreground"
}

function Write-SupervisorLog([string]$Path, [string]$Message) {
    $timestamp = Get-Date -Format o
    Add-Content -LiteralPath $Path -Encoding utf8 -Value "[$timestamp] $Message"
}

function Write-SupervisorState(
    [string]$Path,
    [string]$Mode,
    [string]$Status,
    [int]$RestartCount,
    [Nullable[int]]$LastBotExitCode,
    [Nullable[int]]$ActiveBotPid,
    [Nullable[int]]$SupervisorPid = $null
) {
    $payload = [ordered]@{
        supervisor_pid = if ($SupervisorPid) { $SupervisorPid } else { $PID }
        mode = $Mode
        status = $Status
        timestamp = (Get-Date).ToString("o")
        restart_count = $RestartCount
        last_bot_exit_code = $LastBotExitCode
        active_bot_pid = $ActiveBotPid
    }
    $payload | ConvertTo-Json | Set-Content -LiteralPath $Path -Encoding utf8
}

$localCodexHome = Join-Path $PSScriptRoot ".codex-home"
New-Item -ItemType Directory -Force -Path $localCodexHome | Out-Null
$env:CODEX_HOME = $localCodexHome
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$seedCodexHome = Join-Path $env:USERPROFILE ".codex"
$seedAuthPath = Join-Path $seedCodexHome "auth.json"
$localAuthPath = Join-Path $localCodexHome "auth.json"
Sync-CodexAuth -SeedAuthPath $seedAuthPath -LocalAuthPath $localAuthPath
Sync-CodexConfig -LocalCodexHome $localCodexHome -WorkspaceRoot $workspaceRoot

function Import-UserEnvironmentVariable([string]$Name) {
    if (-not [Environment]::GetEnvironmentVariable($Name, "Process")) {
        $value = [Environment]::GetEnvironmentVariable($Name, "User")
        if ($value) {
            [Environment]::SetEnvironmentVariable($Name, $value, "Process")
        }
    }
}

function Add-ChildEnvironmentVariable([System.Collections.Generic.List[string]]$CommandParts, [string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ($null -eq $value) {
        return
    }

    $escapedValue = $value.Replace("'", "''")
    $CommandParts.Add("`$env:$Name = '$escapedValue'")
}

function Start-HiddenSupervisorProcess(
    [string]$WorkingDirectory,
    [string]$Command,
    [string]$PowershellPath
) {
    try {
        $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
        $commandLine = "`"$PowershellPath`" -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedCommand"
        $startup = ([wmiclass]"Win32_ProcessStartup").CreateInstance()
        $startup.ShowWindow = 0
        $childPid = 0
        $result = ([wmiclass]"Win32_Process").Create($commandLine, $WorkingDirectory, $startup, [ref]$childPid)
        if ($result -ne 0) {
            throw "Win32_Process.Create returned $result"
        }
        return $childPid
    }
    catch {
        $process = Start-Process -WindowStyle Hidden -WorkingDirectory $WorkingDirectory -FilePath $PowershellPath -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $Command) -PassThru
        return $process.Id
    }
}

function Ensure-ReminderSupervisor([string]$BotScriptRoot) {
    if ($env:FAMILY_OS_SKIP_REMINDER_SUPERVISOR -eq "1") {
        return
    }
    $scriptPath = Join-Path $BotScriptRoot "start-reminder-supervisor.ps1"
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        return
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath | Out-Null
}

foreach ($name in @(
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_ALLOWED_USER_IDS",
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
    if (-not $env:TELEGRAM_ALLOWED_USER_IDS -and $botConfig.telegram_allowed_user_ids) {
        $env:TELEGRAM_ALLOWED_USER_IDS = [string]$botConfig.telegram_allowed_user_ids
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
if (-not $env:TELEGRAM_ALLOWED_USER_IDS) {
    Write-Output "TELEGRAM_ALLOWED_USER_IDS is empty. Bot will still try the Sheets/API Telegram allowlist; otherwise only /whoami will be available until you configure one."
}
Write-Output "Codex home: $localCodexHome"

if ($env:FAMILY_OS_SKIP_SKILL_SYNC -ne "1") {
    & node (Join-Path $PSScriptRoot "sync_skills.mjs")
    if ($LASTEXITCODE -ne 0) {
        throw "Family OS skill sync failed."
    }
}

if ($env:FAMILY_OS_BOT_CHECK_ONLY -eq "1") {
    Write-Output "Family OS Telegram Bot configuration is available."
    exit 0
}

Ensure-ReminderSupervisor -BotScriptRoot $PSScriptRoot

if ($env:FAMILY_OS_BOT_DETACH -eq "1" -and $env:FAMILY_OS_BOT_SUPERVISOR -ne "1") {
    $stdoutPath = Join-Path $PSScriptRoot "bot-runtime.out.log"
    $stderrPath = Join-Path $PSScriptRoot "bot-runtime.err.log"
    $supervisorStatePath = Join-Path $PSScriptRoot "bot-supervisor-state.json"
    $supervisorLogPath = Join-Path $PSScriptRoot "bot-supervisor.log"
    $supervisorOutPath = Join-Path $PSScriptRoot "bot-supervisor.out.log"
    $supervisorErrPath = Join-Path $PSScriptRoot "bot-supervisor.err.log"
    foreach ($logPath in @($stdoutPath, $stderrPath, $supervisorOutPath, $supervisorErrPath)) {
        Reset-LogFile -Path $logPath
    }
    Write-SupervisorLog -Path $supervisorLogPath -Message "Launching hidden background supervisor."

    $scriptPath = $PSCommandPath.Replace("'", "''")
    $scriptRootQuoted = $PSScriptRoot.Replace("'", "''")
    $supervisorOutQuoted = $supervisorOutPath.Replace("'", "''")
    $supervisorErrQuoted = $supervisorErrPath.Replace("'", "''")
    $childCommandParts = [System.Collections.Generic.List[string]]::new()
    $childCommandParts.Add('$ErrorActionPreference = ''Stop''')
    $childCommandParts.Add('$env:FAMILY_OS_BOT_SUPERVISOR = ''1''')
    $childCommandParts.Add('Remove-Item Env:FAMILY_OS_BOT_DETACH -ErrorAction SilentlyContinue')
    if ($env:FAMILY_OS_SKIP_SKILL_SYNC -eq "1") {
        $childCommandParts.Add('$env:FAMILY_OS_SKIP_SKILL_SYNC = ''1''')
    }
    else {
        $childCommandParts.Add('Remove-Item Env:FAMILY_OS_SKIP_SKILL_SYNC -ErrorAction SilentlyContinue')
    }
    foreach ($name in @(
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_ALLOWED_USER_IDS",
        "FAMILY_OS_API_URL",
        "FAMILY_OS_API_KEY",
        "CODEX_HOME"
    )) {
        Add-ChildEnvironmentVariable -CommandParts $childCommandParts -Name $name
    }
    $childCommandParts.Add("Set-Location '$scriptRootQuoted'")
    $childCommandParts.Add("& '$scriptPath' 1>> '$supervisorOutQuoted' 2>> '$supervisorErrQuoted'")
    $supervisorCommand = "& { " + ($childCommandParts -join "; ") + " }"
    $powershellPath = Join-Path $PSHOME "powershell.exe"
    $supervisorPid = Start-HiddenSupervisorProcess -WorkingDirectory $PSScriptRoot -Command $supervisorCommand -PowershellPath $powershellPath
    Write-SupervisorState -Path $supervisorStatePath -Mode "background" -Status "launching" -RestartCount 0 -LastBotExitCode $null -ActiveBotPid $null -SupervisorPid $supervisorPid
    Write-SupervisorLog -Path $supervisorLogPath -Message "Hidden background supervisor started. pid=$supervisorPid"
    Write-Output "Family OS Telegram Bot supervisor PID: $supervisorPid"
    exit 0
}

$supervisorStatePath = Join-Path $PSScriptRoot "bot-supervisor-state.json"
$supervisorLogPath = Join-Path $PSScriptRoot "bot-supervisor.log"
$runtimeOutPath = Join-Path $PSScriptRoot "bot-runtime.out.log"
$runtimeErrPath = Join-Path $PSScriptRoot "bot-runtime.err.log"
$supervisorMode = Get-SupervisorMode
$nodePath = (Get-Command node).Source
$restartCount = 0
$windowStartedAt = Get-Date
Write-SupervisorLog -Path $supervisorLogPath -Message "Supervisor starting. mode=$supervisorMode skip_skill_sync=$($env:FAMILY_OS_SKIP_SKILL_SYNC -eq '1')"
Write-SupervisorState -Path $supervisorStatePath -Mode $supervisorMode -Status "starting" -RestartCount 0 -LastBotExitCode $null -ActiveBotPid $null

while ($true) {
    Write-SupervisorLog -Path $supervisorLogPath -Message "Launching bot.mjs. mode=$supervisorMode restart_count=$restartCount"
    Write-SupervisorState -Path $supervisorStatePath -Mode $supervisorMode -Status "starting_bot" -RestartCount $restartCount -LastBotExitCode $null -ActiveBotPid $null

    if ($supervisorMode -eq "background") {
        $botProcess = Start-Process -WindowStyle Hidden -WorkingDirectory $PSScriptRoot -FilePath $nodePath -ArgumentList @("--use-system-ca", "bot.mjs") -RedirectStandardOutput $runtimeOutPath -RedirectStandardError $runtimeErrPath -PassThru
    }
    else {
        $botProcess = Start-Process -NoNewWindow -WorkingDirectory $PSScriptRoot -FilePath $nodePath -ArgumentList @("--use-system-ca", "bot.mjs") -PassThru
    }
    Write-SupervisorLog -Path $supervisorLogPath -Message "bot.mjs started. pid=$($botProcess.Id)"
    Write-SupervisorState -Path $supervisorStatePath -Mode $supervisorMode -Status "bot_running" -RestartCount $restartCount -LastBotExitCode $null -ActiveBotPid $botProcess.Id
    $botProcess.WaitForExit()
    try {
        $exitCode = $botProcess.ExitCode
    }
    catch {
        $exitCode = $null
    }
    if ($null -eq $exitCode) {
        $exitCode = -1
    }

    if ($exitCode -eq 0) {
        Write-SupervisorLog -Path $supervisorLogPath -Message "bot.mjs exited cleanly with code 0. Supervisor stopping."
        Write-SupervisorState -Path $supervisorStatePath -Mode $supervisorMode -Status "stopped" -RestartCount $restartCount -LastBotExitCode 0 -ActiveBotPid $null
        exit 0
    }

    $restartCount += 1
    $now = Get-Date
    if (($now - $windowStartedAt).TotalMinutes -ge 10) {
        $windowStartedAt = $now
        $restartCount = 1
    }

    Write-Output ("[{0}] bot.mjs exited with code {1}; restarting." -f $now.ToString("o"), $exitCode)
    Write-SupervisorLog -Path $supervisorLogPath -Message ("bot.mjs exited with code {0}; restart_count={1}" -f $exitCode, $restartCount)

    $delaySeconds = 5
    if ($restartCount -ge 5) {
        $delaySeconds = 30
        Write-Output ("[{0}] Too many bot restarts in the last 10 minutes; using a longer backoff." -f $now.ToString("o"))
    }
    Write-SupervisorLog -Path $supervisorLogPath -Message ("Sleeping {0}s before restart." -f $delaySeconds)
    Write-SupervisorState -Path $supervisorStatePath -Mode $supervisorMode -Status "waiting_to_restart" -RestartCount $restartCount -LastBotExitCode $exitCode -ActiveBotPid $null

    Start-Sleep -Seconds $delaySeconds
}
