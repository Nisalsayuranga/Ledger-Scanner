import { BRANCH_LIST, BranchName } from "../constants/branches";
import { BookCategory } from "../types/ledger";

// Helper for fuzzy string matching (Levenshtein distance)
const getEditDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

export const detectBranchAndCategoryFromFilename = (filename: string): {
  branchName: BranchName;
  bookCategory: BookCategory;
  year: number;
  month: number;
} => {
  const upper = filename.toUpperCase();
  const tokens = upper.split(/[^A-Z0-9]+/); // Split by non-alphanumeric chars

  // 1. Detect Branch with exact match, code match, or fuzzy match
  let detectedBranch: BranchName | null = null;
  
  for (const branch of BRANCH_LIST) {
    const bNameUpper = branch.name.toUpperCase();
    const bCodeUpper = branch.code.toUpperCase();
    
    // Exact code match
    if (tokens.includes(bCodeUpper)) {
      detectedBranch = branch.name as BranchName;
      break;
    }
    
    // Check if the branch name is inside the string exactly
    const exactNameRegex = new RegExp(`\\b${bNameUpper.replace(/\\s+/g, '\\s+')}\\b`);
    if (exactNameRegex.test(upper) || (branch.name === "Borella" && upper.includes("BORALLA"))) {
      detectedBranch = branch.name as BranchName;
      break;
    }
    
    // Fuzzy match on tokens (allow typos)
    for (const token of tokens) {
      if (token.length > 4 && bNameUpper.length > 4) {
        // Only allow 1 or 2 typos for longer words
        const distance = getEditDistance(token, bNameUpper);
        const maxTypos = bNameUpper.length <= 6 ? 1 : 2;
        if (distance <= maxTypos) {
          detectedBranch = branch.name as BranchName;
          break;
        }
      }
    }
    if (detectedBranch) break;
  }
  
  // Default fallback if all fails
  if (!detectedBranch) {
    detectedBranch = "Kiribathgoda";
  }

  // 2. Detect Book Category: L / R -> lr_book (L/R Book), M -> m_book (M Book)
  let bookCategory: BookCategory = "lr_book"; // Default
  
  // Look for exact word boundary matches for M or L/R
  const isMinorM = tokens.includes("M") || upper.includes("_M_") || upper.includes("-M-");
  const isMainRL = tokens.includes("R") || tokens.includes("L") || upper.includes("_R_") || upper.includes("_L_") || upper.includes("L/R") || upper.includes("LR");

  if (isMinorM && !isMainRL) {
    bookCategory = "m_book";
  } else if (isMainRL) {
    bookCategory = "lr_book";
  } else if (upper.includes("MINOR") || upper.includes("M BOOK")) {
    bookCategory = "m_book";
  }

  // 3. Detect Month (Alphabetical or Numeric)
  const currentMonth = new Date().getMonth() + 1;
  let month = currentMonth; // Default to current month
  
  const monthMap: Record<string, number> = {
    JAN: 1, JANUARY: 1,
    FEB: 2, FEBRUARY: 2,
    MAR: 3, MARCH: 3,
    APR: 4, APRIL: 4,
    MAY: 5,
    JUN: 6, JUNE: 6,
    JUL: 7, JULY: 7,
    AUG: 8, AUGUST: 8,
    SEP: 9, SEPTEMBER: 9,
    OCT: 10, OCTOBER: 10,
    NOV: 11, NOVEMBER: 11,
    DEC: 12, DECEMBER: 12
  };

  for (const [key, val] of Object.entries(monthMap)) {
    if (tokens.includes(key)) {
      month = val;
      break;
    }
  }

  // If alphabetical month not found, try to find a standalone number between 1 and 12 that isn't the year
  if (month === currentMonth) {
    for (const token of tokens) {
      const num = parseInt(token, 10);
      if (num >= 1 && num <= 12 && token.length <= 2) {
        month = num;
        break; // Assume first valid month number is the month
      }
    }
  }

  // 4. Detect Year
  let year = new Date().getFullYear(); // Default to current year
  
  for (const token of tokens) {
    const num = parseInt(token, 10);
    // Support 4-digit years (e.g. 2025) or 2-digit years (e.g. 25, 26)
    if (num >= 2020 && num <= 2030) {
      year = num;
      break;
    } else if (num >= 24 && num <= 30 && token.length === 2) {
      year = 2000 + num;
      break;
    }
  }

  return { branchName: detectedBranch, bookCategory, year, month };
};
