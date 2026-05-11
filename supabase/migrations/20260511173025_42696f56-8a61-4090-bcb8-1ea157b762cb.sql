-- 1) Tables
create table public.doctor_profiles (
  slot int primary key check (slot between 1 and 12),
  name text not null,
  branch text,
  password text not null,
  icon text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.doctor_files (
  id uuid primary key default gen_random_uuid(),
  doctor_slot int not null references public.doctor_profiles(slot) on delete cascade,
  file_name text not null,
  file_path text not null,
  public_url text,
  size_bytes bigint,
  archived boolean not null default false,
  uploaded_by text not null default 'doctor',
  created_at timestamptz not null default now()
);
create index idx_doctor_files_slot on public.doctor_files(doctor_slot);

create table public.doctor_messages (
  id uuid primary key default gen_random_uuid(),
  doctor_slot int not null references public.doctor_profiles(slot) on delete cascade,
  sender text not null check (sender in ('doctor','designer')),
  content text not null,
  read_by_doctor boolean not null default false,
  read_by_designer boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_doctor_messages_slot on public.doctor_messages(doctor_slot, created_at);

-- 2) RLS — open to authenticated users (admin/designer/doctor portal session uses shared admin auth during build)
alter table public.doctor_profiles enable row level security;
alter table public.doctor_files enable row level security;
alter table public.doctor_messages enable row level security;

create policy "doctor_profiles read all auth" on public.doctor_profiles for select to authenticated using (true);
create policy "doctor_profiles admin manage" on public.doctor_profiles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "doctor_files read auth" on public.doctor_files for select to authenticated using (true);
create policy "doctor_files insert auth" on public.doctor_files for insert to authenticated with check (true);
create policy "doctor_files update auth" on public.doctor_files for update to authenticated using (true) with check (true);
create policy "doctor_files delete auth" on public.doctor_files for delete to authenticated using (true);

create policy "doctor_messages read auth" on public.doctor_messages for select to authenticated using (true);
create policy "doctor_messages insert auth" on public.doctor_messages for insert to authenticated with check (true);
create policy "doctor_messages update auth" on public.doctor_messages for update to authenticated using (true) with check (true);

-- 3) Touch trigger
create trigger trg_doctor_profiles_touch before update on public.doctor_profiles
for each row execute function public.touch_updated_at();

-- 4) Storage bucket (public for shareable links)
insert into storage.buckets (id, name, public) values ('doctor-files','doctor-files', true)
on conflict (id) do update set public = true;

create policy "doctor-files public read" on storage.objects for select using (bucket_id = 'doctor-files');
create policy "doctor-files auth write" on storage.objects for insert to authenticated with check (bucket_id = 'doctor-files');
create policy "doctor-files auth update" on storage.objects for update to authenticated using (bucket_id = 'doctor-files');
create policy "doctor-files auth delete" on storage.objects for delete to authenticated using (bucket_id = 'doctor-files');

-- 5) Realtime
alter publication supabase_realtime add table public.doctor_messages;
alter publication supabase_realtime add table public.doctor_files;

-- 6) Seed doctors (11 + 1 empty slot)
insert into public.doctor_profiles (slot, name, branch, password, active) values
  (1,  'د. أحمد الشطبي',       'sanaa', 'zircon1',  true),
  (2,  'د. حامد فيصل',         'sanaa', 'zircon2',  true),
  (3,  'د. تغريد الأغبري',     'sanaa', 'zircon3',  true),
  (4,  'د. سبأ',               'sanaa', 'zircon4',  true),
  (5,  'د. ميساء',             'sanaa', 'zircon5',  true),
  (6,  'د. محمد الأسدي',       'sanaa', 'zircon6',  true),
  (7,  'د. محمد الشطبي',       'ibb',   'zircon7',  true),
  (8,  'د. محمد البدجي',       'ibb',   'zircon8',  true),
  (9,  'د. حسام بجاش',         'ibb',   'zircon9',  true),
  (10, 'د. عبدالرحمن الزواحي', 'ibb',   'zircon10', true),
  (11, 'د. هديل',              'ibb',   'zircon11', true),
  (12, 'خانة شاغرة',           null,    'zircon12', false);
