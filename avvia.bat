@echo off
start cmd /k "cd /d D:\PYTHON\PROGETTO_ODERZO\backend && uvicorn api:app --reload --port 8000 --env-file ..\.env"
start cmd /k "cd /d D:\PYTHON\PROGETTO_ODERZO\frontend && npm run dev"
