
create extension if not exists pg_net;

-- ===== Device push subscriptions =====
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  doctor_slot int,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;
-- No anon/authenticated grants: all access goes through SECURITY DEFINER RPCs below.

-- ===== Internal push config (server-only, no grants) =====
create table if not exists public.push_config (
  id boolean primary key default true,
  vapid_public text not null,
  vapid_private text not null,
  dispatch_secret text not null,
  admin_contact text not null default 'mailto:admin@zircon-journey.lovable.app',
  endpoint_url text not null,
  constraint push_config_singleton check (id)
);
grant all on public.push_config to service_role;
alter table public.push_config enable row level security;

-- ===== RPC: save a device subscription (callable by anon/authenticated) =====
create or replace function public.save_push_subscription(
  p_role text, p_slot int, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_subscriptions (role, doctor_slot, endpoint, p256dh, auth, user_agent, updated_at)
  values (p_role, p_slot, p_endpoint, p_p256dh, p_auth, p_user_agent, now())
  on conflict (endpoint) do update
    set role = excluded.role,
        doctor_slot = excluded.doctor_slot,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = now();
end $$;
grant execute on function public.save_push_subscription(text,int,text,text,text,text) to anon, authenticated;

-- ===== RPC: remove a device subscription =====
create or replace function public.remove_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint;
end $$;
grant execute on function public.remove_push_subscription(text) to anon, authenticated;

-- ===== RPC: resolve push targets for a message (secret-gated) =====
create or replace function public.resolve_push_targets(
  p_secret text, p_conversation uuid, p_sender text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg public.push_config;
  conv public.chat_conversations;
  recipients text[];
  result jsonb;
begin
  select * into cfg from public.push_config limit 1;
  if cfg is null or cfg.dispatch_secret <> p_secret then
    return null;
  end if;

  select * into conv from public.chat_conversations where id = p_conversation;
  if conv is null then
    return jsonb_build_object('config', jsonb_build_object(
      'vapid_public', cfg.vapid_public, 'vapid_private', cfg.vapid_private, 'admin_contact', cfg.admin_contact
    ), 'targets', '[]'::jsonb);
  end if;

  -- recipients = conversation participants minus the sender
  select array_agg(r) into recipients
  from unnest(conv.participants) r
  where r <> p_sender;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth
    )), '[]'::jsonb)
  into result
  from public.push_subscriptions s
  where s.role = any(recipients)
    and (s.role <> 'doctor' or s.doctor_slot = conv.doctor_slot);

  return jsonb_build_object('config', jsonb_build_object(
      'vapid_public', cfg.vapid_public, 'vapid_private', cfg.vapid_private, 'admin_contact', cfg.admin_contact
    ), 'targets', result);
end $$;
grant execute on function public.resolve_push_targets(text,uuid,text) to anon, authenticated;

-- ===== RPC: prune a dead subscription (secret-gated) =====
create or replace function public.prune_push_subscription(p_secret text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cfg public.push_config;
begin
  select * into cfg from public.push_config limit 1;
  if cfg is null or cfg.dispatch_secret <> p_secret then return; end if;
  delete from public.push_subscriptions where id = p_id;
end $$;
grant execute on function public.prune_push_subscription(text,uuid) to anon, authenticated;

-- ===== Trigger: on new chat message, fire push dispatch via pg_net =====
create or replace function public.tg_notify_push()
returns trigger language plpgsql security definer set search_path = public, extensions, net as $$
declare cfg public.push_config;
begin
  select * into cfg from public.push_config limit 1;
  if cfg is null then return new; end if;

  perform net.http_post(
    url := cfg.endpoint_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', cfg.dispatch_secret
    ),
    body := jsonb_build_object(
      'conversation_id', new.conversation_id,
      'sender', new.sender,
      'sender_name', new.sender_name,
      'message_type', new.message_type,
      'content', new.content
    )
  );
  return new;
end $$;

drop trigger if exists trg_notify_push on public.chat_messages;
create trigger trg_notify_push
  after insert on public.chat_messages
  for each row execute function public.tg_notify_push();
