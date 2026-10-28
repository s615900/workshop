"use client";

import { useEffect, useState } from "react";
import { DEPARTMENTS } from "@/lib/departments";

// LINE 官方帳號「加入好友」連結與官方按鈕圖片
const ADD_FRIEND_URL = "https://lin.ee/ypXAOce";
const ADD_FRIEND_IMG = "https://scdn.line-apps.com/n/line_add_friends/btn/zh-Hant.png";

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-3 outline-none transition focus:border-decathlon focus:bg-white focus:ring-2 focus:ring-decathlon/20";

const cardCls = "rounded-2xl bg-white p-5 text-zinc-900 shadow-xl shadow-black/10 sm:p-6";

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-decathlon text-sm font-bold text-white">
        {n}
      </span>
      <h2 className="text-lg font-bold">{children}</h2>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : <span className="ml-1 text-xs text-zinc-400">（選填）</span>}
      </span>
      {children}
    </label>
  );
}

export default function BookingForm() {
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [bookingId, setBookingId] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [idToken, setIdToken] = useState("");
  const [lineName, setLineName] = useState("");
  const [isFriend, setIsFriend] = useState<boolean | null>(null);

  // 有設定 LIFF ID 才啟用 LINE 登入，取得 LINE 姓名與 ID token
  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    // 網址加 ?preview 可略過 LINE 登入，只看畫面（LINE 姓名與 User ID 會是空的）
    if (!liffId || new URLSearchParams(location.search).has("preview")) return;
    (async () => {
      const { default: liff } = await import("@line/liff");
      await liff.init({ liffId });
      if (!liff.isLoggedIn()) return liff.login();
      setIdToken(liff.getIDToken() ?? "");
      setLineName((await liff.getProfile()).displayName);
      // 需要 channel 已連結官方帳號才查得到好友狀態，查不到就當作未知
      setIsFriend((await liff.getFriendship().catch(() => null))?.friendFlag ?? null);
    })().catch(console.error);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, department: dept, idToken }),
    });
    if (!res.ok) return setStatus("error");
    setBookingId((await res.json()).bookingId);
  }

  if (bookingId) {
    return (
      <div className={`${cardCls} text-center`}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-decathlon text-3xl text-white">
          ✓
        </div>
        <p className="mt-4 text-xl font-bold">登記成功</p>
        <p className="mt-4 text-sm text-zinc-500">維修編號</p>
        <p className="mt-1 text-2xl font-extrabold tracking-wide text-decathlon">{bookingId}</p>
        <p className="mt-4 text-sm text-zinc-500">維修保養完畢後，迪卡儂將以簡訊方式通知您取件。</p>
        <div className="mt-5">
          {isFriend ? (
            <p className="text-sm font-medium text-[#06C755]">✓ 已加入官方帳號好友</p>
          ) : (
            <a href={ADD_FRIEND_URL} target="_blank" rel="noopener noreferrer" className="inline-block">
              {/* LINE 官方按鈕圖片，不需經 next/image 處理 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ADD_FRIEND_IMG} alt="加入好友" height={44} className="h-11 w-auto" />
            </a>
          )}
        </div>
        <button
          className="mt-6 rounded-xl border-2 border-decathlon px-6 py-2.5 font-semibold text-decathlon transition hover:bg-decathlon hover:text-white"
          onClick={() => { setBookingId(""); setDept(""); setAgreed(false); setStatus("idle"); }}
        >
          再登記一筆
        </button>
      </div>
    );
  }

  const selected = DEPARTMENTS.find((d) => d.id === dept);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <section className={cardCls}>
        <StepTitle n={1}>選擇維修部門</StepTitle>
        <div className="grid grid-cols-2 gap-3">
          {DEPARTMENTS.map((d) => {
            const on = dept === d.id;
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => setDept(d.id)}
                className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ${
                  on
                    ? "border-decathlon bg-decathlon text-white"
                    : "border-zinc-200 bg-zinc-50 hover:border-decathlon"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold ${
                    on ? "bg-white text-decathlon" : "bg-decathlon text-white"
                  }`}
                >
                  {d.code}
                </span>
                <span className="font-semibold leading-tight">{d.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {selected && (
        <section className={cardCls}>
          <StepTitle n={2}>填寫資料</StepTitle>
          <p className="mb-4 rounded-lg bg-decathlon/10 px-3 py-2 text-sm font-medium text-decathlon">
            {selected.code} {selected.name}
            {lineName && <span className="text-zinc-500">　LINE：{lineName}</span>}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="姓名" required>
              <input name="name" required className={inputCls} />
            </Field>
            <Field label="連絡電話" required>
              <input name="contactPhone" required type="tel" className={inputCls} />
            </Field>
            <Field label="會員電話" required>
              <input name="phone" required type="tel" className={inputCls} />
            </Field>
            <Field label="購買日期">
              <input name="purchaseDate" type="date" className={inputCls} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="商品名稱" required>
                <input name="productName" required className={inputCls} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="維修問題描述" required>
                <textarea name="problem" required rows={4} className={inputCls} />
              </Field>
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="mb-2 font-bold text-decathlon">請觀看合約書後確保權益</p>
            <ol className="max-h-48 list-decimal space-y-2 overflow-y-auto pl-5 text-sm leading-relaxed text-zinc-700">
              <li>維修保養完畢後，迪卡儂將以簡訊方式通知顧客取件，請顧客於約定時間內至店內取件。</li>
              <li>
                若顧客接獲通知後有逾時未取之情形時，迪卡儂將視狀況酌收保管費用；若未取時間超過一個月時，您的商品將視同遺失物，並以法定方式處理。若因顧客逾期未取至涉訟者，迪卡儂相關法律程序及律師費用應由顧客負擔。感謝配合。
              </li>
              <li>
                產品於留置迪卡儂處保養維修期間，除有因可歸責於迪卡儂之故而受有損害者，迪卡儂將不負責賠償責任。唯部件損壞之最終判定權為迪卡儂負責保養之人員。
              </li>
            </ol>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-decathlon"
            />
            <span className="font-medium">我已閱讀並同意以上合約內容</span>
          </label>
          {status === "error" && <p className="mt-4 text-sm text-red-500">送出失敗，請稍後再試</p>}
          <button
            disabled={status === "sending" || !agreed}
            className="mt-6 w-full rounded-xl bg-decathlon py-3.5 text-lg font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:hover:brightness-100"
          >
            {status === "sending" ? "送出中…" : "送出登記"}
          </button>
        </section>
      )}
    </form>
  );
}
