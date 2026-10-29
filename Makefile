.PHONY: help setup hooks build model-server app dev test lint check

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

setup: hooks ## First-time setup: Python and UI dependencies, build the UI, git hooks
	uv sync
	cd frontend && npm ci && npm run build

hooks: ## Turn on the git hooks (secret and branch-name checks)
	git config core.hooksPath .githooks
	@command -v gitleaks >/dev/null || echo "gitleaks is not installed: brew install gitleaks"

build: ## Build the UI that main.py serves
	cd frontend && npm run build

model-server: ## Start the model server (port 8000)
	uv run python backend/model_server.py

app: ## Start the web app (http://127.0.0.1:7860)
	uv run python backend/main.py

dev: ## UI with live reload; proxies /api to main.py
	cd frontend && npm run dev

test: ## Backend and frontend tests
	uv run pytest
	cd frontend && npm test

lint: ## Type-check and lint the UI
	cd frontend && npx tsc -b && npx oxlint src

check: lint test ## Everything to run before a PR
