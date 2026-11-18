@echo off
setlocal
cd /d "%~dp0"
echo Open http://127.0.0.1:3000 in your browser when the app is ready.
call npm.cmd start
