# Project rules

- Keep `@tanstack/react-start`, `@tanstack/router-plugin` and `@tanstack/react-router` pinned to mutually compatible exact versions and upgrade them together — mismatched internal cores break `createServerFn().inputValidator` typings across all server functions.
- `bun.lock` is the only lockfile; do not add `package-lock.json` — a stale second lockfile resolves mismatched versions.
- Browser code must use `sdb.from()` (src/lib/secure-db.ts) for slot_cases, chat_*, doctor_files, file_activity, case_revision_rounds and telegram_file_links, and `rt.channel()` for their live updates — these tables are closed to the browser; the server checks the signed staff ticket.
- Staff/doctor passwords are verified only in `staff-auth.functions.ts`, which issues signed tickets (STAFF_TICKET_SECRET); never compare passwords in the browser.
- Portal credentials use database password hashes and server-only verification; the password manager returns configured status, never credential values, and password changes or doctor deactivation invalidate tickets.
- Avatar mutations require an admin ticket; file delivery accepts only validated objects in configured storage and never follows download redirects. Drain POST requires a staff ticket and scheduled GET requires a machine secret.
- Patient balance mutations through the generic case gateway require an admin ticket and finite, nonnegative amounts; local session flags are only UI hints, not authorization.
- Storage writes go through server-issued signed upload tokens (`secure-storage.ts`); no browser insert policies on storage.
- The app-wide entry gate (`app-gate.functions.ts` + `AppGate` in __root) checks APP_GATE_PASSWORD on the server and stores its signed token under `zgate_token` (outside the `zircon_` prefix so page sign-out keeps the app unlocked).

- Permanent-install confirmation uses a dedicated staff-verified server action scoped to the doctor’s case; generic balance writes remain admin-only to prevent broader financial access.
