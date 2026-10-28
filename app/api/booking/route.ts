import { findDepartment } from "@/lib/departments";
import { pushBookingCard } from "@/lib/line";
import { createBooking } from "@/lib/sheets";

// 用 LINE 官方 API 驗證 LIFF 的 ID token：必須是已登入 LINE 的人才能登記，也避免偽造 User ID
async function verifyLine(idToken: string) {
  const channelId = process.env.LINE_CHANNEL_ID;
  if (!idToken || !channelId) return null;
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  return { name: String(j.name ?? ""), userId: String(j.sub ?? "") };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { department, name, contactPhone, phone, productName, purchaseDate, problem, idToken } = body ?? {};

  const dept = findDepartment(String(department ?? ""));
  if (!dept || !name || !contactPhone || !phone || !productName || !problem) {
    return Response.json({ error: "資料不完整" }, { status: 400 });
  }

  const line = await verifyLine(String(idToken ?? ""));
  if (!line) {
    return Response.json({ error: "請先以 LINE 登入後再登記（登入逾時請重新整理頁面）" }, { status: 401 });
  }

  const now = new Date();
  const receivedDate = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });

  try {
    // 編號與寫入位置由 createBooking 依各分頁現有資料自動接續；
    // 分頁沒有的欄位會跳過，不動其他欄位
    const bookingId = await createBooking(dept, {
      status: "待評估",
      receivedDate,
      name,
      contactPhone,
      memberPhone: phone,
      product: productName,
      purchaseDate: purchaseDate ?? "",
      problem,
      lineName: line.name,
      lineUserId: line.userId,
    });
    // 推播登記完成卡片給客人；失敗只記錄，不影響登記結果
    await pushBookingCard(line.userId, {
      bookingId,
      department: dept.sheet,
      name,
      productName,
      receivedDate,
    }).catch(console.error);
    return Response.json({ ok: true, bookingId });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "寫入失敗，請稍後再試" }, { status: 500 });
  }
}
