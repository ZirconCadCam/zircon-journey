# نقل التطبيق إلى Vercel

1. صدّر المشروع إلى GitHub من Lovable.
2. إضافة Nitro مثبتة مسبقاً في المشروع.
3. ملف `vite.config.vercel.ts` موجود جاهزاً في المشروع (لا حاجة لإنشائه):
```ts
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
export default defineConfig({
  plugins: [tsConfigPaths(), tailwindcss(), tanstackStart({ server: { entry: "server" } }), nitro({ preset: "vercel" }), viteReact()],
});
```
4. أضف إلى `package.json` → scripts: `"build:vercel": "vite build -c vite.config.vercel.ts"`.
5. في Vercel: Import من GitHub، ثم أضف كل المتغيرات الموجودة في `.env.example`.
6. قاعدة البيانات Supabase: إن نقلتها لمشروع Supabase خاص بك، شغّل ملفات `supabase/migrations` عليه (`supabase db push`)، وانقل ملفات التخزين، وأضف رابط Vercel في Auth → URL Configuration.
7. مهام cron (تفريغ تلجرام والتقارير الشهرية): أنشئها في Vercel Cron أو pg_cron تستدعي `/api/public/...`.
