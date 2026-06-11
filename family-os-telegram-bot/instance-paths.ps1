$ErrorActionPreference = "Stop"

function Resolve-FamilyOsPath {
    param(
        [string]$Value,
        [string]$Fallback,
        [string]$BasePath
    )

    $candidate = if ([string]::IsNullOrWhiteSpace($Value)) { $Fallback } else { $Value }
    if ([System.IO.Path]::IsPathRooted($candidate)) {
        return [System.IO.Path]::GetFullPath($candidate)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $candidate))
}

function Get-FamilyOsBotPaths {
    param(
        [string]$ScriptRoot
    )

    $workspaceRoot = Resolve-FamilyOsPath -Value $env:FAMILY_OS_WORKSPACE -Fallback (Join-Path $ScriptRoot "..") -BasePath $ScriptRoot
    $instanceRoot = Resolve-FamilyOsPath -Value $env:FAMILY_OS_INSTANCE_ROOT -Fallback $ScriptRoot -BasePath $workspaceRoot
    $configRoot = Resolve-FamilyOsPath -Value $env:FAMILY_OS_CONFIG_ROOT -Fallback $instanceRoot -BasePath $workspaceRoot
    $stateRoot = Resolve-FamilyOsPath -Value $env:FAMILY_OS_STATE_ROOT -Fallback $instanceRoot -BasePath $workspaceRoot
    $logsRoot = Resolve-FamilyOsPath -Value $env:FAMILY_OS_LOGS_ROOT -Fallback $instanceRoot -BasePath $workspaceRoot
    $codexHome = Resolve-FamilyOsPath -Value $(if ($env:FAMILY_OS_CODEX_HOME) { $env:FAMILY_OS_CODEX_HOME } else { $env:CODEX_HOME }) -Fallback (Join-Path $instanceRoot ".codex-home") -BasePath $workspaceRoot
    $skillsRoot = Resolve-FamilyOsPath -Value $env:FAMILY_OS_SKILLS_ROOT -Fallback (Join-Path $workspaceRoot ".agents\skills") -BasePath $workspaceRoot
    $runtimeConfigPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_RUNTIME_CONFIG_PATH -Fallback (Join-Path $workspaceRoot "plugins-staging\family-os-bb-inventory\runtime\telegram-runtime.json") -BasePath $workspaceRoot

    return @{
        ScriptRoot = $ScriptRoot
        WorkspaceRoot = $workspaceRoot
        InstanceRoot = $instanceRoot
        ConfigRoot = $configRoot
        StateRoot = $stateRoot
        LogsRoot = $logsRoot
        CodexHome = $codexHome
        SkillsRoot = $skillsRoot
        RuntimeConfigPath = $runtimeConfigPath
        BotConfigPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_CONFIG_PATH -Fallback (Join-Path $configRoot "local-bot-config.json") -BasePath $workspaceRoot
        ApiConfigPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_API_CONFIG_PATH -Fallback (Join-Path $workspaceRoot "family-os-apps-script\local-api-config.json") -BasePath $workspaceRoot
        ReminderConfigPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_REMINDER_CONFIG_PATH -Fallback (Join-Path $configRoot "reminder-config.json") -BasePath $workspaceRoot
        BridgeStatePath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BRIDGE_STATE_PATH -Fallback (Join-Path $stateRoot ".codex-bridge-state.json") -BasePath $workspaceRoot
        BridgeErrorLogPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BRIDGE_ERROR_LOG_PATH -Fallback (Join-Path $logsRoot "bridge-error.log") -BasePath $workspaceRoot
        BotLockPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_LOCK_PATH -Fallback (Join-Path $stateRoot "bot.lock") -BasePath $workspaceRoot
        BotActivityLogPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_ACTIVITY_LOG_PATH -Fallback (Join-Path $logsRoot "bot-activity.log") -BasePath $workspaceRoot
        BotFatalLogPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_FATAL_LOG_PATH -Fallback (Join-Path $logsRoot "bot-fatal.log") -BasePath $workspaceRoot
        BotStartupDebugLogPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_STARTUP_DEBUG_LOG_PATH -Fallback (Join-Path $logsRoot "bot-startup-debug.log") -BasePath $workspaceRoot
        BotRuntimeStatePath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_RUNTIME_STATE_PATH -Fallback (Join-Path $stateRoot "bot-runtime-state.json") -BasePath $workspaceRoot
        BotHeartbeatPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_HEARTBEAT_PATH -Fallback (Join-Path $stateRoot "bot-heartbeat.json") -BasePath $workspaceRoot
        ReminderStatePath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_REMINDER_STATE_PATH -Fallback (Join-Path $stateRoot "reminder-state.json") -BasePath $workspaceRoot
        ReminderLockPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_REMINDER_LOCK_PATH -Fallback (Join-Path $stateRoot "reminder-worker.lock") -BasePath $workspaceRoot
        ReminderActivityLogPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_REMINDER_ACTIVITY_LOG_PATH -Fallback (Join-Path $logsRoot "reminder-worker-activity.log") -BasePath $workspaceRoot
        ReminderFatalLogPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_REMINDER_FATAL_LOG_PATH -Fallback (Join-Path $logsRoot "reminder-worker-fatal.log") -BasePath $workspaceRoot
        ReminderSupervisorStatePath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_REMINDER_SUPERVISOR_STATE_PATH -Fallback (Join-Path $stateRoot "reminder-supervisor-state.json") -BasePath $workspaceRoot
        ReminderSupervisorLogPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_REMINDER_SUPERVISOR_LOG_PATH -Fallback (Join-Path $logsRoot "reminder-supervisor.log") -BasePath $workspaceRoot
        ReminderWorkerRunLogPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_REMINDER_WORKER_RUN_LOG_PATH -Fallback (Join-Path $logsRoot "reminder-worker-run.log") -BasePath $workspaceRoot
        BotSupervisorStatePath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_SUPERVISOR_STATE_PATH -Fallback (Join-Path $stateRoot "bot-supervisor-state.json") -BasePath $workspaceRoot
        BotSupervisorLogPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_SUPERVISOR_LOG_PATH -Fallback (Join-Path $logsRoot "bot-supervisor.log") -BasePath $workspaceRoot
        BotSupervisorOutPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_SUPERVISOR_OUT_PATH -Fallback (Join-Path $logsRoot "bot-supervisor.out.log") -BasePath $workspaceRoot
        BotSupervisorErrPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_SUPERVISOR_ERR_PATH -Fallback (Join-Path $logsRoot "bot-supervisor.err.log") -BasePath $workspaceRoot
        BotRuntimeOutPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_RUNTIME_OUT_PATH -Fallback (Join-Path $logsRoot "bot-runtime.out.log") -BasePath $workspaceRoot
        BotRuntimeErrPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_RUNTIME_ERR_PATH -Fallback (Join-Path $logsRoot "bot-runtime.err.log") -BasePath $workspaceRoot
        BotWatchdogLogPath = Resolve-FamilyOsPath -Value $env:FAMILY_OS_BOT_WATCHDOG_LOG_PATH -Fallback (Join-Path $logsRoot "bot-watchdog.log") -BasePath $workspaceRoot
    }
}

function Ensure-FamilyOsParentDirectory {
    param([string]$Path)
    $parent = Split-Path -Path $Path -Parent
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
}

function Initialize-FamilyOsBotRuntime {
    param([hashtable]$Paths)

    foreach ($directoryPath in @(
        $Paths.InstanceRoot,
        $Paths.ConfigRoot,
        $Paths.StateRoot,
        $Paths.LogsRoot,
        $Paths.CodexHome,
        (Split-Path -Path $Paths.SkillsRoot -Parent)
    )) {
        if (-not [string]::IsNullOrWhiteSpace($directoryPath)) {
            New-Item -ItemType Directory -Force -Path $directoryPath | Out-Null
        }
    }

    foreach ($envEntry in @{
        FAMILY_OS_WORKSPACE = $Paths.WorkspaceRoot
        FAMILY_OS_INSTANCE_ROOT = $Paths.InstanceRoot
        FAMILY_OS_CONFIG_ROOT = $Paths.ConfigRoot
        FAMILY_OS_STATE_ROOT = $Paths.StateRoot
        FAMILY_OS_LOGS_ROOT = $Paths.LogsRoot
        FAMILY_OS_CODEX_HOME = $Paths.CodexHome
        FAMILY_OS_SKILLS_ROOT = $Paths.SkillsRoot
        FAMILY_OS_RUNTIME_CONFIG_PATH = $Paths.RuntimeConfigPath
        FAMILY_OS_BOT_CONFIG_PATH = $Paths.BotConfigPath
        FAMILY_OS_API_CONFIG_PATH = $Paths.ApiConfigPath
        FAMILY_OS_REMINDER_CONFIG_PATH = $Paths.ReminderConfigPath
        FAMILY_OS_BRIDGE_STATE_PATH = $Paths.BridgeStatePath
        FAMILY_OS_BRIDGE_ERROR_LOG_PATH = $Paths.BridgeErrorLogPath
        FAMILY_OS_BOT_LOCK_PATH = $Paths.BotLockPath
        FAMILY_OS_BOT_ACTIVITY_LOG_PATH = $Paths.BotActivityLogPath
        FAMILY_OS_BOT_FATAL_LOG_PATH = $Paths.BotFatalLogPath
        FAMILY_OS_BOT_STARTUP_DEBUG_LOG_PATH = $Paths.BotStartupDebugLogPath
        FAMILY_OS_BOT_RUNTIME_STATE_PATH = $Paths.BotRuntimeStatePath
        FAMILY_OS_BOT_HEARTBEAT_PATH = $Paths.BotHeartbeatPath
        FAMILY_OS_REMINDER_STATE_PATH = $Paths.ReminderStatePath
        FAMILY_OS_REMINDER_LOCK_PATH = $Paths.ReminderLockPath
        FAMILY_OS_REMINDER_ACTIVITY_LOG_PATH = $Paths.ReminderActivityLogPath
        FAMILY_OS_REMINDER_FATAL_LOG_PATH = $Paths.ReminderFatalLogPath
        FAMILY_OS_REMINDER_SUPERVISOR_STATE_PATH = $Paths.ReminderSupervisorStatePath
        FAMILY_OS_REMINDER_SUPERVISOR_LOG_PATH = $Paths.ReminderSupervisorLogPath
        FAMILY_OS_REMINDER_WORKER_RUN_LOG_PATH = $Paths.ReminderWorkerRunLogPath
        FAMILY_OS_BOT_SUPERVISOR_STATE_PATH = $Paths.BotSupervisorStatePath
        FAMILY_OS_BOT_SUPERVISOR_LOG_PATH = $Paths.BotSupervisorLogPath
        FAMILY_OS_BOT_SUPERVISOR_OUT_PATH = $Paths.BotSupervisorOutPath
        FAMILY_OS_BOT_SUPERVISOR_ERR_PATH = $Paths.BotSupervisorErrPath
        FAMILY_OS_BOT_RUNTIME_OUT_PATH = $Paths.BotRuntimeOutPath
        FAMILY_OS_BOT_RUNTIME_ERR_PATH = $Paths.BotRuntimeErrPath
        FAMILY_OS_BOT_WATCHDOG_LOG_PATH = $Paths.BotWatchdogLogPath
        CODEX_HOME = $Paths.CodexHome
    }.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($envEntry.Key, [string]$envEntry.Value, "Process")
    }
}
