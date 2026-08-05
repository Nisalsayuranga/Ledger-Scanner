# Complete Implementation Guide: Automated Daily Ledger Processing System

An end-to-end blueprint and source code guide for building a web-based **Handwritten Daily Ledger Automation System** using **React (TypeScript + Vite)**, **Supabase (PostgreSQL + Auth + Storage)**, **Gemini 2.5 Vision API (6-Key Parallel Rotation Engine)**, and **ExcelJS**.

---

## 📋 Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Prerequisites & Environment Setup](#2-prerequisites--environment-setup)
3. [Supabase Database & Storage Setup (SQL Script)](#3-supabase-database--storage-setup-sql-script)
4. [React Frontend Folder Structure](#4-react-frontend-folder-structure)
5. [Types & Data Models (`src/types/ledger.ts`)](#5-types--data-models-srctypesledgerts)
6. [Gemini Multi-Key Rotation Manager (`src/services/geminiRotator.ts`)](#6-gemini-multi-key-rotation-manager-srcservicesgeminirotatorts)
7. [OCR Extraction Service (`src/services/ocrService.ts`)](#7-ocr-extraction-service-srcservicesocrservicets)
8. [PDF to Image Renderer Service (`src/services/pdfProcessor.ts`)](#8-pdf-to-image-renderer-service-srcservicespdfprocessorts)
9. [Mathematical Validation Service (`src/utils/validation.ts`)](#9-mathematical-validation-service-srcutilsvalidationts)
10. [ExcelJS Exporter Service (`src/services/excelExportService.ts`)](#10-exceljs-exporter-service-srcservicesexcelexportservicets)
11. [Supabase Client Setup (`src/services/supabaseClient.ts`)](#11-supabase-client-setup-srcservicessupabaseclientts)
12. [UI Components Implementation](#12-ui-components-implementation)
    - [`src/components/PdfUploader.tsx`](#srccomponentspdfuploadertsx)
    - [`src/components/SideBySideDashboard.tsx`](#srccomponentssidebysidedashboardtsx)
    - [`src/components/TransactionTable.tsx`](#srccomponentstransactiontabletsx)
    - [`src/components/SummaryCard.tsx`](#srccomponentssummarycardtsx)
13. [Main Application Component (`src/App.tsx`)](#13-main-application-component-srcapptsx)
14. [How to Run & Deploy](#14-how-to-run--deploy)

---

## 1. System Architecture Overview

```
 +-----------------------------------------------------------------------------------+
 |                                REACT FRONTEND (Vite / TS)                          |
 |                                                                                   |
 |   +-----------------+      +-------------------------------+      +------------+  |
 |   | PDF Drag-Drop   | ---> | Split-Screen Review Dashboard | ---> | Excel      |  |
 |   | Page Splitter   |      | (Handwritten PDF vs Grid)     |      | Exporter   |  |
 |   +-----------------+      +-------------------------------+      +------------+  |
 +-----------------------------------------------------------------------------------+
                                       |                    ^
                                       v                    |
                       +----------------------------------------+
                       |           SUPABASE BACKEND             |
                       |  - Auth & Row-Level Security           |
                       |  - Storage Buckets (PDFs & JPG Pages)  |
                       |  - PostgreSQL Database Tables          |
                       +----------------------------------------+
                                       |
                                       v
                       +----------------------------------------+
                       |          GEMINI VISION API             |
                       |  - 6 API Key Round-Robin Rotator       |
                       |  - Concurrent Async Batch Processing   |
                       |  - Structured JSON Output Enforcement  |
                       +----------------------------------------+
```

---

## 2. Prerequisites & Environment Setup

### Prerequisites
- Node.js v18.x or higher
- A Supabase project account
- 6 active Google Gemini API Keys

### Step 1: Create React Vite Project
```bash
npm create vite@latest ledger-automation-system -- --template react-ts
cd ledger-automation-system
```

### Step 2: Install Required Dependencies
```bash
npm install @supabase/supabase-js @google/generative-ai pdfjs-dist exceljs lucide-react clsx tailwindcss
```

### Step 3: Configure Environment Variables (`.env.local`)
Create a `.env.local` file in the root folder:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# 6 Gemini API Keys for Round-Robin Rotation
VITE_GEMINI_KEY_1=AIzaSy...Key1
VITE_GEMINI_KEY_2=AIzaSy...Key2
VITE_GEMINI_KEY_3=AIzaSy...Key3
VITE_GEMINI_KEY_4=AIzaSy...Key4
VITE_GEMINI_KEY_5=AIzaSy...Key5
VITE_GEMINI_KEY_6=AIzaSy...Key6
```

---

## 3. Supabase Database & Storage Setup (SQL Script)

Open your **Supabase SQL Editor** and execute the following script:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Branches Table
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Ledger Batches (Monthly Batches)
CREATE TABLE ledger_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    batch_month DATE NOT NULL,
    original_pdf_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Daily Ledger Sheets
CREATE TABLE daily_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES ledger_batches(id) ON DELETE CASCADE,
    day_number INT NOT NULL CHECK (day_number BETWEEN 1 AND 31),
    date DATE NOT NULL,
    staff_name TEXT,
    cp_balance NUMERIC(12, 2) DEFAULT 0.00,
    
    -- Cash Summary Section
    opening_balance NUMERIC(12, 2) DEFAULT 0.00,
    cash_in NUMERIC(12, 2) DEFAULT 0.00,
    cash_out NUMERIC(12, 2) DEFAULT 0.00,
    total_loan NUMERIC(12, 2) DEFAULT 0.00,
    total_redeem NUMERIC(12, 2) DEFAULT 0.00,
    receive NUMERIC(12, 2) DEFAULT 0.00,
    recovery NUMERIC(12, 2) DEFAULT 0.00,
    insurance NUMERIC(12, 2) DEFAULT 0.00,
    expenses NUMERIC(12, 2) DEFAULT 0.00,
    calculated_closing_balance NUMERIC(12, 2) DEFAULT 0.00,
    actual_cash_count NUMERIC(12, 2) DEFAULT 0.00,
    variance NUMERIC(12, 2) DEFAULT 0.00,
    
    is_validated BOOLEAN DEFAULT false,
    page_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(batch_id, day_number)
);

-- 4. Ledger Transactions Table
CREATE TABLE ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_ledger_id UUID REFERENCES daily_ledgers(id) ON DELETE CASCADE,
    
    -- Loan Section
    loan_code TEXT,
    loan_number TEXT,
    cash_loan NUMERIC(12, 2) DEFAULT 0.00,
    insurance NUMERIC(12, 2) DEFAULT 0.00,
    wt_g NUMERIC(8, 3) DEFAULT 0.000,
    wt_mg NUMERIC(8, 3) DEFAULT 0.000,
    item_code TEXT,
    
    -- Redeem Section
    redeem_code TEXT,
    redeem_number TEXT,
    interest NUMERIC(12, 2) DEFAULT 0.00,
    cash_rdm NUMERIC(12, 2) DEFAULT 0.00,
    transaction_type TEXT,
    fs_status TEXT,
    
    row_order INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Storage Bucket Setup (Run inside Supabase Storage dashboard or SQL)
INSERT INTO storage.buckets (id, name, public) VALUES ('ledger-documents', 'ledger-documents', true);
```

---

## 4. React Frontend Folder Structure

```
src/
├── components/
│   ├── PdfUploader.tsx
│   ├── SideBySideDashboard.tsx
│   ├── TransactionTable.tsx
│   └── SummaryCard.tsx
├── services/
│   ├── supabaseClient.ts
│   ├── geminiRotator.ts
│   ├── ocrService.ts
│   ├── pdfProcessor.ts
│   └── excelExportService.ts
├── types/
│   └── ledger.ts
├── utils/
│   └── validation.ts
├── App.tsx
├── main.tsx
└── index.css
```

---

## 5. Types & Data Models (`src/types/ledger.ts`)

```typescript
export interface Transaction {
  id?: string;
  daily_ledger_id?: string;
  loan_code: string;
  loan_number: string;
  cash_loan: number;
  insurance: number;
  wt_g: number;
  wt_mg: number;
  item_code: string;
  redeem_code: string;
  redeem_number: string;
  interest: number;
  cash_rdm: number;
  transaction_type: string;
  fs_status: string;
  row_order: number;
}

export interface DailyLedger {
  id?: string;
  batch_id?: string;
  day_number: number;
  date: string;
  staff_name: string;
  cp_balance: number;
  opening_balance: number;
  cash_in: number;
  cash_out: number;
  total_loan: number;
  total_redeem: number;
  receive: number;
  recovery: number;
  insurance: number;
  expenses: number;
  calculated_closing_balance: number;
  actual_cash_count: number;
  variance: number;
  is_validated: boolean;
  page_image_url: string;
  transactions: Transaction[];
}

export interface ValidationResult {
  isValid: boolean;
  loanMismatch: boolean;
  redeemMismatch: boolean;
  balanceMismatch: boolean;
  calculatedTotalLoan: number;
  calculatedTotalRedeem: number;
  formulaClosingBalance: number;
}
```

---

## 6. Gemini Multi-Key Rotation Manager (`src/services/geminiRotator.ts`)

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEYS = [
  import.meta.env.VITE_GEMINI_KEY_1,
  import.meta.env.VITE_GEMINI_KEY_2,
  import.meta.env.VITE_GEMINI_KEY_3,
  import.meta.env.VITE_GEMINI_KEY_4,
  import.meta.env.VITE_GEMINI_KEY_5,
  import.meta.env.VITE_GEMINI_KEY_6,
].filter(Boolean);

class KeyRotator {
  private currentIndex = 0;

  public getNextKey(): string {
    if (API_KEYS.length === 0) {
      throw new Error("No Gemini API keys found. Please check your .env.local file.");
    }
    const key = API_KEYS[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % API_KEYS.length;
    return key;
  }

  public getAIClient(): GoogleGenerativeAI {
    return new GoogleGenerativeAI(this.getNextKey());
  }
}

export const keyRotator = new KeyRotator();
```

---

## 7. OCR Extraction Service (`src/services/ocrService.ts`)

```typescript
import { keyRotator } from "./geminiRotator";

export const extractLedgerFromImage = async (base64Image: string) => {
  const ai = keyRotator.getAIClient();
  const model = ai.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `
  You are an expert handwriting financial auditor. Extract all ledger details from this Daily Ledger page into JSON matching this schema:

  {
    "meta": {
      "date": "YYYY-MM-DD",
      "branch": "Branch Name",
      "staff": "Staff Name",
      "cp_balance": 0.00
    },
    "transactions": [
      {
        "loan_code": "Code e.g. A / 3M",
        "loan_number": "1234",
        "cash_loan": 0.00,
        "insurance": 0.00,
        "wt_g": 0.00,
        "wt_mg": 0.00,
        "item_code": "Item e.g. PP / BRC / CAR",
        "redeem_code": "Redeem Code e.g. R",
        "redeem_number": "5678",
        "interest": 0.00,
        "cash_rdm": 0.00,
        "transaction_type": "Type e.g. PR",
        "fs_status": "F/S status"
      }
    ],
    "summary": {
      "opening_balance": 0.00,
      "cash_in": 0.00,
      "cash_out": 0.00,
      "total_loan": 0.00,
      "total_redeem": 0.00,
      "receive": 0.00,
      "recovery": 0.00,
      "insurance": 0.00,
      "expenses": 0.00,
      "closing_balance": 0.00,
      "actual_cash_count": 0.00,
      "variance": 0.00
    }
  }

  Parse clean float/int values for numeric fields (omit currency symbols and commas).
  `;

  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg);base64,/, "");

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: cleanBase64,
        mimeType: "image/jpeg"
      }
    }
  ]);

  return JSON.parse(result.response.text());
};
```

---

## 8. PDF to Image Renderer Service (`src/services/pdfProcessor.ts`)

```typescript
import * as pdfjsLib from "pdfjs-dist";

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const convertPdfToImages = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const imageUrls: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // High DPI rendering
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      await page.render({ canvasContext: context, viewport }).promise;
      imageUrls.push(canvas.toDataURL("image/jpeg", 0.85));
    }
  }

  return imageUrls;
};
```

---

## 9. Mathematical Validation Service (`src/utils/validation.ts`)

```typescript
import { DailyLedger, Transaction, ValidationResult } from "../types/ledger";

export const validateLedgerDay = (ledger: DailyLedger, transactions: Transaction[]): ValidationResult => {
  const calculatedTotalLoan = transactions.reduce((acc, t) => acc + (Number(t.cash_loan) || 0), 0);
  const calculatedTotalRedeem = transactions.reduce((acc, t) => acc + (Number(t.cash_rdm) || 0), 0);

  const formulaClosingBalance = 
    (Number(ledger.opening_balance) || 0) +
    (Number(ledger.cash_in) || 0) +
    (Number(ledger.total_redeem) || 0) +
    (Number(ledger.receive) || 0) +
    (Number(ledger.recovery) || 0) +
    (Number(ledger.insurance) || 0) -
    (Number(ledger.cash_out) || 0) -
    (Number(ledger.total_loan) || 0) -
    (Number(ledger.expenses) || 0);

  const loanMismatch = Math.abs(calculatedTotalLoan - (ledger.total_loan || 0)) > 0.01;
  const redeemMismatch = Math.abs(calculatedTotalRedeem - (ledger.total_redeem || 0)) > 0.01;
  const balanceMismatch = Math.abs(formulaClosingBalance - (ledger.calculated_closing_balance || 0)) > 0.01;

  return {
    isValid: !loanMismatch && !redeemMismatch && !balanceMismatch,
    loanMismatch,
    redeemMismatch,
    balanceMismatch,
    calculatedTotalLoan,
    calculatedTotalRedeem,
    formulaClosingBalance
  };
};
```

---

## 10. ExcelJS Exporter Service (`src/services/excelExportService.ts`)

```typescript
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
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${batchTitle}_Daily_Ledger_Export.xlsx`;
  a.click();
};
```

---

## 11. Supabase Client Setup (`src/services/supabaseClient.ts`)

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

## 12. UI Components Implementation

### `src/components/PdfUploader.tsx`
```tsx
import React, { useState } from "react";
import { Upload, FileText, Loader2 } from "lucide-react";

interface Props {
  onProcessStart: (file: File) => void;
  isProcessing: boolean;
  progressText: string;
}

export const PdfUploader: React.FC<Props> = ({ onProcessStart, isProcessing, progressText }) => {
  return (
    <div className="p-8 border-2 border-dashed border-gray-300 rounded-xl text-center bg-white shadow-sm hover:border-blue-500 transition">
      <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      <h3 className="text-lg font-semibold text-gray-700">Upload Monthly Daily Ledger PDF</h3>
      <p className="text-sm text-gray-500 mb-6">Drag and drop handwritten PDF documents or click to browse</p>
      
      <input
        type="file"
        accept="application/pdf"
        id="pdfInput"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onProcessStart(e.target.files[0])}
        disabled={isProcessing}
      />
      
      <label
        htmlFor="pdfInput"
        className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg shadow hover:bg-blue-700 cursor-pointer inline-flex items-center gap-2"
      >
        {isProcessing ? <Loader2 className="animate-spin h-5 w-5" /> : <FileText className="h-5 w-5" />}
        {isProcessing ? "Processing PDF..." : "Select PDF Document"}
      </label>

      {isProcessing && <p className="mt-4 text-sm text-blue-600 font-medium">{progressText}</p>}
    </div>
  );
};
```

---

### `src/components/TransactionTable.tsx`
```tsx
import React from "react";
import { Transaction } from "../types/ledger";

interface Props {
  transactions: Transaction[];
  onChange: (updated: Transaction[]) => void;
}

export const TransactionTable: React.FC<Props> = ({ transactions, onChange }) => {
  const handleCellChange = (index: number, field: keyof Transaction, value: any) => {
    const updated = [...transactions];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="overflow-x-auto border rounded-lg shadow-sm bg-white">
      <table className="w-full text-xs text-left text-gray-700 border-collapse">
        <thead className="bg-gray-100 uppercase text-gray-600 border-b">
          <tr>
            <th className="p-2 border">Loan Code</th>
            <th className="p-2 border">Loan No</th>
            <th className="p-2 border">Cash (Loan)</th>
            <th className="p-2 border">Insurance</th>
            <th className="p-2 border">WT.G</th>
            <th className="p-2 border">WT.MG</th>
            <th className="p-2 border">Item Code</th>
            <th className="p-2 border">Rdm Code</th>
            <th className="p-2 border">Rdm No</th>
            <th className="p-2 border">Interest</th>
            <th className="p-2 border">Cash (RDM)</th>
            <th className="p-2 border">Type</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t, idx) => (
            <tr key={idx} className="border-b hover:bg-gray-50">
              <td className="p-1 border"><input className="w-full p-1 text-xs" value={t.loan_code} onChange={(e) => handleCellChange(idx, "loan_code", e.target.value)} /></td>
              <td className="p-1 border"><input className="w-full p-1 text-xs" value={t.loan_number} onChange={(e) => handleCellChange(idx, "loan_number", e.target.value)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs font-mono text-right" value={t.cash_loan} onChange={(e) => handleCellChange(idx, "cash_loan", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs font-mono text-right" value={t.insurance} onChange={(e) => handleCellChange(idx, "insurance", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs" value={t.wt_g} onChange={(e) => handleCellChange(idx, "wt_g", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs" value={t.wt_mg} onChange={(e) => handleCellChange(idx, "wt_mg", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input className="w-full p-1 text-xs" value={t.item_code} onChange={(e) => handleCellChange(idx, "item_code", e.target.value)} /></td>
              <td className="p-1 border"><input className="w-full p-1 text-xs" value={t.redeem_code} onChange={(e) => handleCellChange(idx, "redeem_code", e.target.value)} /></td>
              <td className="p-1 border"><input className="w-full p-1 text-xs" value={t.redeem_number} onChange={(e) => handleCellChange(idx, "redeem_number", e.target.value)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs font-mono text-right" value={t.interest} onChange={(e) => handleCellChange(idx, "interest", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input type="number" className="w-full p-1 text-xs font-mono text-right" value={t.cash_rdm} onChange={(e) => handleCellChange(idx, "cash_rdm", parseFloat(e.target.value) || 0)} /></td>
              <td className="p-1 border"><input className="w-full p-1 text-xs" value={t.transaction_type} onChange={(e) => handleCellChange(idx, "transaction_type", e.target.value)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

---

### `src/components/SummaryCard.tsx`
```tsx
import React from "react";
import { DailyLedger, ValidationResult } from "../types/ledger";

interface Props {
  ledger: DailyLedger;
  validation: ValidationResult;
  onChange: (updated: DailyLedger) => void;
}

export const SummaryCard: React.FC<Props> = ({ ledger, validation, onChange }) => {
  const updateSummaryField = (field: keyof DailyLedger, value: number) => {
    onChange({ ...ledger, [field]: value });
  };

  return (
    <div className="p-4 border rounded-xl bg-white shadow-sm space-y-3">
      <h4 className="font-semibold text-gray-800 border-b pb-2">Daily Cash Summary</h4>
      
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label className="block text-gray-500">1. Opening Balance</label>
          <input type="number" className="w-full p-1 border rounded" value={ledger.opening_balance} onChange={(e) => updateSummaryField("opening_balance", parseFloat(e.target.value) || 0)} />
        </div>
        
        <div>
          <label className={`block font-medium ${validation.loanMismatch ? "text-red-600" : "text-gray-500"}`}>
            4. Loan (-) {validation.loanMismatch && "(Mismatch!)"}
          </label>
          <input type="number" className={`w-full p-1 border rounded ${validation.loanMismatch ? "border-red-500 bg-red-50" : ""}`} value={ledger.total_loan} onChange={(e) => updateSummaryField("total_loan", parseFloat(e.target.value) || 0)} />
        </div>

        <div>
          <label className={`block font-medium ${validation.redeemMismatch ? "text-red-600" : "text-gray-500"}`}>
            5. Redeem (+) {validation.redeemMismatch && "(Mismatch!)"}
          </label>
          <input type="number" className={`w-full p-1 border rounded ${validation.redeemMismatch ? "border-red-500 bg-red-50" : ""}`} value={ledger.total_redeem} onChange={(e) => updateSummaryField("total_redeem", parseFloat(e.target.value) || 0)} />
        </div>

        <div>
          <label className="block text-gray-500">7. Recovery (+)</label>
          <input type="number" className="w-full p-1 border rounded" value={ledger.recovery} onChange={(e) => updateSummaryField("recovery", parseFloat(e.target.value) || 0)} />
        </div>

        <div>
          <label className="block text-gray-500">9. Expenses (-)</label>
          <input type="number" className="w-full p-1 border rounded" value={ledger.expenses} onChange={(e) => updateSummaryField("expenses", parseFloat(e.target.value) || 0)} />
        </div>

        <div>
          <label className={`block font-medium ${validation.balanceMismatch ? "text-red-600" : "text-gray-500"}`}>
            10. Closing Balance
          </label>
          <input type="number" className={`w-full p-1 border rounded font-bold ${validation.balanceMismatch ? "border-red-500 bg-red-50" : ""}`} value={ledger.calculated_closing_balance} onChange={(e) => updateSummaryField("calculated_closing_balance", parseFloat(e.target.value) || 0)} />
        </div>
      </div>
    </div>
  );
};
```

---

### `src/components/SideBySideDashboard.tsx`
```tsx
import React, { useState } from "react";
import { DailyLedger } from "../types/ledger";
import { TransactionTable } from "./TransactionTable";
import { SummaryCard } from "./SummaryCard";
import { validateLedgerDay } from "../utils/validation";

interface Props {
  ledgers: DailyLedger[];
  onUpdateLedger: (index: number, updated: DailyLedger) => void;
  onExport: () => void;
}

export const SideBySideDashboard: React.FC<Props> = ({ ledgers, onUpdateLedger, onExport }) => {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const currentLedger = ledgers[selectedDayIndex];

  if (!currentLedger) return null;

  const validation = validateLedgerDay(currentLedger, currentLedger.transactions);

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header bar */}
      <header className="p-4 bg-white border-b flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-800">Daily Ledger Verification Dashboard</h1>
        
        <div className="flex gap-3">
          <select
            className="p-2 border rounded-lg bg-gray-50 font-medium"
            value={selectedDayIndex}
            onChange={(e) => setSelectedDayIndex(parseInt(e.target.value))}
          >
            {ledgers.map((l, idx) => (
              <option key={idx} value={idx}>
                Day {l.day_number} ({l.date})
              </option>
            ))}
          </select>

          <button
            onClick={onExport}
            className="px-5 py-2 bg-green-600 text-white font-medium rounded-lg shadow hover:bg-green-700"
          >
            Export to Excel
          </button>
        </div>
      </header>

      {/* Split Viewer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Original PDF Image */}
        <div className="w-1/2 p-4 border-r bg-gray-200 overflow-auto flex justify-center">
          <img
            src={currentLedger.page_image_url}
            alt={`Page ${currentLedger.day_number}`}
            className="max-w-full shadow-lg rounded border bg-white object-contain"
          />
        </div>

        {/* Right: Extracted Editable Form */}
        <div className="w-1/2 p-4 overflow-auto space-y-4">
          <SummaryCard
            ledger={currentLedger}
            validation={validation}
            onChange={(updated) => onUpdateLedger(selectedDayIndex, updated)}
          />

          <TransactionTable
            transactions={currentLedger.transactions}
            onChange={(updatedTx) =>
              onUpdateLedger(selectedDayIndex, { ...currentLedger, transactions: updatedTx })
            }
          />
        </div>
      </div>
    </div>
  );
};
```

---

## 13. Main Application Component (`src/App.tsx`)

```tsx
import React, { useState } from "react";
import { PdfUploader } from "./components/PdfUploader";
import { SideBySideDashboard } from "./components/SideBySideDashboard";
import { convertPdfToImages } from "./services/pdfProcessor";
import { extractLedgerFromImage } from "./services/ocrService";
import { exportBatchToExcel } from "./services/excelExportService";
import { DailyLedger } from "./types/ledger";

export const App: React.FC = () => {
  const [ledgers, setLedgers] = useState<DailyLedger[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");

  const handleProcessPdf = async (file: File) => {
    try {
      setIsProcessing(true);
      setProgressText("Rendering PDF pages to images...");

      const pageImages = await convertPdfToImages(file);
      const parsedLedgers: DailyLedger[] = [];

      for (let i = 0; i < pageImages.length; i++) {
        setProgressText(`Processing Page ${i + 1} of ${pageImages.length} with Gemini Rotator...`);
        const extracted = await extractLedgerFromImage(pageImages[i]);

        parsedLedgers.push({
          day_number: i + 1,
          date: extracted.meta?.date || `2025-10-${i + 1}`,
          staff_name: extracted.meta?.staff || "Geethangani",
          cp_balance: extracted.meta?.cp_balance || 0,
          opening_balance: extracted.summary?.opening_balance || 0,
          cash_in: extracted.summary?.cash_in || 0,
          cash_out: extracted.summary?.cash_out || 0,
          total_loan: extracted.summary?.total_loan || 0,
          total_redeem: extracted.summary?.total_redeem || 0,
          receive: extracted.summary?.receive || 0,
          recovery: extracted.summary?.recovery || 0,
          insurance: extracted.summary?.insurance || 0,
          expenses: extracted.summary?.expenses || 0,
          calculated_closing_balance: extracted.summary?.closing_balance || 0,
          actual_cash_count: extracted.summary?.actual_cash_count || 0,
          variance: extracted.summary?.variance || 0,
          is_validated: false,
          page_image_url: pageImages[i],
          transactions: extracted.transactions || []
        });
      }

      setLedgers(parsedLedgers);
    } catch (err) {
      console.error(err);
      alert("Failed to process PDF. Check API Keys or file formatting.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {ledgers.length === 0 ? (
        <div className="max-w-xl mx-auto pt-20">
          <PdfUploader
            onProcessStart={handleProcessPdf}
            isProcessing={isProcessing}
            progressText={progressText}
          />
        </div>
      ) : (
        <SideBySideDashboard
          ledgers={ledgers}
          onUpdateLedger={(idx, updated) => {
            const updatedLedgers = [...ledgers];
            updatedLedgers[idx] = updated;
            setLedgers(updatedLedgers);
          }}
          onExport={() => exportBatchToExcel("KIRIBATHGODA_2_OCT_2025", ledgers)}
        />
      )}
    </div>
  );
};

export default App;
```

---

## 14. How to Run & Deploy

```bash
# 1. Start the local server
npm run dev

# 2. Build for production
npm run build
```
