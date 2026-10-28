import BookingForm from "./booking-form";

export default function Home() {
  return (
    <div className="flex-1 bg-decathlon">
      <main className="mx-auto w-full max-w-xl px-4 pb-12 pt-10">
        <header className="mb-6 text-white">
          <p className="text-xs font-semibold tracking-[0.25em] text-white/70">REPAIR SERVICE</p>
          <h1 className="mt-1 text-4xl font-extrabold">維修登記</h1>
          <p className="mt-2 text-sm text-white/80">選擇維修部門、填寫資料，送出後會取得維修編號。</p>
        </header>
        <BookingForm />
      </main>
    </div>
  );
}
