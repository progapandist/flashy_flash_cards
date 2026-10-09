PROJECT ?= flashy

# The files the browser needs. Tests, the dev server and docs stay out of the upload.
FILES := index.html style.css app.js cards.js

.PHONY: dev test dist deploy deploy-commit clean

# Live reload on save.
dev:
	bun run server.js

test:
	bun test

dist: $(FILES)
	rm -rf dist && mkdir -p dist && cp $(FILES) dist/

deploy: test dist
	wrangler pages deploy dist --project-name $(PROJECT) --branch main

# Deploy first, so the repo only records what actually went live. A clean tree just pushes.
deploy-commit: deploy
	git add -A
	git diff --cached --quiet || git commit -m "Deploy $$(date '+%Y-%m-%d %H:%M')"
	git push

clean:
	rm -rf dist
