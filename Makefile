.PHONY: dev build build-wasm test coverage clean

dev:
	npm run dev

build-wasm:
	wasm-pack build rust-core --target web --out-dir ../wasm

build: build-wasm
	npm run build

test:
	cargo test

coverage:
	cargo tarpaulin --manifest-path rust-core/Cargo.toml --out Xml --output-dir coverage --fail-under 90 --exclude-files "rust-core/src/lib.rs"

clean:
	rm -rf dist wasm node_modules coverage
	cargo clean
