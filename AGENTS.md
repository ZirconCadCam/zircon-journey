# Project rules

- Keep `@tanstack/react-start`, `@tanstack/router-plugin` and `@tanstack/react-router` pinned to mutually compatible exact versions and upgrade them together — mismatched internal cores break `createServerFn().inputValidator` typings across all server functions.
- `bun.lock` is the only lockfile; do not add `package-lock.json` — a stale second lockfile resolves mismatched versions.
