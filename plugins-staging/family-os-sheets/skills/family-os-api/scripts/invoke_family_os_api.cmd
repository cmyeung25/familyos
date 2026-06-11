@echo off
setlocal

if not defined FAMILY_OS_API_URL (
  for /f "tokens=2,*" %%A in ('reg query HKCU\Environment /v FAMILY_OS_API_URL 2^>nul ^| findstr /i "FAMILY_OS_API_URL"') do set "FAMILY_OS_API_URL=%%B"
)

if not defined FAMILY_OS_API_KEY (
  for /f "tokens=2,*" %%A in ('reg query HKCU\Environment /v FAMILY_OS_API_KEY 2^>nul ^| findstr /i "FAMILY_OS_API_KEY"') do set "FAMILY_OS_API_KEY=%%B"
)

if not defined FAMILY_OS_API_URL (
  echo FAMILY_OS_API_URL is not configured. 1>&2
  exit /b 1
)

if not defined FAMILY_OS_API_KEY (
  echo FAMILY_OS_API_KEY is not configured. 1>&2
  exit /b 1
)

node --use-system-ca "%~dp0family_os_api_client.mjs" %*
exit /b %ERRORLEVEL%
