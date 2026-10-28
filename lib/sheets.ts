import { google } from "googleapis";
import type { DEPARTMENTS } from "./departments";

type Department = (typeof DEPARTMENTS)[number];

// 表單欄位 → 試算表標題名稱（依序找第一個存在的標題）。
// 分頁裡沒有的欄位就整個跳過，不動、不輸入。
const HEADERS = {
  status: ["狀態"],
  receivedDate: ["接單日期"],
  name: ["顧客姓名"],
  contactPhone: ["連絡電話"],
  memberPhone: ["會員電話"],
  product: ["商品名稱", "燙印商品"],
  purchaseDate: ["購買日期"],
  problem: ["維修部位", "維修部位及客人說明", "備註"],
  lineName: ["LINE姓名"],
  lineUserId: ["LINE User ID"],
} as const;

// 這兩個欄位在試算表裡是「真的日期」，要寫成日期（而不是文字）才會和現有資料一起排序、篩選
const DATE_FORMATS: Partial<Record<keyof typeof HEADERS, string>> = {
  receivedDate: "M/d",
  purchaseDate: "yyyy/M/d",
};

export type BookingRecord = Record<keyof typeof HEADERS, string>;

function getClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // 容忍貼到 Vercel 時多出的引號，並把字面上的 \n 還原成換行
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim()
    .replace(/^"|"$/g, "")
    .replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("缺少 Google 服務帳號環境變數");
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function columnLetter(index: number) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// 只讀：算出新登記要用的編號、寫入的列，以及每個欄位會填進哪一欄。
// 各分頁在最後一筆真實資料後面，通常有預先編好號、還沒填資料的空白列（例如 C1-828…）。
// 優先使用其中第一列（沿用它的編號與格式）；用完才在最後面新增一列並接續編號。
export async function planBooking(dept: Department, record: BookingRecord) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("缺少 GOOGLE_SHEET_ID");
  const api = getClient().spreadsheets.values;
  const q = `'${dept.sheet}'`;

  const header = await api.get({ spreadsheetId, range: `${q}!${dept.headerRow}:${dept.headerRow}` });
  const headers = (header.data.values?.[0] ?? []).map((h) => String(h).trim());

  // 編號欄、顧客姓名欄、狀態欄一次讀完（算一次讀取）
  const signalCols = [headers.indexOf("顧客姓名"), headers.indexOf("狀態")].filter((c) => c >= 0);
  const batch = await api.batchGet({
    spreadsheetId,
    ranges: [`${q}!A:A`, ...signalCols.map((c) => `${q}!${columnLetter(c)}:${columnLetter(c)}`)],
  });
  const [colA, ...signals] = (batch.data.valueRanges ?? []).map((r) => r.values ?? []);
  const text = (v: unknown) => String(v ?? "").trim();

  const prefix = `${dept.code}-`;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const rows = colA.map((r, i) => ({
    row: i + 1,
    num: pattern.exec(text(r?.[0]))?.[1],
    filled: signals.some((c) => text(c[i]?.[0]) !== ""),
  })).filter((r) => r.row > dept.headerRow && r.num !== undefined);

  const lastDataRow = rows.reduce((m, r) => (r.filled ? Math.max(m, r.row) : m), dept.headerRow);
  const spare = rows.find((r) => r.row > lastDataRow && !r.filled);

  let bookingId: string;
  let row: number;
  if (spare) {
    bookingId = `${prefix}${spare.num}`;
    row = spare.row;
  } else {
    const max = rows.reduce((m, r) => Math.max(m, Number(r.num)), 0);
    bookingId = prefix + String(max + 1).padStart(3, "0");
    row = Math.max(lastDataRow, ...rows.map((r) => r.row)) + 1;
  }

  const cells: { cell: string; col: number; header: string; value: string; align: string; dateFormat?: string; skip?: boolean }[] = [
    { cell: `A${row}`, col: 0, header: "維修編號", value: bookingId, align: "CENTER", skip: !!spare },
  ];
  for (const [field, names] of Object.entries(HEADERS)) {
    const header = names.find((n) => headers.includes(n));
    if (!header) continue;
    const col = headers.indexOf(header);
    cells.push({
      cell: `${columnLetter(col)}${row}`,
      col,
      header,
      value: record[field as keyof BookingRecord],
      // 現有資料都是置中，只有問題描述靠左
      align: field === "problem" ? "LEFT" : "CENTER",
      dateFormat: DATE_FORMATS[field as keyof typeof HEADERS],
    });
  }
  return { bookingId, row, reusedSpareRow: !!spare, cells };
}

// 寫入：只寫上面算出的那幾格，其他欄位（公式、別人的資料）一律不碰。
// 文字（含電話，保留開頭 0）原樣寫入；日期寫成真日期；寫入的格子統一成現有資料的樣式（字級 12、置中）
export async function createBooking(dept: Department, record: BookingRecord) {
  const plan = await planBooking(dept, record);
  const client = getClient();
  const api = client.spreadsheets.values;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  // 分頁的列數已滿（例如 C4）時，先往下多加列，否則寫入會超出表格範圍而失敗
  const meta = await client.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title,gridProperties.rowCount)",
  });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === dept.sheet)?.properties;
  const rowCount = sheet?.gridProperties?.rowCount ?? 0;
  if (sheet && plan.row > rowCount) {
    await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ appendDimension: { sheetId: sheet.sheetId, dimension: "ROWS", length: plan.row - rowCount + 100 } }],
      },
    });
  }

  // 日期轉成試算表的日期序號（1899-12-30 起算的天數），沒填的日期就不寫
  const serial = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86400000 + 25569;
  };
  const cells = plan.cells.filter((c) => !(c.dateFormat && !c.value));
  await api.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: cells
        .filter((c) => !c.skip)
        .map((c) => ({
          range: `'${dept.sheet}'!${c.cell}`,
          values: [[c.dateFormat ? serial(c.value) : c.value]],
        })),
    },
  });

  if (sheet) {
    await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: cells.map((c) => ({
          repeatCell: {
            range: {
              sheetId: sheet.sheetId,
              startRowIndex: plan.row - 1,
              endRowIndex: plan.row,
              startColumnIndex: c.col,
              endColumnIndex: c.col + 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { fontSize: 12 },
                horizontalAlignment: c.align,
                ...(c.dateFormat ? { numberFormat: { type: "DATE", pattern: c.dateFormat } } : {}),
              },
            },
            fields:
              "userEnteredFormat.textFormat.fontSize,userEnteredFormat.horizontalAlignment" +
              (c.dateFormat ? ",userEnteredFormat.numberFormat" : ""),
          },
        })),
      },
    });
  }
  return plan.bookingId;
}
