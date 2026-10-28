import BookingForm from "./booking-form";

export default function Home() {
  return (
    <div className="flex-1 bg-decathlon">
      <main className="mx-auto w-full max-w-xl px-4 pb-12 pt-10">
        <header className="mb-6 text-white">
          <p className="text-xs font-semibold tracking-[0.25em] text-white/70">REPAIR SERVICE</p>
          <h1 className="mt-1 flex items-center gap-3 text-4xl font-extrabold">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-decathlon">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </span>
            維修登記
          </h1>
          <p className="mt-2 text-sm text-white/80">選擇維修部門、填寫資料，送出後會取得維修編號。</p>
        </header>
        <BookingForm />
      </main>
    </div>
  );
}
