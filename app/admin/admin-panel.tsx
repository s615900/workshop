"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
const btn = "rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-40";

export default function AdminPanel() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState("");
  const [loginErr, setLoginErr] = useState("");

  const [rows, setRows] = useState<Row[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"list" | "dept">("list");

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
        setStatuses(j.statuses);
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
    call(saved, { action: "login" })
      .then(() => {
        setPw(saved);
        setAuthed(true);
        load(saved);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
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

  async function notify(r: Row) {
    if (!confirm(`要用 LINE 通知 ${r.name} 取件嗎？（${r.bookingId}）`)) return;
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

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!deptFilter || r.dept === deptFilter) &&
        (!statusFilter || r.status === statusFilter) &&
        (!k || [r.bookingId, r.name, r.contactPhone, r.product].some((v) => v.toLowerCase().includes(k))),
    );
  }, [rows, deptFilter, statusFilter, q]);

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
        <div className="mx-auto flex max-w-5xl items-center justify-between">
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

      <main className="mx-auto max-w-5xl px-4 py-5">
        <div className="mb-4 flex gap-2">
          {(["list", "dept"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
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
                      {d.code} {d.name}
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
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜尋編號／姓名／電話／商品"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              />
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm">
                <option value="">全部部門</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm">
                <option value="">全部狀態</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <button onClick={() => load(pw)} disabled={loading} className={`${btn} bg-white text-zinc-700`}>
                {loading ? "讀取中…" : "重新整理"}
              </button>
            </div>
            <p className="mb-2 text-xs text-zinc-500">共 {shown.length} 筆（新的在前）</p>
            <ul className="space-y-2">
              {shown.map((r) => (
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
                  {r.problem && <p className="mt-1 whitespace-pre-line text-sm text-zinc-500">{r.problem}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={r.status}
                      onChange={(e) => changeStatus(r, e.target.value)}
                      className="rounded-lg border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-sm"
                    >
                      {!statuses.includes(r.status) && <option value={r.status}>{r.status || "（未設定）"}</option>}
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => notify(r)}
                      disabled={!r.canNotify}
                      title={r.canNotify ? "" : "沒有 LINE 資料"}
                      className={`${btn} bg-green-600 py-1.5 text-white`}
                    >
                      通知取件
                    </button>
                  </div>
                </li>
              ))}
              {!loading && shown.length === 0 && <li className="py-8 text-center text-zinc-400">沒有資料</li>}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
