@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  call setup.cmd
)
call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip
python -m pip install pyinstaller
python -m PyInstaller ^
  --noconfirm ^
  --clean ^
  --onefile ^
  --console ^
  --name scale-agent ^
  --distpath dist ^
  --workpath build ^
  --specpath build ^
  --hidden-import tkinter ^
  --hidden-import tkinter.ttk ^
  --hidden-import tkinter.messagebox ^
  --hidden-import _tkinter ^
  --hidden-import serial.win32 ^
  --hidden-import serial.tools.list_ports_windows ^
  scale_agent.py
echo.
echo Da build xong dist\scale-agent.exe
