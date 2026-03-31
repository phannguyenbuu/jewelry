@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  call setup.cmd
)
call ".venv\Scripts\activate.bat"
python scale_agent.py %*
