// 各部門對應的試算表分頁。headerRow 是該分頁標題列所在的列號（各分頁不同），
// code 是維修編號前綴（例如 C1-927），床墊檢測沿用既有的「測-」編號
export const DEPARTMENTS = [
  { id: "C1", code: "C1", name: "C1-登山露營戶外", sheet: "C1", headerRow: 2 },
  { id: "C2", code: "C2", name: "C2-水上運動", sheet: "C2", headerRow: 1 },
  { id: "C3", code: "C3", name: "C3-健身", sheet: "C3", headerRow: 2 },
  { id: "C4", code: "C4", name: "C4-腳踏車", sheet: "C4", headerRow: 3 },
  { id: "C5", code: "C5", name: "C5-球類運動", sheet: "C5", headerRow: 1 },
  { id: "M", code: "測", name: "測-床墊測試", sheet: "C1-睡墊檢測", headerRow: 2 },
  { id: "T", code: "T", name: "T-燙印客製化", cardName: "T-燙印\n客製化", sheet: "T燙印", headerRow: 3 },
];

export function findDepartment(id: string) {
  return DEPARTMENTS.find((d) => d.id === id);
}
