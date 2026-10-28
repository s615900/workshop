import { findDepartment } from "@/lib/departments";
import { appendBooking, nextSerial } from "@/lib/sheets";

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

  // 維修編號：部門代號-日期-當天流水號，例如 C1-261028-01、C1-261028-02
  const line = await verifyLine(String(idToken ?? ""));
  if (!line) {
    return Response.json({ error: "請先以 LINE 登入後再登記（登入逾時請重新整理頁面）" }, { status: 401 });
  }

  const now = new Date();
  const receivedDate = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });

  try {
    // 維修編號：部門代號-流水號，各部門各自從 001 起算，例如 C1-001、C1-002
    const prefix = `${dept.code}-`;
    const bookingId = prefix + (await nextSerial(dept.sheet, prefix));
    // 欄位順序要和試算表標題列一致：
    // 維修編號、狀態、接單日期、接單人、顧客姓名、連絡電話、會員電話、
    // 商品名稱、item、購買日期、維修部位、費用、備註、LINE姓名、LINE User ID
    await appendBooking(dept.sheet, [
      bookingId, "待接單", receivedDate, "", name, contactPhone, phone,
      productName, "", purchaseDate ?? "", "", "", problem,
      line.name, line.userId,
    ]);
    return Response.json({ ok: true, bookingId });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "寫入失敗，請稍後再試" }, { status: 500 });
  }
}
