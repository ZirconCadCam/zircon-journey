CREATE TABLE public.device_registry (
  device_id text PRIMARY KEY,
  label text,
  user_agent text,
  platform text,
  ip text,
  last_role text,
  last_path text,
  visits integer NOT NULL DEFAULT 1,
  blocked boolean NOT NULL DEFAULT false,
  blocked_at timestamp with time zone,
  first_seen timestamp with time zone NOT NULL DEFAULT now(),
  last_seen timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.device_registry TO service_role;
ALTER TABLE public.device_registry ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.register_device(
  p_device_id text,
  p_user_agent text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_path text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_blocked boolean;
BEGIN
  IF p_device_id IS NULL OR length(btrim(p_device_id)) = 0 THEN
    RETURN false;
  END IF;
  INSERT INTO public.device_registry (device_id, user_agent, platform, ip, last_role, last_path)
  VALUES (p_device_id, p_user_agent, p_platform, p_ip, p_role, p_path)
  ON CONFLICT (device_id) DO UPDATE SET
    user_agent = COALESCE(EXCLUDED.user_agent, public.device_registry.user_agent),
    platform = COALESCE(EXCLUDED.platform, public.device_registry.platform),
    ip = COALESCE(EXCLUDED.ip, public.device_registry.ip),
    last_role = COALESCE(EXCLUDED.last_role, public.device_registry.last_role),
    last_path = COALESCE(EXCLUDED.last_path, public.device_registry.last_path),
    visits = public.device_registry.visits + 1,
    last_seen = now()
  RETURNING blocked INTO v_blocked;
  RETURN COALESCE(v_blocked, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_device_blocked(p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT blocked FROM public.device_registry WHERE device_id = p_device_id), false)
$$;

CREATE OR REPLACE FUNCTION public.list_devices(p_admin_password text DEFAULT NULL)
RETURNS SETOF public.device_registry
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_actor(p_admin_password) THEN
    RAISE EXCEPTION 'غير مصرح: هذا الإجراء متاح للإدارة فقط';
  END IF;
  RETURN QUERY SELECT * FROM public.device_registry ORDER BY last_seen DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_device_blocked(
  p_device_id text,
  p_blocked boolean,
  p_admin_password text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_actor(p_admin_password) THEN
    RAISE EXCEPTION 'غير مصرح: هذا الإجراء متاح للإدارة فقط';
  END IF;
  UPDATE public.device_registry
  SET blocked = p_blocked, blocked_at = CASE WHEN p_blocked THEN now() ELSE NULL END
  WHERE device_id = p_device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_device_label(
  p_device_id text,
  p_label text,
  p_admin_password text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_actor(p_admin_password) THEN
    RAISE EXCEPTION 'غير مصرح: هذا الإجراء متاح للإدارة فقط';
  END IF;
  UPDATE public.device_registry SET label = p_label WHERE device_id = p_device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_device(
  p_device_id text,
  p_admin_password text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_actor(p_admin_password) THEN
    RAISE EXCEPTION 'غير مصرح: هذا الإجراء متاح للإدارة فقط';
  END IF;
  DELETE FROM public.device_registry WHERE device_id = p_device_id;
END;
$$;