# FlowGaia — Agent Orientation

## What This Is

FlowGaia PWA — a music player deployed to GitHub Pages at `https://flowgaia.github.io/`.

## Key Docs

- `docs/codebase.md` — Tech stack, build behavior, key file paths
- `docs/pwa-standards.md` — Manifest requirements, WASM init pattern, SW caching rules

## Key Entry Points

| File                           | Purpose             |
| ------------------------------ | ------------------- |
| `index.html`                   | HTML entry point    |
| `src/app.js`                   | Main application JS |
| `public/sw.js`                 | Service worker      |
| `public/manifest.json`         | PWA manifest        |
| `vite.config.js`               | Build config        |
| `.github/workflows/deploy.yml` | Deploy pipeline     |

## Build & Deploy

```sh
npm run build          # Vite → dist/
wasm-pack build        # Run in rust-core/ before npm build
```

Deploy: push to `main` → GitHub Actions → `https://flowgaia.github.io/`

## Stack

Vite 5 · Rust/WASM (wasm-pack) · Vanilla JS · Tailwind CSS · GitHub Pages
