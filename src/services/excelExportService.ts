import ExcelJS from "exceljs";
import { DailyLedger } from "../types/ledger";

export const exportBatchToExcel = async (batchTitle: string, ledgers: DailyLedger[]) => {
  const workbook = new ExcelJS.Workbook();

  ledgers.forEach((dayData) => {
    const sheet = workbook.addWorksheet(`Day ${dayData.day_number}`);

    sheet.columns = [
      { header: "LOAN NO CODE", key: "loan_code", width: 14 },
      { header: "NUMBER", key: "loan_number", width: 14 },
      { header: "CASH (LOAN)", key: "cash_loan", width: 16 },
      { header: "INSURANCE", key: "insurance", width: 14 },
      { header: "WT.G", key: "wt_g", width: 10 },
      { header: "WT.MG", key: "wt_mg", width: 10 },
      { header: "ITEM CODE", key: "item_code", width: 12 },
      { header: "REDEEM NO CODE", key: "redeem_code", width: 14 },
      { header: "NUMBER", key: "redeem_number", width: 14 },
      { header: "INTEREST", key: "interest", width: 14 },
      { header: "CASH (RDM)", key: "cash_rdm", width: 16 },
      { header: "TYPE", key: "transaction_type", width: 10 },
      { header: "F/S", key: "fs_status", width: 10 },
    ];

    // Transaction rows
    dayData.transactions.forEach((tx) => sheet.addRow(tx));

    // Spacer
    sheet.addRow({});

    // Summary Section
    sheet.addRow({ loan_code: "--- CASH SUMMARY ---" });
    sheet.addRow({ loan_code: "1. Opening Balance", cash_loan: dayData.opening_balance });
    sheet.addRow({ loan_code: "2. Cash In (+)", cash_loan: dayData.cash_in });
    sheet.addRow({ loan_code: "3. Cash Out (-)", cash_loan: dayData.cash_out });
    sheet.addRow({ loan_code: "4. Loan (-)", cash_loan: dayData.total_loan });
    sheet.addRow({ loan_code: "5. Redeem (+)", cash_loan: dayData.total_redeem });
    sheet.addRow({ loan_code: "6. Receive (+)", cash_loan: dayData.receive });
    sheet.addRow({ loan_code: "7. Recovery (+)", cash_loan: dayData.recovery });
    sheet.addRow({ loan_code: "8. Insurance (+)", cash_loan: dayData.insurance });
    sheet.addRow({ loan_code: "9. Expenses (-)", cash_loan: dayData.expenses });
    sheet.addRow({ loan_code: "10. Closing Balance", cash_loan: dayData.calculated_closing_balance });
    sheet.addRow({ loan_code: "11. Actual Cash Count", cash_loan: dayData.actual_cash_count });
    sheet.addRow({ loan_code: "12. Variance", cash_loan: dayData.variance });

    const isFailedOcr = dayData.day_number > 1 && 
                        dayData.opening_balance === 0 && 
                        dayData.transactions.length === 0;

    if (isFailedOcr) {
      sheet.properties.tabColor = { argb: "FFFF0000" };
      sheet.insertRow(1, ["⚠️ OCR FAILED - NEEDS MANUAL RE-SCAN"]);
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFF0000" }, size: 14 };
      sheet.insertRow(2, []);
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${batchTitle}_Daily_Ledger_Export.xlsx`;
  a.click();
};
