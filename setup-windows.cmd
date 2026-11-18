@echo off
setlocal
cd /d "%~dp0"
echo Step 1 of 4: Installing Connectchy...
call npm.cmd ci
if errorlevel 1 goto failed
echo Step 2 of 4: Getting the Cloudflare tunnel tool...
if not exist ".local-runtime" mkdir ".local-runtime"
if not exist ".local-runtime\cloudflared.exe" (
  curl.exe --fail --location --retry 2 "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" --output ".local-runtime\cloudflared.download"
  if errorlevel 1 goto failed
  move /y ".local-runtime\cloudflared.download" ".local-runtime\cloudflared.exe" >nul
  if errorlevel 1 goto failed
)
".local-runtime\cloudflared.exe" --version
if errorlevel 1 goto failed
echo Step 3 of 4: Preparing your private local database...
node scripts/setup-database.mjs
if errorlevel 1 goto failed
echo Step 4 of 4: Building Connectchy...
call npm.cmd run build
if errorlevel 1 goto failed
echo Setup complete. Run start-windows.cmd to open Connectchy.
exit /b 0
:failed
echo Setup stopped. Read the error above, then run setup-windows.cmd again.
exit /b 1
