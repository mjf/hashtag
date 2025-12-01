all: fmt check test

fmt:
	prettier --write *.md
	prettier --write *.ts

check:
	deno check

test:
	deno test
