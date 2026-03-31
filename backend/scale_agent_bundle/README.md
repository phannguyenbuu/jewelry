# Scale Agent Bundle

Bundle nay duoc ghep tu logic polling agent hien tai va cach doc serial/parsing cua `D:/ref/weight-indicator-bundle`.

## File chinh

- `scale_agent.py`: agent Python ket noi server `/api/scale/*`
- `build_exe.cmd`: build file `dist/scale-agent.exe`
- `setup.cmd`: tao `.venv` va cai dependencies runtime
- `run_scale_agent.cmd`: chay source Python; neu chua co config thi mo setup flow
- `scale_agent_config.example.json`: mau config fallback

## Cach dung chinh

1. Build `dist/scale-agent.exe` bang `build_exe.cmd`.
2. Tai file `scale-agent.exe` tu route `May Can Hang` hoac copy file exe sang may can.
3. Chay file `.exe`, nhap `server_url`, `agent_key`, chon COM.
4. Bam `Nap tu server`, sau do `Luu va chay`.

## Fallback bang source Python

1. Chay `setup.cmd`.
2. Chay `run_scale_agent.cmd`.
3. Source se tu mo setup flow neu chua co config.

## Ghi chu

- Mac dinh COM la `COM3`.
- Agent su dung giao thuc heartbeat/poll/result cua server hien tai.
- Logic doc can ho tro A&D `ST/US/OL` va parse so can generic tu chuoi serial.
