# Move case saving to the server (staff-verified)

## Goal
Close the open access rules on cases, chat, doctor files, file activity, Telegram links, app settings, avatars and stored files, so that only signed-in staff (via their existing passwords) can read or change data — without creating personal accounts.

## How it works
1. **Staff session ticket**: when a doctor, designer, technician, secretary or admin enters their password, the server checks it and returns a signed ticket (valid 12 hours, tied to role and doctor). Screens look the same.
2. **All saving and deleting goes through the server**: every action (move a case stage, archive, pin, delete, chat send/delete, doctor files, file activity, archive receipts, shade confirm, image comments, new case) calls a server action that checks the ticket and the role's permission before saving.
3. **Reading too**: case lists, chat and files load through the server with the ticket, so patient names and phone numbers are no longer readable by anyone with the app link.
4. **Lock the database**: remove the "everyone" rules on the affected tables and file folders; files are served via short-lived signed links.
5. **Live updates**: chat live updates switch to refresh-on-focus plus a short poll while a chat is open (live database feed requires open read access).

## Order (each stage ships working)
- Stage 1: ticket + cases (all case screens, ~17 files, ~75 save points).
- Stage 2: chat and conversations, push.
- Stage 3: doctor files, file activity, archive receipts, Telegram links, settings, avatars.
- Stage 4: storage folders and lock database rules; mark findings fixed.

## Impact
- Old devices must re-enter their password once after release.
- Vercel copy needs the server secret key to work (same as today's admin tools).
- Large change: expect several rounds; each stage is tested in the preview before the next.

## Technical details
- `src/lib/staff-ticket.server.ts`: HMAC (SESSION_SECRET, generated) sign/verify `{role, slot, exp}`.
- `src/lib/staff-auth.functions.ts`: `issueStaffTicket` (verifies via `get_staff_password` / `verify_doctor_login` / `is_admin_actor`).
- `src/lib/cases.functions.ts`, `chat.functions.ts`, `files.functions.ts`: typed server fns with zod, `supabaseAdmin` loaded in-handler after ticket check; doctors restricted to their own `doctor_slot`.
- Client helper `withTicket()` attaches the ticket from localStorage to each call.
- Migration per stage dropping `USING (true)` policies and revoking anon/authenticated writes.
