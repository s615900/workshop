import { checkAdmin, getDisabledDepartments, listBookings, notifyPickup, setDisabledDepartments, updateStatus } from "@/lib/admin";
import { DEPARTMENTS } from "@/lib/departments";

// 後台所有操作都走這支（POST，標頭帶密碼 x-admin-password）
export async function POST(request: Request) {
  if (!checkAdmin(request)) return Response.json({ error: "密碼錯誤" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    switch (body.action) {
      case "login":
        return Response.json({ ok: true });
      case "list": {
        const [data, disabled] = await Promise.all([listBookings(body.dept || undefined), getDisabledDepartments()]);
        return Response.json({ ...data, disabled });
      }
      case "status":
        await updateStatus(String(body.dept), Number(body.row), String(body.bookingId), String(body.status ?? ""));
        return Response.json({ ok: true });
      case "notify":
        await notifyPickup(String(body.dept), Number(body.row), String(body.bookingId));
        return Response.json({ ok: true });
      case "setDisabled": {
        const valid = DEPARTMENTS.map((d) => d.id);
        const ids = (Array.isArray(body.ids) ? body.ids : []).filter((id: string) => valid.includes(id));
        await setDisabledDepartments(ids);
        return Response.json({ ok: true });
      }
      default:
        return Response.json({ error: "未知的操作" }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "操作失敗" }, { status: 500 });
  }
}
