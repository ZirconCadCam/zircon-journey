
-- Enums
create type public.app_role as enum ('admin','doctor','designer','technician','secretary');
create type public.branch as enum ('sanaa','ibb');
create type public.case_status as enum ('new','designing','design_ready','milling','ready','delivered','archived');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  branch public.branch,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- User Roles (separate table for security)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  branch public.branch,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.get_primary_role(_user_id uuid)
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = _user_id
  order by case role
    when 'admin' then 1 when 'secretary' then 2 when 'technician' then 3
    when 'designer' then 4 when 'doctor' then 5 end
  limit 1
$$;

create or replace function public.get_user_branch(_user_id uuid)
returns public.branch language sql stable security definer set search_path = public as $$
  select branch from public.user_roles where user_id = _user_id and branch is not null limit 1
$$;

-- Cases
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  case_code text not null unique default ('ZJ-' || to_char(now(),'YYMMDD') || '-' || substr(gen_random_uuid()::text,1,4)),
  patient_name text not null,
  patient_phone text,
  patient_age int,
  tooth_number text,
  shade text,
  notes text,
  status public.case_status not null default 'new',
  doctor_id uuid not null references auth.users(id) on delete cascade,
  designer_id uuid references auth.users(id),
  technician_id uuid references auth.users(id),
  branch public.branch not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cases enable row level security;
create index on public.cases (status);
create index on public.cases (doctor_id);
create index on public.cases (branch);

-- Case Messages
create table public.case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.case_messages enable row level security;
create index on public.case_messages (case_id);

-- Case Files
create table public.case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_kind text not null default 'scan',
  size_bytes bigint,
  created_at timestamptz not null default now()
);
alter table public.case_files enable row level security;
create index on public.case_files (case_id);

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index on public.notifications (user_id, read);

-- Updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger trg_cases_updated before update on public.cases
  for each row execute function public.touch_updated_at();

-- Auto profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'phone');
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ===== RLS Policies =====

-- profiles: any authenticated can read (small dir), only self can update
create policy "profiles read auth" on public.profiles for select to authenticated using (true);
create policy "profiles self update" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "profiles self insert" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- user_roles: users can read own; admins can read/manage all
create policy "roles read own" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "roles admin manage" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- cases
create policy "cases admin all" on public.cases for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "cases doctor own select" on public.cases for select to authenticated
  using (doctor_id = auth.uid());
create policy "cases doctor insert" on public.cases for insert to authenticated
  with check (doctor_id = auth.uid() and public.has_role(auth.uid(),'doctor'));
create policy "cases doctor update own" on public.cases for update to authenticated
  using (doctor_id = auth.uid()) with check (doctor_id = auth.uid());
create policy "cases designer select" on public.cases for select to authenticated
  using (public.has_role(auth.uid(),'designer'));
create policy "cases designer update" on public.cases for update to authenticated
  using (public.has_role(auth.uid(),'designer')) with check (public.has_role(auth.uid(),'designer'));
create policy "cases technician select" on public.cases for select to authenticated
  using (public.has_role(auth.uid(),'technician'));
create policy "cases technician update" on public.cases for update to authenticated
  using (public.has_role(auth.uid(),'technician')) with check (public.has_role(auth.uid(),'technician'));
create policy "cases secretary select branch" on public.cases for select to authenticated
  using (public.has_role(auth.uid(),'secretary') and branch = public.get_user_branch(auth.uid()));
create policy "cases secretary update branch" on public.cases for update to authenticated
  using (public.has_role(auth.uid(),'secretary') and branch = public.get_user_branch(auth.uid()))
  with check (public.has_role(auth.uid(),'secretary') and branch = public.get_user_branch(auth.uid()));

-- case_messages: visible/insertable by anyone who can see the case
create policy "messages select if case visible" on public.case_messages for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id));
create policy "messages insert sender" on public.case_messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (select 1 from public.cases c where c.id = case_id));

-- case_files: same access pattern
create policy "files select if case visible" on public.case_files for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id));
create policy "files insert" on public.case_files for insert to authenticated
  with check (uploader_id = auth.uid() and exists (select 1 from public.cases c where c.id = case_id));

-- notifications
create policy "notif select own" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif update own" on public.notifications for update to authenticated using (user_id = auth.uid());
create policy "notif insert auth" on public.notifications for insert to authenticated with check (true);

-- Storage bucket
insert into storage.buckets (id, name, public) values ('case-files','case-files', false)
on conflict (id) do nothing;

create policy "case-files read auth" on storage.objects for select to authenticated
  using (bucket_id = 'case-files');
create policy "case-files upload auth" on storage.objects for insert to authenticated
  with check (bucket_id = 'case-files');
create policy "case-files update own" on storage.objects for update to authenticated
  using (bucket_id = 'case-files' and owner = auth.uid());
create policy "case-files delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'case-files' and owner = auth.uid());

-- Realtime
alter publication supabase_realtime add table public.case_messages;
alter publication supabase_realtime add table public.cases;
alter publication supabase_realtime add table public.notifications;
