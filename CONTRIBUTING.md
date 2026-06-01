# Contributing to imgen

## Prerequisites

- Node.js ≥ 20
- A ChatGPT Plus/Pro account logged in via [Codex CLI](https://github.com/openai/codex) (`~/.codex/auth.json`)

## Setup

```bash
npm install
npm run build
```

## Running tests

```bash
npm test
```

## Project structure

```
src/
  auth.ts      # Codex auth token loading & refresh
  cli.ts       # Commander CLI entry point
  http.ts      # TLS-impersonated HTTP session (libcurl)
  images.ts    # Codex responses API + SSE parsing
  output.ts    # File writing helpers
test/
  *.test.ts    # Node built-in test runner
skills/imgen/  # Claude Code skill definition
```

## Submitting changes

1. Fork the repo and create a feature branch.
2. Add or update tests for any logic changes.
3. Run `npm test` and ensure all tests pass.
4. Open a pull request with a clear description.

## Reporting issues

Please include:
- Node.js version (`node --version`)
- OS and architecture
- The exact command you ran
- Error output or unexpected behavior
