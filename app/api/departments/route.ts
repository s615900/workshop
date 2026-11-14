import { getDisabledDepartments, getStaff } from "@/lib/admin";

// 客人登記頁用：回傳目前被後台停用的部門 id 與各部門接待人員
export async function GET() {
  const [disabled, staff] = await Promise.all([getDisabledDepartments(), getStaff()]);
  return Response.json({ disabled, staff });
}
