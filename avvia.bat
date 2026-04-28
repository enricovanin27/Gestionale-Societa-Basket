@echo off
start cmd /k "cd /d D:\PYTHON\PROGETTO_ODERZO && uvicorn api:app --reload --port 8000"
start cmd /k "cd /d D:\PYTHON\PROGETTO_ODERZO\frontend && npm run dev"
