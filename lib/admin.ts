import { timingSafeEqual } from "crypto";
import { DEPARTMENTS, findDepartment } from "./departments";
import { columnLetter, getClient } from "./sheets";

const SETTINGS_TAB = "後台設定";
export const DEFAULT_STATUSES = ["待評估", "維修中", "已完成", "已取貨"];

// 後台密碼放在環境變數 ADMIN_PASSWORD；沒設定就一律拒絕
export function checkAdmin(request: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  const given = request.headers.get("x-admin-password") ?? "";
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const text = (v: unknown) => String(v ?? "").trim();
const sheetId = () => {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("缺少 GOOGLE_SHEET_ID");
  return id;
};

// 停用的部門 id（存在試算表的「後台設定」分頁 A1，用逗號分隔）；沒有該分頁就當作全部啟用
export async function getDisabledDepartments(): Promise<string[]> {
  try {
    const res = await getClient().spreadsheets.values.get({
      spreadsheetId: sheetId(),
      range: `'${SETTINGS_TAB}'!A1`,
    });
    return text(res.data.values?.[0]?.[0]).split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function setDisabledDepartments(ids: string[]) {
  const client = getClient();
  const spreadsheetId = sheetId();
  const meta = await client.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  if (!meta.data.sheets?.some((s) => s.properties?.title === SETTINGS_TAB)) {
    await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SETTINGS_TAB } } }] },
    });
  }
  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SETTINGS_TAB}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [[ids.join(",")]] },
  });
}

type Dept = (typeof DEPARTMENTS)[number];

export type AdminRow = {
  dept: string;
  deptName: string;
  row: number;
  bookingId: string;
  status: string;
  receivedDate: string;
  name: string;
  contactPhone: string;
  product: string;
  problem: string;
  canNotify: boolean;
};

const pick = (headers: string[], names: string[]) => headers.findIndex((h) => names.includes(h));

// 讀該分頁「狀態」欄的下拉選單選項（以最新一筆資料那格的設定為準）；讀不到就回傳空陣列
async function readStatusOptions(dept: Dept, statusCol: number, row: number): Promise<string[]> {
  if (statusCol < 0) return [];
  try {
    const L = columnLetter(statusCol);
    const res = await getClient().spreadsheets.get({
      spreadsheetId: sheetId(),
      ranges: [`'${dept.sheet}'!${L}${row}`],
      fields: "sheets.data.rowData.values.dataValidation",
    });
    const cond = res.data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]?.dataValidation?.condition;
    if (cond?.type !== "ONE_OF_LIST") return [];
    return (cond.values ?? []).map((v) => text(v.userEnteredValue)).filter(Boolean);
  } catch {
    return [];
  }
}

async function readDept(dept: Dept): Promise<{ rows: AdminRow[]; statuses: string[] }> {
  const res = await getClient().spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `'${dept.sheet}'!A:AZ`,
  });
  const values = res.data.values ?? [];
  const headers = (values[dept.headerRow - 1] ?? []).map(text);
  const col = {
    status: pick(headers, ["狀態"]),
    date: pick(headers, ["接單日期"]),
    name: pick(headers, ["顧客姓名"]),
    phone: pick(headers, ["連絡電話"]),
    product: pick(headers, ["商品名稱", "燙印商品"]),
    problem: pick(headers, ["維修部位", "維修部位及客人說明", "備註"]),
    line: pick(headers, ["LINE User ID"]),
  };
  const get = (r: unknown[], c: number) => (c >= 0 ? text(r[c]) : "");
  const rows: AdminRow[] = [];
  for (let i = dept.headerRow; i < values.length; i++) {
    const r = values[i] ?? [];
    const bookingId = text(r[0]);
    // 只列出有填顧客姓名的列（預先編好號的空白列不列）
    if (!bookingId || !get(r, col.name)) continue;
    rows.push({
      dept: dept.id,
      deptName: dept.name,
      row: i + 1,
      bookingId,
      status: get(r, col.status),
      receivedDate: get(r, col.date),
      name: get(r, col.name),
      contactPhone: get(r, col.phone),
      product: get(r, col.product),
      problem: get(r, col.problem),
      canNotify: get(r, col.line) !== "",
    });
  }
  const lastRow = rows.length ? rows[rows.length - 1].row : dept.headerRow + 1;
  const listed = await readStatusOptions(dept, col.status, lastRow);
  const used = [...new Set(rows.map((r) => r.status).filter(Boolean))];
  return { rows: rows.reverse(), statuses: listed.length ? listed : [...new Set([...DEFAULT_STATUSES, ...used])] };
}

export async function listBookings(deptId?: string) {
  const depts = deptId ? DEPARTMENTS.filter((d) => d.id === deptId) : DEPARTMENTS;
  const settled = await Promise.allSettled(depts.map(readDept));
  const rows: AdminRow[] = [];
  const failed: string[] = [];
  const statusMap: Record<string, string[]> = {};
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      rows.push(...s.value.rows);
      statusMap[depts[i].id] = s.value.statuses;
    } else failed.push(depts[i].name);
  });
  return { rows, statusMap, failed };
}

// 確認指定列的維修編號沒有被改過，避免寫錯列
async function locate(deptId: string, row: number, bookingId: string) {
  const dept = findDepartment(deptId);
  if (!dept) throw new Error("找不到部門");
  const api = getClient().spreadsheets.values;
  const [idRes, headerRes] = await Promise.all([
    api.get({ spreadsheetId: sheetId(), range: `'${dept.sheet}'!A${row}` }),
    api.get({ spreadsheetId: sheetId(), range: `'${dept.sheet}'!${dept.headerRow}:${dept.headerRow}` }),
  ]);
  if (text(idRes.data.values?.[0]?.[0]) !== bookingId) throw new Error("資料已變動，請重新整理");
  const headers = (headerRes.data.values?.[0] ?? []).map(text);
  return { dept, headers };
}

export async function updateStatus(deptId: string, row: number, bookingId: string, status: string) {
  const { dept, headers } = await locate(deptId, row, bookingId);
  const c = headers.indexOf("狀態");
  if (c < 0) throw new Error("這個分頁沒有「狀態」欄");
  await getClient().spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `'${dept.sheet}'!${columnLetter(c)}${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[status]] },
  });
}

// 取件期限 = 通知當天（台北時間）起算 5 天後
function pickupDeadline() {
  const d = new Date(Date.now() + 8 * 3600000 + 5 * 86400000);
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const BLUE = "#3643BA";

// 取件通知小卡片（LINE Flex Message），風格與登記完成卡片一致
function pickupCard(bookingId: string, month: number, day: number) {
  const small = (t: string, extra: object = {}) => ({ type: "text", text: t, size: "sm", color: "#444444", wrap: true, ...extra });
  return {
    type: "flex",
    altText: `維修完成通知 ${bookingId}，請於${month}月${day}日前取件`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: BLUE,
        paddingAll: "16px",
        contents: [{ type: "text", text: "維修完成通知", color: "#FFFFFF", weight: "bold", size: "lg" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          small("您的維修商品已維修完成", { color: "#222222" }),
          { type: "text", text: "維修編號", size: "sm", color: "#888888", margin: "md" },
          { type: "text", text: bookingId, size: "3xl", weight: "bold", color: BLUE },
          { type: "separator", margin: "md" },
          { type: "text", text: "取件期限", size: "sm", color: "#888888" },
          { type: "text", text: `${month}月${day}日前`, size: "xl", weight: "bold", color: "#222222" },
          small("請至迪卡儂三重店維修工作室領取商品，逾期恕不負擔保管責任。", { margin: "md" }),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "如有相關疑問，可直接透過本聊天室視窗與我們聯繫。迪卡儂三重店謝謝您。", size: "xs", color: "#888888", wrap: true },
        ],
      },
    },
  };
}

export async function notifyPickup(deptId: string, row: number, bookingId: string) {
  const { month, day } = pickupDeadline();
  const token = process.env.LINE_MESSAGING_TOKEN;
  if (!token) throw new Error("Vercel 上缺少環境變數 LINE_MESSAGING_TOKEN");
  const { dept, headers } = await locate(deptId, row, bookingId);
  const c = headers.indexOf("LINE User ID");
  if (c < 0) throw new Error("這個分頁沒有「LINE User ID」欄");
  const sc = headers.indexOf("狀態");
  const [res, st] = await Promise.all([
    getClient().spreadsheets.values.get({ spreadsheetId: sheetId(), range: `'${dept.sheet}'!${columnLetter(c)}${row}` }),
    sc >= 0
      ? getClient().spreadsheets.values.get({ spreadsheetId: sheetId(), range: `'${dept.sheet}'!${columnLetter(sc)}${row}` })
      : Promise.resolve(null),
  ]);
  if (text(st?.data.values?.[0]?.[0]) !== "待取件") throw new Error("狀態要是「待取件」才能通知");
  const userId = text(res.data.values?.[0]?.[0]);
  if (!userId) throw new Error("這筆沒有 LINE 資料，無法通知");
  const push = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      to: userId,
      messages: [pickupCard(bookingId, month, day)],
    }),
  });
  if (!push.ok) {
    const detail = await push.text().catch(() => "");
    console.error("LINE 通知失敗", push.status, detail);
    throw new Error(`LINE 推播失敗（${push.status}）${detail.slice(0, 200)}`);
  }
}
