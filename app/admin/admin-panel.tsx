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
  product: string;
  problem: string;
  canNotify: boolean;
};

const KEY = "workshop-admin-pw";
// 一次只畫這麼多張卡片，其餘按「顯示更多」再出現（三千多張一次畫出來，手機會很卡）
const PAGE = 60;
const btn = "rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-40";

// 維修編號尾端的數字（C4-783 → 783）
function numValue(id: string) {
  return Number(/(\d+)\s*$/.exec(id)?.[1] ?? 0);
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
  const [tab, setTab] = useState<"list" | "dept">("list");

  // 目前的分頁、部門、狀態、排序都記在網址 # 後面（例如 #d=C4&s=待取件&o=old），
  // 重新整理瀏覽器也會停在原本的條件，不會跳回全部
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get("t") === "dept") setTab("dept");
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
    if (tab === "dept") p.set("t", "dept");
    if (deptFilter) p.set("d", deptFilter);
    if (deptFilter && statusFilter) p.set("s", statusFilter);
    if (sort === "old") p.set("o", "old");
    const h = p.toString();
    history.replaceState(null, "", h ? `#${h}` : location.pathname + location.search);
  }, [restored, tab, deptFilter, statusFilter, sort]);
  const go = (t: "list" | "dept", d = "") => {
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
      setRows((all) => all.map((x) => (x.dept === r.dept && x.row === r.row ? { ...x, status } : x)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新失敗");
    }
  }

  // 編輯商品狀況描述：editing 記錄正在編輯哪一筆與目前的文字
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  async function saveProblem(r: Row) {
    if (!editing) return;
    setMsg("");
    try {
      await call(pw, { action: "problem", dept: r.dept, row: r.row, bookingId: r.bookingId, value: editing.text });
      setRows((all) => all.map((x) => (x.dept === r.dept && x.row === r.row ? { ...x, problem: editing.text } : x)));
      setEditing(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "儲存失敗");
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

  const shown = useMemo(() => {
    const k = dq.trim().toLowerCase();
    // 依維修編號排序（預設新到舊）
    return rows
      .filter(
      (r) =>
        (!deptFilter || r.dept === deptFilter) &&
        (!statusFilter || r.status === statusFilter) &&
        (!k || [r.bookingId, r.name, r.contactPhone, r.product].some((v) => v.toLowerCase().includes(k))),
      )
      .sort((a, b) => {
        // 依維修編號排序（「全部」時先依部門順序分組）；新到舊 = 編號大的在前
        const dept = DEPARTMENTS.findIndex((d) => d.id === a.dept) - DEPARTMENTS.findIndex((d) => d.id === b.dept);
        if (dept) return dept;
        return (sort === "new" ? -1 : 1) * (numValue(a.bookingId) - numValue(b.bookingId) || a.row - b.row);
      });
  }, [rows, deptFilter, statusFilter, dq, sort]);
  const filterKey = [deptFilter, statusFilter, dq, sort].join("|");
  const limit = more.key === filterKey ? more.n : PAGE;
  const counts = useMemo(() => {
    const m: Record<string, number> = { "": rows.length };
    for (const r of rows) m[r.dept] = (m[r.dept] ?? 0) + 1;
    return m;
  }, [rows]);

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
          {(["list", "dept"] as const).map((t) => (
            <button
              key={t}
              onClick={() => go(t, t === "list" ? deptFilter : "")}
              className={`${btn} ${tab === t ? "bg-decathlon text-white" : "bg-white text-zinc-700"}`}
            >
              {t === "list" ? "登記清單" : "部門開關"}
            </button>
          ))}
        </div>

        {msg && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{msg}</p>}
        {failed.length > 0 && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">讀取失敗的分頁：{failed.join("、")}</p>
        )}

        {tab === "dept" ? (
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
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                disabled={!deptFilter}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm disabled:opacity-50"
              >
                <option value="">{deptFilter ? "全部狀態" : "先選部門"}</option>
                {filterStatuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <button onClick={() => load(pw)} disabled={loading} className={`${btn} bg-white text-zinc-700`}>
                {loading ? "讀取中…" : "重新整理"}
              </button>
            </div>
            <p className="mb-2 text-xs text-zinc-500">共 {shown.length} 筆（{sort === "new" ? "新的在前" : "舊的在前"}）</p>
            <ul className="grid gap-2 xl:grid-cols-2">
              {shown.slice(0, limit).map((r) => (
                <li key={`${r.dept}-${r.row}`} className="rounded-xl bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-extrabold text-decathlon">{r.bookingId}</span>
                    <span className="text-xs text-zinc-500">{r.deptName}</span>
                    <span className="text-xs text-zinc-500">{r.receivedDate}</span>
                  </div>
                  <p className="mt-1 font-semibold">
                    {r.name} <span className="font-normal text-zinc-500">{r.contactPhone}</span>
                  </p>
                  <p className="text-sm text-zinc-700">{r.product}</p>
                  {editing?.key === `${r.dept}-${r.row}` ? (
                    <div className="mt-1">
                      <textarea
                        value={editing.text}
                        onChange={(e) => setEditing({ key: editing.key, text: e.target.value })}
                        rows={Math.max(3, editing.text.split("\n").length + 1)}
                        className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-sm"
                        autoFocus
                      />
                      <div className="mt-1 flex gap-2">
                        <button onClick={() => saveProblem(r)} className={`${btn} bg-decathlon py-1.5 text-white`}>儲存</button>
                        <button onClick={() => setEditing(null)} className={`${btn} bg-zinc-200 py-1.5 text-zinc-700`}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-start gap-2">
                      <p className="flex-1 whitespace-pre-line text-sm text-zinc-500">{r.problem || "（無描述）"}</p>
                      <button
                        onClick={() => setEditing({ key: `${r.dept}-${r.row}`, text: r.problem })}
                        className="shrink-0 text-xs text-decathlon underline"
                      >
                        編輯
                      </button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
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
    </div>
  );
}
