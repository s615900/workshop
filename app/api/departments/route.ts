import { getDisabledDepartments } from "@/lib/admin";

// 客人登記頁用：回傳目前被後台停用的部門 id
export async function GET() {
  return Response.json({ disabled: await getDisabledDepartments() });
}
