.PHONY: ci lint lint-fix format format-check typecheck test test-browser build terraform-fmt-check

ci: lint typecheck test format-check terraform-fmt-check

lint:
	cd frontend && pnpm lint

lint-fix:
	cd frontend && pnpm exec eslint . --fix

format:
	cd frontend && pnpm format

format-check:
	cd frontend && pnpm format-check

typecheck:
	cd frontend && pnpm typecheck

test:
	cd frontend && pnpm test

test-browser:
	cd frontend && pnpm test:browser

build:
	cd frontend && pnpm build

terraform-fmt-check:
	terraform fmt -check -recursive infrastructure/terraform
