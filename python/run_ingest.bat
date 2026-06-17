@echo off
cd /d C:\Users\onix\Documents\Projects\FootyForecast\python
set PYTHONUNBUFFERED=1
echo [%date% %time%] Starting WC2026 ingest >> data\ingest.log 2>&1
.venv\Scripts\python.exe -m footy.ingest.wc2026 >> data\ingest.log 2>&1
echo [%date% %time%] Exit code %errorlevel% >> data\ingest.log 2>&1
