# Repository Guidelines

## Project Structure & Module Organization
- Core rendering logic lives in `build/render.mjs`; shared helpers sit alongside it under `build/`.
- Quote content belongs in `quotes/` as Markdown with YAML frontmatter. Use the `YYYY-MM-DD-HHMM-shortid.md` pattern, mirroring `quotes/2024-03-21-1200-sample.md`.
- Presentation templates stay in `build/templates/`, while fonts and imagery live under `assets/`.
- Generated artifacts in `cards/`, `q/`, and `sources/` are disposable outputs. Never commit them—CI regenerates everything.

## Build, Test, and Development Commands
- `npm install` prepares the Node 18 toolchain and local dependencies.
- `npm run check` validates quote frontmatter, IDs, and URLs without touching the filesystem.
- `npm run build` rebuilds cards and wrapper pages for spot-checking; combine with `BASE_PATH` and `SITE_ORIGIN` to preview alternate deploy roots.
- `npm run refresh:og` bumps the OG image version to invalidate cached previews after visible changes.

## Coding Style & Naming Conventions
- Write modern ESM with top-level `import` and `export`, using 2-space indentation and `const`/`let`.
- Prefer descriptive camelCase helpers (`renderSvg`, `normalizeBasePath`) and filename parity with their roles (`source.html`, `card.css`).
- Keep quote IDs and filenames lowercase with hyphens; avoid spaces or uppercase letters.
- Minimize inline styles in templates and source all fonts through `assets/fonts/`.

## Testing Guidelines
- Treat `npm run check` as the mandatory pre-commit gate; resolve every warning.
- For renderer changes, export narrow helpers and exercise them via lightweight Node scripts under `build/`; delete any ad hoc files before committing.
- After layout-affecting edits, run `npm run build` and manually review the regenerated `cards/<id>.jpg` and `q/<id>/index.html` outputs.

## Commit & Pull Request Guidelines
- Use conventional, tense-neutral commit subjects in `type: summary` form, e.g., `add quote: www-92fn4`.
- Group related quotes or pipeline tweaks together; avoid mixing content additions with infrastructure refactors.
- PR descriptions should outline scope, note commands executed (`npm run check`, `npm run build`), link issues when relevant, and attach screenshots for UI updates.
- Only commit source files; allow CI to publish generated assets once merged.

## Environment & Deployment Tips
- When deploying under a subdirectory, export `BASE_PATH` and `SITE_ORIGIN` so paths and metadata resolve correctly.
- Keep `CARD_VERSION` aligned with `npm run refresh:og` whenever platforms need fresh OG previews.
