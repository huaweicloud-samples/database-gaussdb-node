SHELL := /bin/sh

connectionString=gaussdb://

params := $(connectionString)

node-command := xargs -n 1 -I file node file $(params)
ifdef CI
node-command := xargs -n 1 -I file node ../../.github/ci/run-node-test.cjs file $(params)
endif

.PHONY : test test-connection test-integration bench \
	 publish update-npm

all:
	npm install

help:
	@echo "make test-all [connectionString=gaussdb://<your connection string>]"

test: test-unit

test-all: test-unit test-integration test-worker


update-npm:
	@npm i npm --global

bench:
	@find benchmark -name "*-bench.js" | $(node-command)

test-unit:
	@find test/unit -name "*-tests.js" | $(node-command)

test-connection:
	@echo "***Testing connection***"
	@node script/create-test-tables.js $(params)

test-integration: test-connection
	@echo "***Testing Pure Javascript***"
	@find test/integration -name "*-tests.js" | $(node-command)

test-binary: test-connection
	@echo "***Testing Pure Javascript (binary)***"
	@find test/integration -name "*-tests.js" | $(node-command) binary

test-pool:
	@find test/integration/connection-pool -name "*.js" | $(node-command) binary

test-worker:
	# this command only runs in node 18.x and above since there are 
	# worker specific items missing from the node environment in lower versions
	@if [ $(shell node --version | sed 's/v//' | cut -d'.' -f1) -ge 18 ]; then \
		echo "***Testing Cloudflare Worker support***"; \
		yarn vitest run -c test/vitest.config.mts test/cloudflare/ --no-watch -- $(params); \
	else \
		echo "Skipping test-worker: Node.js version is less than 18."; \
	fi
