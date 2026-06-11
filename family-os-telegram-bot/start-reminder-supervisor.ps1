$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "instance-paths.ps1")
$paths = Get-FamilyOsBotPaths -ScriptRoot $PSScriptRoot
Initialize-FamilyOsBotRuntime -Paths $paths

function Import-UserEnvironmentVariable([string]$Name) {
    if (-not [Environment]::GetEnvironmentVariable($Name, "Process")) {
        $value = [Environment]::GetEnvironmentVariable($Name, "User")
        if ($value) {
            [Environment]::SetEnvironmentVariable($Name, $value, "Process")
        }
    }
}

function Start-HiddenProcess([string]$WorkingDirectory, [string]$Command) {
    $powershellPath = Join-Path $PSHOME "powershell.exe"
    $process = Start-Process -WindowStyle Hidden -WorkingDirectory $WorkingDirectory -FilePath $powershellPath -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command", $Command
    ) -PassThru
    return $process.Id
}

function Write-ReminderSupervisorLog([string]$Path, [string]$Message) {
    $timestamp = Get-Date -Format o
    Ensure-FamilyOsParentDirectory -Path $Path
    Add-Content -LiteralPath $Path -Encoding utf8 -Value "[$timestamp] $Message"
}

function Write-ReminderSupervisorState(
    [string]$Path,
    [string]$Status,
    [Nullable[int]]$WorkerExitCode = $null,
    [Nullable[int]]$SupervisorPid = $null
) {
    $payload = [ordered]@{
        supervisor_pid = if ($SupervisorPid) { $SupervisorPid } else { $PID }
        status = $Status
        timestamp = (Get-Date).ToString("o")
        last_worker_exit_code = $WorkerExitCode
    }
    Ensure-FamilyOsParentDirectory -Path $Path
    $payload | ConvertTo-Json | Set-Content -LiteralPath $Path -Encoding utf8
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

$supervisorStatePath = $paths.ReminderSupervisorStatePath
$supervisorLogPath = $paths.ReminderSupervisorLogPath
$workerRunLogPath = $paths.ReminderWorkerRunLogPath
$scriptPath = $PSCommandPath
$scriptRootQuoted = $PSScriptRoot.Replace("'", "''")
$scriptPathQuoted = $scriptPath.Replace("'", "''")

if ($env:FAMILY_OS_REMINDER_SUPERVISOR -ne "1") {
    if (Test-Path -LiteralPath $supervisorStatePath) {
        try {
            $existingState = Get-Content -LiteralPath $supervisorStatePath -Encoding utf8 -Raw | ConvertFrom-Json
            if ($existingState.supervisor_pid -and (Test-PidAlive ([int]$existingState.supervisor_pid))) {
                Write-Output "Family OS reminder supervisor PID: $($existingState.supervisor_pid)"
                exit 0
            }
        }
        catch {
        }
    }

    $command = "& { `$env:FAMILY_OS_REMINDER_SUPERVISOR = '1'; Set-Location '$scriptRootQuoted'; & '$scriptPathQuoted' }"
    $supervisorPid = Start-HiddenProcess -WorkingDirectory $PSScriptRoot -Command $command
    Write-ReminderSupervisorState -Path $supervisorStatePath -Status "launching" -SupervisorPid $supervisorPid
    Write-ReminderSupervisorLog -Path $supervisorLogPath -Message "Reminder supervisor launched. pid=$supervisorPid"
    Write-Output "Family OS reminder supervisor PID: $supervisorPid"
    exit 0
}

foreach ($name in @(
    "TELEGRAM_BOT_TOKEN",
    "FAMILY_OS_API_URL",
    "FAMILY_OS_API_KEY"
)) {
    Import-UserEnvironmentVariable $name
}

Write-ReminderSupervisorLog -Path $supervisorLogPath -Message "Reminder supervisor loop started."

while ($true) {
    Write-ReminderSupervisorState -Path $supervisorStatePath -Status "running"
    try {
        $workerOutput = & (Join-Path $PSScriptRoot "start-reminder-worker.ps1") -NoExitProcess 2>&1
        $exitCode = $LASTEXITCODE
        if ($workerOutput) {
            Ensure-FamilyOsParentDirectory -Path $workerRunLogPath
            Add-Content -LiteralPath $workerRunLogPath -Encoding utf8 -Value ("[{0}] {1}" -f (Get-Date -Format o), (($workerOutput | Out-String).TrimEnd()))
        }
        Write-ReminderSupervisorLog -Path $supervisorLogPath -Message "Reminder worker run finished. exit_code=$exitCode"
        Write-ReminderSupervisorState -Path $supervisorStatePath -Status "sleeping" -WorkerExitCode $exitCode
    }
    catch {
        Write-ReminderSupervisorLog -Path $supervisorLogPath -Message "Reminder worker run failed: $($_.Exception.Message)"
        Write-ReminderSupervisorState -Path $supervisorStatePath -Status "worker_failed" -WorkerExitCode 1
    }
    Start-Sleep -Seconds 300
}
