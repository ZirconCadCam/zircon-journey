# Staff sign-in accounts + closing the open access rules

You chose to require real accounts for staff, and admin-only file deletes. Today doctors and staff get in with a shared password and the database treats them as anonymous. So the rules can only be tightened after each person has a real account. Otherwise every page stops working.

## What changes for staff
- Each doctor, the designer, the technician, the secretary and admin get their own sign-in account (email + password). Admin creates them from the admin page, next to each doctor.
- The current password screens stay as they are. Behind the scenes the password signs into that person's account, so nobody learns a new login flow.
- A doctor sees only their own cases, chats and files. Staff see the cases they work on. Admin sees everything.

## Rules that get tightened
- Cases: read/add/change limited to the owning doctor, staff roles and admin; delete limited to admin.
- Chat messages and conversations: participants only; only admin deletes conversations.
- Doctor files and doctor messages: owning doctor, staff and admin; delete limited to admin.
- File activity log: signed-in staff only.
- Telegram file links, app settings and avatar pictures: signed-in users only.
- Stored files (doctor files, chat attachments, case files): uploads only for signed-in staff; deletes and replacements admin-only.

## Order of work (so the app never breaks)
1. Add a link between each doctor slot / staff role and an account.
2. Admin tool to create the accounts and set their passwords.
3. Change the password screens to sign in to the linked account.
4. Only after every account exists and is tested: switch on the stricter rules.
5. Re-run the security scan and mark the 18 issues fixed.

## Technical details
- New table `staff_accounts(user_id uuid, role app_role, doctor_slot int)` plus `user_roles` rows; helper `current_doctor_slot()` (security definer).
- Accounts created by a server function using the admin client, after checking the admin role.
- Login: `signInWithPassword` with a synthetic email per slot/role (for example `doctor-3@zircon.local`), with auto-confirm on.
- Policies rewritten using `auth.uid()`, `has_role()` and `current_doctor_slot()`, removing the `USING (true)` / `WITH CHECK (true)` rules on slot_cases, chat_*, doctor_files, doctor_messages, file_activity, telegram_file_links, app_settings, avatar_overrides and the storage.objects rules on the three buckets.
- The same rules carry over when the data moves to your own database for the Vercel copy.
