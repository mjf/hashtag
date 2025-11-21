fmt:
	prettier --write *.md
	prettier --write *.ts

test:
	deno test
