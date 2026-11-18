"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { DEPARTMENTS } from "@/lib/departments";

type Row = {
  dept: string;
  deptName: string;
  row: number;
  bookingId: string;
  status: string;
  receivedDate: string;
  name: string;
  contactPhone: string;
  memberPhone: string;
  staff: string;
  product: string;
  problem: string;
  canNotify: boolean;
  updatedAt: number;
};

type EditForm = Pick<Row, "status" | "receivedDate" | "name" | "contactPhone" | "memberPhone" | "staff" | "product" | "problem">;
const emptyForm: EditForm = { status: "", receivedDate: "", name: "", contactPhone: "", memberPhone: "", staff: "", product: "", problem: "" };

const KEY = "workshop-admin-pw";
const VIEW_KEY = "workshop-admin-view";
const field = "w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-decathlon";

// 狀態小標籤的顏色（依關鍵字判斷，沒對到就用灰色）
function statusColor(s: string) {
  if (/已取|已完成|完成/.test(s)) return "bg-green-100 text-green-800";
  if (/待取件/.test(s)) return "bg-amber-100 text-amber-800";
  if (/維修中|處理中/.test(s)) return "bg-blue-100 text-blue-800";
  if (/待評估|待/.test(s)) return "bg-orange-100 text-orange-800";
  return "bg-zinc-100 text-zinc-600";
}
// 一次只畫這麼多張卡片，其餘按「顯示更多」再出現（三千多張一次畫出來，手機會很卡）
const PAGE = 60;
const btn = "rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-40";

// 維修編號尾端的數字（C4-783 → 783）
function numValue(id: string) {
  return Number(/(\d+)\s*$/.exec(id)?.[1] ?? 0);
}

// 更新時間顯示成 月/日 時:分（台北時間）
function fmtTime(ms: number) {
  const d = new Date(ms + 8 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// 接單日期常常只有「月/日」沒有年份。各部門的資料是照登記順序往下加，
// 所以從最新的一筆往回推：日期突然往後跳超過半年（例如 1/5 的下一筆舊資料是 12/28），就是跨年，年份減 1。
// 有寫年份的（2025/11/17、114/11/17）直接採用。回傳 yyyymmdd 數字，看不懂的日期回傳 0
function inferDates(rows: Row[]) {
  if (!rows.length) return new Map<string, number>(); // 預先產生頁面時沒有資料，也不能讀目前時間
  const now = new Date(Date.now() + 8 * 3600000);
  const todayMD = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const dayOfYear = (md: number) => Math.floor(md / 100) * 30.5 + (md % 100);
  const out = new Map<string, number>();
  const byDept = new Map<string, Row[]>();
  for (const r of rows) byDept.set(r.dept, [...(byDept.get(r.dept) ?? []), r]);
  for (const list of byDept.values()) {
    list.sort((a, b) => b.row - a.row); // 新的（列號大）在前
    let year = now.getUTCFullYear();
    let prevMD = todayMD; // 上一筆（比較新的）月日
    for (const r of list) {
      const n = r.receivedDate.match(/\d+/g)?.map(Number) ?? [];
      const key = `${r.dept}-${r.row}`;
      if (n.length < 2) continue;
      if (n.length >= 3 && n[0] > 31) {
        const y = n[0] < 200 ? n[0] + 1911 : n[0];
        out.set(key, y * 10000 + n[1] * 100 + n[2]);
        year = y;
        prevMD = n[1] * 100 + n[2];
        continue;
      }
      const md = n.length >= 3 ? n[0] * 100 + n[1] : n[0] * 100 + n[1];
      if (dayOfYear(md) - dayOfYear(prevMD) > 183) year -= 1;
      out.set(key, year * 10000 + md);
      prevMD = md;
    }
  }
  return out;
}

export default function AdminPanel() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState("");
  const [loginErr, setLoginErr] = useState("");

  const [rows, setRows] = useState<Row[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string[]>>({});
  const [disabled, setDisabled] = useState<string[]>([]);
  const [staff, setStaff] = useState<Record<string, string[]>>({});
  const [newStaff, setNewStaff] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  // 顯示筆數跟著篩選條件記；換條件時自動回到只顯示前面幾筆
  const [more, setMore] = useState({ key: "", n: PAGE });
  const [sort, setSort] = useState<"new" | "old">("new");
  const [tab, setTab] = useState<"list" | "pending" | "dept" | "staff">("list");
  // 預覽模式：雙排式（寬螢幕兩欄）或直列式（一欄一張），選擇會記在這台瀏覽器
  const [view, setView] = useState<"double" | "single">("double");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "single") setView("single");
    } catch {}
  }, []);
  const pickView = (v: "double" | "single") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  // 目前的分頁、部門、狀態、排序都記在網址 # 後面（例如 #d=C4&s=待取件&o=old），
  // 重新整理瀏覽器也會停在原本的條件，不會跳回全部
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get("t") === "dept") setTab("dept");
    if (p.get("t") === "staff") setTab("staff");
    if (p.get("t") === "pending") setTab("pending");
    const d = p.get("d") ?? "";
    if (DEPARTMENTS.some((x) => x.id === d)) {
      setDeptFilter(d);
      setStatusFilter(p.get("s") ?? "");
    }
    if (p.get("o") === "old") setSort("old");
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    const p = new URLSearchParams();
    if (tab !== "list") p.set("t", tab);
    if (deptFilter) p.set("d", deptFilter);
    if (deptFilter && statusFilter) p.set("s", statusFilter);
    if (sort === "old") p.set("o", "old");
    const h = p.toString();
    history.replaceState(null, "", h ? `#${h}` : location.pathname + location.search);
  }, [restored, tab, deptFilter, statusFilter, sort]);
  const go = (t: "list" | "pending" | "dept" | "staff", d = "") => {
    setTab(t);
    setDeptFilter(d);
    setStatusFilter("");
  };

  const call = useCallback(
    async (password: string, body: Record<string, unknown>) => {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(j.error ?? "操作失敗"), { status: res.status });
      return j;
    },
    [],
  );

  const load = useCallback(
    async (password: string) => {
      setLoading(true);
      try {
        const j = await call(password, { action: "list" });
        setRows(j.rows);
        setStatusMap(j.statusMap);
        setDisabled(j.disabled);
        setStaff(j.staff ?? {});
        setFailed(j.failed);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "讀取失敗");
      } finally {
        setLoading(false);
      }
    },
    [call],
  );

  // 重新開啟頁面時，用瀏覽器暫存的密碼自動登入
  useEffect(() => {
    let saved = "";
    try {
      saved = sessionStorage.getItem(KEY) ?? "";
    } catch {}
    if (!saved) return setChecking(false);
    // 直接讀清單（密碼錯會回 401），省掉先登入再讀的一次來回
    setLoading(true);
    call(saved, { action: "list" })
      .then((j) => {
        setPw(saved);
        setAuthed(true);
        setRows(j.rows);
        setStatusMap(j.statusMap);
        setDisabled(j.disabled);
        setStaff(j.staff ?? {});
        setFailed(j.failed);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setChecking(false);
      });
  }, [call, load]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr("");
    try {
      await call(input, { action: "login" });
      try {
        sessionStorage.setItem(KEY, input);
      } catch {}
      setPw(input);
      setAuthed(true);
      load(input);
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : "登入失敗");
    }
  }

  async function changeStatus(r: Row, status: string) {
    setMsg("");
    try {
      await call(pw, { action: "status", dept: r.dept, row: r.row, bookingId: r.bookingId, status });
      setRows((all) => all.map((x) => (x.dept === r.dept && x.row === r.row ? { ...x, status, updatedAt: Date.now() } : x)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新失敗");
    }
  }

  // 編輯整張單（跳出視窗）：除了維修編號以外都能改
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");
  function openEdit(r: Row) {
    setForm({ status: r.status, receivedDate: r.receivedDate, name: r.name, contactPhone: r.contactPhone, memberPhone: r.memberPhone, staff: r.staff, product: r.product, problem: r.problem });
    setFormErr("");
    setEditRow(r);
  }
  async function saveEdit() {
    if (!editRow) return;
    if (!form.name.trim()) return setFormErr("顧客姓名不能空白");
    setSaving(true);
    setFormErr("");
    try {
      await call(pw, { action: "edit", dept: editRow.dept, row: editRow.row, bookingId: editRow.bookingId, edit: form });
      setRows((all) => all.map((x) => (x.dept === editRow.dept && x.row === editRow.row ? { ...x, ...form, updatedAt: Date.now() } : x)));
      setMsg(`已儲存 ${editRow.bookingId}`);
      setEditRow(null);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function notify(r: Row) {
    // 取件期限 = 今天（台北時間）起算 5 天後，後端會用同樣的算法
    const due = new Date(Date.now() + 8 * 3600000 + 5 * 86400000);
    if (!confirm(`要用 LINE 通知 ${r.name} 取件嗎？\n編號 ${r.bookingId}，請於 ${due.getUTCMonth() + 1}月${due.getUTCDate()}日前領取`)) return;
    setMsg("");
    try {
      await call(pw, { action: "notify", dept: r.dept, row: r.row, bookingId: r.bookingId });
      setMsg(`已通知 ${r.name}（${r.bookingId}）`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "通知失敗");
    }
  }

  async function saveStaff(id: string, list: string[]) {
    const next = { ...staff, [id]: list };
    setMsg("");
    try {
      await call(pw, { action: "setStaff", staff: next });
      setStaff(next);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新失敗");
    }
  }

  async function toggleDept(id: string) {
    const next = disabled.includes(id) ? disabled.filter((x) => x !== id) : [...disabled, id];
    setMsg("");
    try {
      await call(pw, { action: "setDisabled", ids: next });
      setDisabled(next);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新失敗");
    }
  }

  // 狀態選項依部門而不同；沒選部門時不提供狀態篩選
  const filterStatuses = deptFilter ? (statusMap[deptFilter] ?? []) : [];

  const dates = useMemo(() => inferDates(rows), [rows]);
  // 「待評估」分頁：所有部門中狀態是待評估的單
  const PENDING = "待評估";
  const sf = tab === "pending" ? PENDING : statusFilter;
  const pendingCount = useMemo(() => rows.filter((r) => r.status === PENDING).length, [rows]);
  const shown = useMemo(() => {
    const k = dq.trim().toLowerCase();
    // 依維修編號排序（預設新到舊）
    return rows
      .filter(
      (r) =>
        (!deptFilter || r.dept === deptFilter) &&
        (!sf || r.status === sf) &&
        (!k || [r.bookingId, r.name, r.contactPhone, r.memberPhone, r.product].some((v) => v.toLowerCase().includes(k))),
      )
      .sort((a, b) => {
        const dir = sort === "new" ? -1 : 1;
        // 選了部門：依維修編號數字排序；「全部」：不分部門，依接單日期（推算年份後）排序，同一天再依編號
        if (!deptFilter) {
          const d = (dates.get(`${a.dept}-${a.row}`) ?? 0) - (dates.get(`${b.dept}-${b.row}`) ?? 0);
          if (d) return dir * d;
        }
        return (
          dir * (numValue(a.bookingId) - numValue(b.bookingId)) ||
          DEPARTMENTS.findIndex((d) => d.id === a.dept) - DEPARTMENTS.findIndex((d) => d.id === b.dept) ||
          dir * (a.row - b.row)
        );
      });
  }, [rows, dates, deptFilter, sf, dq, sort]);
  const filterKey = [tab, deptFilter, statusFilter, dq, sort].join("|");
  const limit = more.key === filterKey ? more.n : PAGE;
  const counts = useMemo(() => {
    const list = tab === "pending" ? rows.filter((r) => r.status === PENDING) : rows;
    const m: Record<string, number> = { "": list.length };
    for (const r of list) m[r.dept] = (m[r.dept] ?? 0) + 1;
    return m;
  }, [rows, tab]);

  if (checking) return <div className="p-8 text-center text-zinc-500">載入中…</div>;

  if (!authed) {
    return (
      <div className="flex flex-1 items-center justify-center bg-decathlon px-4">
        <form onSubmit={login} className="w-full max-w-sm rounded-2xl bg-white p-6 text-zinc-900 shadow-xl">
          <h1 className="text-xl font-bold">維修後台</h1>
          <input
            type="password"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="請輸入密碼"
            className="mt-4 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-3 outline-none focus:border-decathlon"
          />
          {loginErr && <p className="mt-2 text-sm text-red-600">{loginErr}</p>}
          <button className={`${btn} mt-4 w-full bg-decathlon py-3 text-white`}>登入</button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-zinc-100 text-zinc-900">
      <header className="bg-decathlon px-4 py-4 text-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <h1 className="text-xl font-extrabold">維修後台</h1>
          <button
            className="text-sm text-white/80 underline"
            onClick={() => {
              try {
                sessionStorage.removeItem(KEY);
              } catch {}
              setAuthed(false);
              setPw("");
              setInput("");
            }}
          >
            登出
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5">
        <div className="mb-4 flex gap-2">
          {(["list", "pending", "dept", "staff"] as const).map((t) => (
            <button
              key={t}
              onClick={() => go(t, t === "list" || t === "pending" ? deptFilter : "")}
              className={`${btn} ${tab === t ? "bg-decathlon text-white" : "bg-white text-zinc-700"}`}
            >
              {t === "list" ? "登記清單" : t === "pending" ? "待評估" : t === "dept" ? "部門開關" : "接待人員"}
              {t === "pending" && <span className="ml-1 text-xs opacity-70">{pendingCount}</span>}
            </button>
          ))}
        </div>

        {msg && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{msg}</p>}
        {failed.length > 0 && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">讀取失敗的分頁：{failed.join("、")}</p>
        )}

        {tab === "staff" ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">各部門的接待人員名單會出現在客人登記表單的下拉選單；沒有設定人員的部門不會顯示這個欄位。</p>
            {DEPARTMENTS.map((d) => {
              const list = staff[d.id] ?? [];
              return (
                <div key={d.id} className="rounded-2xl bg-white p-4 shadow">
                  <p className="font-semibold">{d.name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {list.length === 0 && <span className="text-sm text-zinc-400">尚未設定</span>}
                    {list.map((n) => (
                      <span key={n} className="flex items-center gap-1 rounded-full bg-zinc-100 py-1 pl-3 pr-2 text-sm">
                        {n}
                        <button
                          onClick={() => confirm(`要移除 ${n} 嗎？`) && saveStaff(d.id, list.filter((x) => x !== n))}
                          className="px-1 text-zinc-500 hover:text-red-600"
                          aria-label={`移除 ${n}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = (newStaff[d.id] ?? "").trim();
                      if (!n || list.includes(n)) return;
                      saveStaff(d.id, [...list, n]);
                      setNewStaff((m) => ({ ...m, [d.id]: "" }));
                    }}
                  >
                    <input
                      value={newStaff[d.id] ?? ""}
                      onChange={(e) => setNewStaff((m) => ({ ...m, [d.id]: e.target.value }))}
                      placeholder="輸入人員姓名"
                      className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm"
                    />
                    <button className={`${btn} bg-decathlon text-white`}>新增</button>
                  </form>
                </div>
              );
            })}
          </div>
        ) : tab === "dept" ? (
          <div className="rounded-2xl bg-white p-4 shadow">
            <p className="mb-3 text-sm text-zinc-500">關閉的部門不會出現在客人的登記選單，也無法登記。</p>
            <ul className="divide-y">
              {DEPARTMENTS.map((d) => {
                const on = !disabled.includes(d.id);
                return (
                  <li key={d.id} className="flex items-center justify-between py-3">
                    <span className="font-semibold">
                      {d.name}
                    </span>
                    <button
                      onClick={() => toggleDept(d.id)}
                      className={`${btn} ${on ? "bg-green-600 text-white" : "bg-zinc-300 text-zinc-700"}`}
                    >
                      {on ? "開放中" : "已關閉"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <>
            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
              {[{ id: "", name: "全部" }, ...DEPARTMENTS].map((d) => {
                const count = counts[d.id] ?? 0;
                return (
                  <button
                    key={d.id}
                    onClick={() => go("list", d.id)}
                    className={`${btn} shrink-0 ${deptFilter === d.id ? "bg-decathlon text-white" : "bg-white text-zinc-700"}`}
                  >
                    {d.name}
                    <span className="ml-1 text-xs opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜尋編號／姓名／電話／商品"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              />
              <select value={sort} onChange={(e) => setSort(e.target.value as "new" | "old")} className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm">
                <option value="new">新到舊</option>
                <option value="old">舊到新</option>
              </select>
              <select
                value={tab === "pending" ? "" : statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                disabled={!deptFilter || tab === "pending"}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm disabled:opacity-50"
              >
                <option value="">{tab === "pending" ? PENDING : deptFilter ? "全部狀態" : "先選部門"}</option>
                {filterStatuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <button onClick={() => load(pw)} disabled={loading} className={`${btn} bg-white text-zinc-700`}>
                {loading ? "讀取中…" : "重新整理"}
              </button>
              <div className="flex overflow-hidden rounded-lg border border-zinc-300 bg-white text-sm font-semibold" role="group" aria-label="預覽模式">
                {([["single", "直列式"], ["double", "雙排式"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => pickView(v)}
                    className={`px-3 py-2 ${view === v ? "bg-decathlon text-white" : "text-zinc-700"} ${v === "double" ? "hidden lg:block" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mb-2 text-xs text-zinc-500">共 {shown.length} 筆（{sort === "new" ? "新的在前" : "舊的在前"}）</p>
            <ul className={`grid gap-3 ${view === "double" ? "lg:grid-cols-2" : ""}`}>
              {shown.slice(0, limit).map((r) => (
                <li key={`${r.dept}-${r.row}`} className="flex flex-col rounded-xl border border-zinc-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-100 px-4 py-2.5">
                    <span className="text-lg font-extrabold text-decathlon">{r.bookingId}</span>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{r.deptName}</span>
                    <span className="text-xs text-zinc-500">{r.receivedDate}</span>
                    {r.updatedAt > 0 && <span className="text-xs text-zinc-400">更新 {fmtTime(r.updatedAt)}</span>}
                    <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(r.status)}`}>{r.status || "未設定"}</span>
                  </div>
                  <div className="flex-1 space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
                      <p className="text-base font-bold">{r.name}</p>
                      <p className="text-sm text-zinc-600">
                        <span className="text-zinc-400">連絡</span> {r.contactPhone || "－"}
                        <span className="ml-3 text-zinc-400">會員</span> {r.memberPhone || "－"}
                      </p>
                      {r.staff && <p className="text-xs text-zinc-500">接待：{r.staff}</p>}
                    </div>
                    {r.product && <p className="text-sm font-semibold text-zinc-800">{r.product}</p>}
                    <p className="whitespace-pre-line rounded-lg bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-600">{r.problem || "（無描述）"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-4 py-2.5">
                    <select
                      value={r.status}
                      onChange={(e) => changeStatus(r, e.target.value)}
                      className="rounded-lg border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-sm"
                    >
                      {!(statusMap[r.dept] ?? []).includes(r.status) && <option value={r.status}>{r.status || "（未設定）"}</option>}
                      {(statusMap[r.dept] ?? []).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => notify(r)}
                      disabled={!r.canNotify || r.status !== "待取件"}
                      title={r.status !== "待取件" ? "狀態要是「待取件」才能通知" : r.canNotify ? "" : "沒有 LINE 資料"}
                      className={`${btn} bg-green-600 py-1.5 text-white`}
                    >
                      通知取件
                    </button>
                    <button onClick={() => openEdit(r)} className={`${btn} ml-auto border border-zinc-300 bg-white py-1.5 text-zinc-700`}>
                      編輯
                    </button>
                  </div>
                </li>
              ))}
              {!loading && shown.length === 0 && <li className="col-span-full py-8 text-center text-zinc-400">沒有資料</li>}
            </ul>
            {shown.length > limit && (
              <button onClick={() => setMore({ key: filterKey, n: limit + PAGE * 2 })} className={`${btn} mt-3 w-full bg-white py-3 text-zinc-700`}>
                顯示更多（還有 {shown.length - limit} 筆）
              </button>
            )}
          </>
        )}
      </main>
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => !saving && setEditRow(null)}>
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">編輯維修單</h2>
              <span className="text-lg font-extrabold text-decathlon">{editRow.bookingId}</span>
              <span className="text-xs text-zinc-500">{editRow.deptName}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">維修編號不可修改</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">顧客姓名</span>
                <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">接單日期</span>
                <input className={field} value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">連絡電話</span>
                <input className={field} inputMode="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">會員電話</span>
                <input className={field} inputMode="tel" value={form.memberPhone} onChange={(e) => setForm({ ...form, memberPhone: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">接待人員</span>
                {(staff[editRow.dept] ?? []).length > 0 ? (
                  <select className={field} value={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.value })}>
                    {!(staff[editRow.dept] ?? []).includes(form.staff) && <option value={form.staff}>{form.staff || "（未設定）"}</option>}
                    {(staff[editRow.dept] ?? []).map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                ) : (
                  <input className={field} value={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.value })} />
                )}
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">狀態</span>
                <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {!(statusMap[editRow.dept] ?? []).includes(form.status) && <option value={form.status}>{form.status || "（未設定）"}</option>}
                  {(statusMap[editRow.dept] ?? []).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-zinc-500">商品名稱</span>
                <input className={field} value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-zinc-500">商品狀況描述</span>
                <textarea className={field} rows={Math.max(4, form.problem.split("\n").length + 1)} value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} />
              </label>
            </div>
            {formErr && <p className="mt-3 text-sm text-red-600">{formErr}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={saveEdit} disabled={saving} className={`${btn} flex-1 bg-decathlon py-2.5 text-white`}>
                {saving ? "儲存中…" : "儲存"}
              </button>
              <button onClick={() => setEditRow(null)} disabled={saving} className={`${btn} bg-zinc-200 py-2.5 text-zinc-700`}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
