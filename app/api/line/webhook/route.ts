import { createHmac, timingSafeEqual } from "crypto";
import { markPickedUp } from "@/lib/admin";

// LINE 官方帳號的 Webhook：客人傳「已取件」→ 自動把他的「待取件」登記改成已取件
// 需要環境變數 LINE_CHANNEL_SECRET（Messaging API 頻道的 Channel secret）
function validSignature(body: string, signature: string) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function reply(replyToken: string, text: string) {
  const token = process.env.LINE_MESSAGING_TOKEN;
  if (!token || !replyToken) return;
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) console.error("LINE 回覆失敗", res.status, await res.text());
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-line-signature") ?? "")) {
    return new Response("invalid signature", { status: 401 });
  }
  const events: any[] = JSON.parse(raw).events ?? [];
  for (const ev of events) {
    try {
      if (ev.type !== "message" || ev.message?.type !== "text" || !ev.source?.userId) continue;
      if (!String(ev.message.text).includes("已取件")) continue;
      const ids = await markPickedUp(ev.source.userId);
      // 查不到待取件的單就不回覆，避免打擾一般聊天
      if (ids.length) await reply(ev.replyToken, `已收到，維修編號 ${ids.join("、")} 已更新為已取件，謝謝您！`);
    } catch (e) {
      console.error("處理 LINE 事件失敗", e);
    }
  }
  return new Response("ok");
}
