$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "instance-paths.ps1")
$paths = Get-FamilyOsBotPaths -ScriptRoot $PSScriptRoot
Initialize-FamilyOsBotRuntime -Paths $paths

$botTaskName = "FamilyOSBot"
$botDir = $PSScriptRoot
$heartbeatPath = $paths.BotHeartbeatPath
$supervisorStatePath = $paths.BotSupervisorStatePath
$lockPath = $paths.BotLockPath
$logPath = $paths.BotWatchdogLogPath
$staleMinutes = 5

function Write-WatchdogLog([string]$Message) {
    $timestamp = Get-Date -Format o
    Ensure-FamilyOsParentDirectory -Path $logPath
    Add-Content -LiteralPath $logPath -Value "[$timestamp] $Message"
}

function Read-Heartbeat {
    if (-not (Test-Path -LiteralPath $heartbeatPath)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $heartbeatPath -Encoding utf8 -Raw | ConvertFrom-Json
    }
    catch {
        Write-WatchdogLog "Heartbeat file is unreadable."
        return $null
    }
}

function Read-SupervisorState {
    if (-not (Test-Path -LiteralPath $supervisorStatePath)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $supervisorStatePath -Encoding utf8 -Raw | ConvertFrom-Json
    }
    catch {
        Write-WatchdogLog "Supervisor state file is unreadable."
        return $null
    }
}

function Get-LockPid {
    if (-not (Test-Path -LiteralPath $lockPath)) {
        return $null
    }
    try {
        $text = (Get-Content -LiteralPath $lockPath -Encoding utf8 -Raw).Trim()
        if (-not $text) {
            return $null
        }
        return [int]$text
    }
    catch {
        return $null
    }
}

function Test-PidAlive([Nullable[int]]$ProcessId) {
    if (-not $ProcessId) {
        return $false
    }
    try {
        Get-Process -Id $ProcessId -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Restart-Bot([string]$Reason) {
    Write-WatchdogLog "Restarting bot: $Reason"

    $heartbeat = Read-Heartbeat
    $supervisorState = Read-SupervisorState
    $candidatePids = @()
    if ($supervisorState -and $supervisorState.supervisor_pid) {
        $candidatePids += [int]$supervisorState.supervisor_pid
    }
    if ($heartbeat -and $heartbeat.pid) {
        $candidatePids += [int]$heartbeat.pid
    }
    $lockPid = Get-LockPid
    if ($lockPid) {
        $candidatePids += $lockPid
    }
    $candidatePids = $candidatePids | Select-Object -Unique

    foreach ($processId in $candidatePids) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
        catch {
        }
    }

    if (Test-Path -LiteralPath $lockPath) {
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    }

    Start-ScheduledTask -TaskName $botTaskName
}

$supervisorState = Read-SupervisorState
$heartbeat = Read-Heartbeat
if (-not $heartbeat) {
    if ($supervisorState) {
        Restart-Bot ("missing heartbeat; supervisor_status={0} supervisor_pid={1}" -f [string]$supervisorState.status, [string]$supervisorState.supervisor_pid)
    }
    else {
        Restart-Bot "missing heartbeat"
    }
    exit 0
}

$heartbeatTime = $null
try {
    $heartbeatTime = [DateTimeOffset]::Parse([string]$heartbeat.timestamp)
}
catch {
    Restart-Bot "invalid heartbeat timestamp"
    exit 0
}

$heartbeatAge = (Get-Date) - $heartbeatTime.LocalDateTime
if ($heartbeatAge.TotalMinutes -gt $staleMinutes) {
    $reason = "stale heartbeat age={0:N1}m status={1}" -f $heartbeatAge.TotalMinutes, [string]$heartbeat.status
    if ($supervisorState) {
        $reason = "{0} supervisor_status={1} supervisor_pid={2}" -f $reason, [string]$supervisorState.status, [string]$supervisorState.supervisor_pid
    }
    Restart-Bot $reason
    exit 0
}

$lockPid = Get-LockPid
if ($lockPid -and -not (Test-PidAlive $lockPid)) {
    Restart-Bot "lock pid is not alive"
    exit 0
}

if ($supervisorState -and $supervisorState.supervisor_pid -and -not (Test-PidAlive ([int]$supervisorState.supervisor_pid))) {
    Restart-Bot "supervisor pid is not alive"
    exit 0
}

if ($heartbeat.pid -and -not (Test-PidAlive ([int]$heartbeat.pid))) {
    Restart-Bot "heartbeat pid is not alive"
    exit 0
}

if ($supervisorState) {
    Write-WatchdogLog ("Bot healthy: pid={0} status={1} age={2:N1}m supervisor_pid={3} supervisor_status={4}" -f [string]$heartbeat.pid, [string]$heartbeat.status, $heartbeatAge.TotalMinutes, [string]$supervisorState.supervisor_pid, [string]$supervisorState.status)
}
else {
    Write-WatchdogLog ("Bot healthy: pid={0} status={1} age={2:N1}m" -f [string]$heartbeat.pid, [string]$heartbeat.status, $heartbeatAge.TotalMinutes)
}
