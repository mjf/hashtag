all: format lint check test

format:
	prettier --write *.md
	prettier --write *.ts

lint:
	deno lint

check:
	deno check

test:
	deno test
