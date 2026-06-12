import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Image as ImageIcon, Upload, Loader2, Trash2, UserCircle } from "lucide-react";
import { DoctorAvatar } from "@/components/doctor-avatar";
import { doctorSubject } from "@/lib/doctor-avatars";
import {
  roleSubject,
  setAvatarOverride,
  clearAvatarOverride,
  getOverrideUrl,
  useAvatarVersion,
} from "@/lib/avatar-store";

interface Doctor {
  slot: number;
  name: string;
  branch: string | null;
  active: boolean;
}

const AVATAR_BUCKET = "doctor-files";

async function uploadAvatarFile(file: File, subjectSafe: string): Promise<string | null> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `avatars/${subjectSafe}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
  });
  if (error) {
    toast.error(error.message);
    return null;
  }
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function AvatarManagerPanel() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("doctor_profiles")
      .select("slot,name,branch,active")
      .order("slot");
    setDoctors((data as Doctor[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-luxury">
      <div className="flex items-center gap-3 mb-5">
        <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold">
          <ImageIcon className="size-5 text-gold-foreground" />
        </div>
        <div>
          <div className="font-bold">صور الأطباء والفريق</div>
          <div className="text-[11px] text-muted-foreground">
            ارفع صورة وعيّنها لكل طبيب وللمصمم والفني — تظهر في كل الصفحات والمحادثات
          </div>
        </div>
      </div>

      {/* المصمم والفني */}
      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        <RoleAvatarRow roleKey="designer" label="المصمم" />
        <RoleAvatarRow roleKey="technician" label="الفني" />
      </div>

      <div className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
        <UserCircle className="size-3.5" /> الأطباء
      </div>

      {loading ? (
        <div className="py-8 grid place-items-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {doctors.filter((d) => d.active).map((d) => (
            <AvatarRow
              key={d.slot}
              subject={doctorSubject(d.name)}
              name={d.name}
              label={d.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleAvatarRow({ roleKey, label }: { roleKey: "designer" | "technician"; label: string }) {
  useAvatarVersion();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const hasPhoto = !!getOverrideUrl(roleSubject(roleKey));
  const subject = roleSubject(roleKey);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("الرجاء اختيار صورة"); return; }
    setBusy(true);
    const url = await uploadAvatarFile(f, roleKey);
    if (url) {
      const err = await setAvatarOverride(subject, url, label);
      if (err) toast.error(err.message);
      else toast.success(`تم تعيين صورة ${label}`);
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const err = await clearAvatarOverride(subject);
    if (err) toast.error(err.message); else toast.success(`تمت إزالة صورة ${label}`);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
      <DoctorAvatar name={label} roleKey={roleKey} className="size-12" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{label}</div>
        <div className="text-[10px] text-muted-foreground">{hasPhoto ? "صورة معيّنة" : "بدون صورة"}</div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="rounded-lg border border-border bg-background p-2 hover:border-gold disabled:opacity-50" title="رفع صورة">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
      </button>
      {hasPhoto && (
        <button onClick={remove} disabled={busy}
          className="rounded-lg border border-border bg-background p-2 hover:border-destructive text-destructive disabled:opacity-50" title="إزالة">
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

function AvatarRow({ subject, name, label }: { subject: string; name: string; label: string }) {
  useAvatarVersion();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const hasPhoto = !!getOverrideUrl(subject);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("الرجاء اختيار صورة"); return; }
    setBusy(true);
    const safe = subject.replace(/[^a-z0-9]+/gi, "_").slice(0, 40) || "doctor";
    const url = await uploadAvatarFile(f, safe);
    if (url) {
      const err = await setAvatarOverride(subject, url, label);
      if (err) toast.error(err.message);
      else toast.success(`تم تعيين صورة ${label}`);
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const err = await clearAvatarOverride(subject);
    if (err) toast.error(err.message); else toast.success(`تمت إزالة الصورة`);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
      <DoctorAvatar name={name} className="size-12" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{label}</div>
        <div className="text-[10px] text-muted-foreground">{hasPhoto ? "صورة معيّنة" : "بدون صورة"}</div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="rounded-lg border border-border bg-background p-2 hover:border-gold disabled:opacity-50" title="رفع صورة">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
      </button>
      {hasPhoto && (
        <button onClick={remove} disabled={busy}
          className="rounded-lg border border-border bg-background p-2 hover:border-destructive text-destructive disabled:opacity-50" title="إزالة">
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}
