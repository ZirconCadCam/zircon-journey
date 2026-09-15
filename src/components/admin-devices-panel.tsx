import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, CheckCircle2, RefreshCw, Trash2, MonitorSmartphone, Pencil, Search } from "lucide-react";
import {
  listDevices, setDeviceBlocked, setDeviceLabel, deleteDevice,
  describeDevice, getDeviceId, type DeviceRow,
} from "@/lib/device-registry";

function fmt(ts: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
  } catch { return ts; }
}

/** Administration tab: every device browsing the app + block / unblock. */
export function AdminDevicesPanel() {
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [me, setMe] = useState("");

  useEffect(() => { setMe(getDeviceId()); load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setRows(await listDevices());
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر تحميل الأجهزة");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(d: DeviceRow) {
    if (d.device_id === me && !d.blocked) {
      toast.error("لا يمكن حظر الجهاز الذي تستخدمه الآن");
      return;
    }
    setBusy(d.device_id);
    try {
      await setDeviceBlocked(d.device_id, !d.blocked);
      toast.success(d.blocked ? "تم إلغاء الحظر" : "تم حظر الجهاز");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التنفيذ");
    } finally { setBusy(null); }
  }

  async function rename(d: DeviceRow) {
    const label = window.prompt("اسم وصفي للجهاز:", d.label ?? "");
    if (label === null) return;
    try {
      await setDeviceLabel(d.device_id, label.trim());
      await load();
    } catch (e: any) { toast.error(e?.message ?? "تعذّر الحفظ"); }
  }

  async function remove(d: DeviceRow) {
    if (!window.confirm("حذف هذا الجهاز من السجل؟")) return;
    try {
      await deleteDevice(d.device_id);
      toast.success("تم الحذف");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "تعذّر الحذف"); }
  }

  const visible = rows.filter(d => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return [d.label, d.ip, d.device_id, d.user_agent, d.last_role, d.last_path]
      .some(v => (v ?? "").toLowerCase().includes(s));
  });

  const blockedCount = rows.filter(d => d.blocked).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MonitorSmartphone className="size-5 text-gold" /> عناوين الأجهزة
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {rows.length} جهاز مُسجّل • {blockedCount} محظور
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="size-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث بالعنوان أو الاسم..."
              className="rounded-xl border border-input bg-card pr-9 pl-3 py-2 text-sm outline-none focus:border-gold w-56" />
          </div>
          <button onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold hover:border-gold transition">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> تحديث
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-x-auto shadow-luxury">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted text-xs font-bold">
            <tr>
              <th className="text-start p-3">الجهاز</th>
              <th className="text-start p-3">عنوان الشبكة (IP)</th>
              <th className="text-start p-3">آخر صفحة</th>
              <th className="text-start p-3">الزيارات</th>
              <th className="text-start p-3">آخر ظهور</th>
              <th className="text-start p-3">الحالة</th>
              <th className="text-start p-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(d => (
              <tr key={d.device_id} className={`border-t border-border ${d.blocked ? "bg-destructive/5" : ""}`}>
                <td className="p-3">
                  <div className="font-semibold">
                    {d.label || describeDevice(d.user_agent, d.platform)}
                    {d.device_id === me && <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-[10px]">هذا الجهاز</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">{d.device_id.slice(0, 12)}</div>
                </td>
                <td className="p-3 font-mono text-xs" dir="ltr">{d.ip || "—"}</td>
                <td className="p-3 text-xs" dir="ltr">{d.last_path || "—"}</td>
                <td className="p-3 text-xs">{d.visits}</td>
                <td className="p-3 text-xs">{fmt(d.last_seen)}</td>
                <td className="p-3">
                  {d.blocked
                    ? <span className="rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-[11px] font-bold">محظور</span>
                    : <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">مسموح</span>}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => toggle(d)} disabled={busy === d.device_id}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        d.blocked ? "border border-border hover:border-gold" : "bg-destructive text-destructive-foreground hover:brightness-110"
                      }`}>
                      {d.blocked ? <><CheckCircle2 className="size-3.5" /> إلغاء الحظر</> : <><Ban className="size-3.5" /> حظر</>}
                    </button>
                    <button onClick={() => rename(d)} title="تسمية"
                      className="size-8 grid place-items-center rounded-lg border border-border hover:border-gold transition">
                      <Pencil className="size-3.5" />
                    </button>
                    <button onClick={() => remove(d)} title="حذف من السجل"
                      className="size-8 grid place-items-center rounded-lg border border-border hover:border-destructive transition">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">لا توجد أجهزة مسجّلة.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
