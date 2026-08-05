export interface BranchInfo {
  name: string;
  code: string;
}

export const BRANCH_LIST: BranchInfo[] = [
  { name: "Borella", code: "BRL" },
  { name: "Dehiwala", code: "DMW" },
  { name: "Dematagoda", code: "DMT" },
  { name: "Homagama", code: "HMG" },
  { name: "Head Office", code: "HQ" },
  { name: "Kadawatha", code: "KDW" },
  { name: "Kiribathgoda", code: "KIR" },
  { name: "Kotikawatta", code: "KOT" },
  { name: "Kottawa", code: "KTW" },
  { name: "Panadura", code: "PND" },
  { name: "Wattala 2", code: "W2" },
  { name: "Wattala 3", code: "W3" },
  { name: "Wattala 4", code: "W4" },
];

export const BRANCHES = BRANCH_LIST.map((b) => b.name);
export type BranchName = typeof BRANCHES[number];

export const MONTHS = [
  { value: 1, label: "Jan", shortLabel: "Jan" },
  { value: 2, label: "Feb", shortLabel: "Feb" },
  { value: 3, label: "Mar", shortLabel: "Mar" },
  { value: 4, label: "Apr", shortLabel: "Apr" },
  { value: 5, label: "May", shortLabel: "May" },
  { value: 6, label: "Jun", shortLabel: "Jun" },
  { value: 7, label: "Jul", shortLabel: "Jul" },
  { value: 8, label: "Aug", shortLabel: "Aug" },
  { value: 9, label: "Sep", shortLabel: "Sep" },
  { value: 10, label: "Oct", shortLabel: "Oct" },
  { value: 11, label: "Nov", shortLabel: "Nov" },
  { value: 12, label: "Dec", shortLabel: "Dec" },
];

export const YEARS = [2025, 2026];
