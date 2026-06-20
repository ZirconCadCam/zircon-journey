import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { ApplicationServerKeys, generatePushHTTPRequest, setWebCrypto } from "webpush-webcrypto";

// The library reads `self.crypto`, which is absent in the Node SSR runtime.
// Point it at the global Web Crypto so it works in both Node and the Worker.
const g = globalThis as unknown as { self?: unknown; crypto?: Crypto };
if (typeof g.self === "undefined" && g.crypto) {
  setWebCrypto(g.crypto);
}

/**
 * Web Push dispatch endpoint.
 *
 * Called by a Postgres trigger (via pg_net) whenever a new chat message —
 * which is how every message / file / case handoff is delivered — is inserted.
 * It resolves the conversation's recipients (participants minus the sender),
 * looks up their device push subscriptions, and sends an encrypted Web Push to
 * each so they get a system notification even when the app is fully closed.
 *
 * Authenticated by a shared secret validated inside the `resolve_push_targets`
 * RPC (the secret never appears in client code or the repo).
 */

const ROLE_LABEL: Record<string, string> = {
  doctor: "الطبيب",
  designer: "المصمم",
  technician: "الفني",
  secretary_sanaa: "سكرتارية صنعاء",
  secretary_ibb: "سكرتارية إب",
  admin: "الإدارة",
};

type Target = { id: string; endpoint: string; p256dh: string; auth: string };
type ResolveResult = {
  config: { vapid_public: string; vapid_private: string; admin_contact: string };
  targets: Target[];
} | null;

export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-dispatch-secret") ?? "";
        let payload: {
          conversation_id?: string;
          sender?: string;
          sender_name?: string | null;
          message_type?: string;
          content?: string | null;
        };
        try {
          payload = await request.json();
        } catch {
          return new Response("bad request", { status: 400 });
        }
        if (!secret || !payload.conversation_id || !payload.sender) {
          return new Response("bad request", { status: 400 });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data, error } = await supabase.rpc("resolve_push_targets", {
          p_secret: secret,
          p_conversation: payload.conversation_id,
          p_sender: payload.sender,
        });
        if (error) return new Response("error", { status: 500 });
        const result = data as ResolveResult;
        if (!result) return new Response("unauthorized", { status: 401 });
        if (!result.targets.length) return Response.json({ ok: true, sent: 0 });

        const senderLabel = ROLE_LABEL[payload.sender] ?? payload.sender;
        const type = payload.message_type ?? "text";
        const title =
          type === "file"
            ? "📎 ملف جديد وارد"
            : type === "audio"
              ? "🎤 رسالة صوتية واردة"
              : "📩 بيانات جديدة واردة";
        const snippet = (payload.content ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120);
        const body = snippet ? `${senderLabel}: ${snippet}` : `رسالة جديدة من ${senderLabel}`;

        const keys = await ApplicationServerKeys.fromJSON({
          publicKey: result.config.vapid_public,
          privateKey: result.config.vapid_private,
        });
        const messagePayload = JSON.stringify({ title, body, url: "/", tag: "zircon-incoming" });

        let sent = 0;
        await Promise.all(
          result.targets.map(async (t) => {
            try {
              const { headers, body: encBody, endpoint } = await generatePushHTTPRequest({
                applicationServerKeys: keys,
                payload: messagePayload,
                target: { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
                adminContact: result.config.admin_contact,
                ttl: 86400,
                urgency: "high",
              });
              const res = await fetch(endpoint, { method: "POST", headers, body: encBody });
              if (res.ok) {
                sent++;
              } else if (res.status === 404 || res.status === 410) {
                // Subscription is gone — prune it.
                await supabase.rpc("prune_push_subscription", { p_secret: secret, p_id: t.id });
              }
            } catch {
              /* best-effort per target */
            }
          }),
        );

        return Response.json({ ok: true, sent });
      },
    },
  },
});
