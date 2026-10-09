PROJECT ?= flashy

# The files the browser needs. functions/ is picked up by wrangler on its own; tests and docs stay out.
FILES := index.html style.css app.js cards.js

.PHONY: dev test dist deploy deploy-commit clean

# The app on port 3000 with live reload. Wrangler runs the deck API (functions/) and a local copy
# of the deck storage on 8788 in the background; Ctrl-C stops both.
dev:
	wrangler pages dev . --port 8788 & trap 'kill $$!' EXIT; bun run server.js

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
