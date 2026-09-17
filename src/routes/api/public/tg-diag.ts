import { createFileRoute } from "@tanstack/react-router";

/** Temporary diagnostic: verify the Telegram bot can post to the clinic group. */
export const Route = createFileRoute("/api/public/tg-diag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = process.env["REPORTS_CRON_KEY"];
        if (!key || request.headers.get("x-cron-key") !== key) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        const chatEnv = (process.env["TELEGRAM_CHAT_ID"] || "").trim();
        if (!token) return Response.json({ hasToken: false });
        const chatId = /^-\d{6,}$/.test(chatEnv) ? chatEnv : "-1003242061826";
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: "diag" }),
        });
        const body = await res.text();
        return Response.json({
          hasToken: true,
          chatEnvValid: /^-\d{6,}$/.test(chatEnv),
          status: res.status,
          body: body.slice(0, 400),
        });
      },
    },
  },
});
