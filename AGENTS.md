# Project rules

- Keep `@tanstack/react-start`, `@tanstack/router-plugin` and `@tanstack/react-router` pinned to mutually compatible exact versions and upgrade them together — mismatched internal cores break `createServerFn().inputValidator` typings across all server functions.
- `bun.lock` is the only lockfile; do not add `package-lock.json` — a stale second lockfile resolves mismatched versions.
- Browser code must use `sdb.from()` (src/lib/secure-db.ts) for slot_cases, chat_*, doctor_files, file_activity, case_revision_rounds and telegram_file_links, and `rt.channel()` for their live updates — these tables are closed to the browser; the server checks the signed staff ticket.
- Staff/doctor passwords are verified only in `staff-auth.functions.ts`, which issues signed tickets (STAFF_TICKET_SECRET); never compare passwords in the browser.
- Storage writes go through server-issued signed upload tokens (`secure-storage.ts`); no browser insert policies on storage.
