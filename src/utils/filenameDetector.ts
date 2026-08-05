import { BRANCH_LIST, BranchName } from "../constants/branches";
import { BookCategory } from "../types/ledger";

export const detectBranchAndCategoryFromFilename = (filename: string): {
  branchName: BranchName;
  bookCategory: BookCategory;
  year: number;
  month: number;
} => {
  const upper = filename.toUpperCase();

  // Detect Branch
  let detectedBranch: BranchName = "Kiribathgoda";
  for (const branch of BRANCH_LIST) {
    const bNameUpper = branch.name.toUpperCase();
    const bCodeUpper = branch.code.toUpperCase();
    
    const nameRegex = new RegExp(`\\b${bNameUpper.replace(/\s+/g, '\\s+')}\\b`);
    const codeRegex = new RegExp(`\\b${bCodeUpper}\\b`);

    if (
      nameRegex.test(upper) ||
      codeRegex.test(upper) ||
      (branch.name === "Borella" && upper.includes("BORALLA"))
    ) {
      detectedBranch = branch.name as BranchName;
      break;
    }
  }

  // Detect Book Category: L / R -> lr_book (L/R Book), M -> m_book (M Book)
  let bookCategory: BookCategory = "lr_book";
  
  const isMinorM = /\bM\b/.test(upper) || upper.includes(" M ") || upper.includes("_M_") || upper.includes("-M-");
  const isMainRL = /\b(R|L)\b/.test(upper) || upper.includes(" R ") || upper.includes(" L ") || upper.includes("_R_") || upper.includes("_L_");

  if (isMinorM && !isMainRL) {
    bookCategory = "m_book";
  } else if (isMainRL) {
    bookCategory = "lr_book";
  }

  // Detect Month
  let month = 10;
  let year = 2025;
  if (upper.includes("JAN")) month = 1;
  else if (upper.includes("FEB")) month = 2;
  else if (upper.includes("MAR")) month = 3;
  else if (upper.includes("APR")) month = 4;
  else if (upper.includes("MAY")) month = 5;
  else if (upper.includes("JUN")) month = 6;
  else if (upper.includes("JUL")) month = 7;
  else if (upper.includes("AUG")) month = 8;
  else if (upper.includes("SEP")) month = 9;
  else if (upper.includes("OCT")) month = 10;
  else if (upper.includes("NOV")) month = 11;
  else if (upper.includes("DEC")) month = 12;

  if (upper.includes("2026")) year = 2026;

  return { branchName: detectedBranch, bookCategory, year, month };
};
