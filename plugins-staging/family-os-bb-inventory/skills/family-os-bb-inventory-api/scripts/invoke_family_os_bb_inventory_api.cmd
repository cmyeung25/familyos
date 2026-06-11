@echo off
setlocal
node --use-system-ca "%~dp0family_os_bb_inventory_api_client.mjs" %*
exit /b %ERRORLEVEL%
