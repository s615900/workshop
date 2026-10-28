import { google } from "googleapis";

function getClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("缺少 Google 服務帳號環境變數");
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// 把一筆預約寫進對應部門的分頁（分頁名稱 = 部門名稱）
export async function appendBooking(sheetName: string, row: string[]) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("缺少 GOOGLE_SHEET_ID");
  await getClient().spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetName}'!A:O`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
}

// 讀出該分頁已有的編號，算出同一部門的下一個流水號（補滿 3 位），例如 C1-001 → C1-002
export async function nextSerial(sheetName: string, prefix: string) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("缺少 GOOGLE_SHEET_ID");
  const res = await getClient().spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:A`,
  });
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const used = (res.data.values ?? [])
    .map((r) => pattern.exec(String(r[0] ?? ""))?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return String(next).padStart(3, "0");
}
