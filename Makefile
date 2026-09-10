.PHONY: setup dev api web roads area neighbourhoods test
setup:
	python -m venv .venv
	.venv/bin/pip install -r backend/requirements.lock.txt
	cd frontend && npm ci
roads:
	.venv/bin/python backend/scripts/download_roads.py
area:
	.venv/bin/python backend/scripts/download_area.py
neighbourhoods:
	.venv/bin/python backend/scripts/download_neighbourhoods.py
dev:
	python3 backend/scripts/run_dev.py
api:
	.venv/bin/uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
web:
	cd frontend && npm run dev -- --host 127.0.0.1
test:
	cd backend && ../.venv/bin/ruff check . && ../.venv/bin/ruff format --check . && ../.venv/bin/pytest
	cd frontend && npm run build && npx playwright test
