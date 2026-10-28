// 6 個部門。sheet 是 Google 試算表的分頁名稱，code 會自動帶入預約編號
export const DEPARTMENTS = [
  { id: "C1", code: "C1", name: "登山露營戶外" },
  { id: "C2", code: "C2", name: "水上運動" },
  { id: "C3", code: "C3", name: "健身" },
  { id: "C4", code: "C4", name: "腳踏車" },
  { id: "C5", code: "C5", name: "球類運動" },
  { id: "C6", code: "C6", name: "跑步" },
].map((d) => ({ ...d, sheet: `${d.code} ${d.name}` }));

export function findDepartment(id: string) {
  return DEPARTMENTS.find((d) => d.id === id);
}
