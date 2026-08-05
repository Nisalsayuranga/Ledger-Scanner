-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Branches Table
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Pre-populate 13 Company Branches
INSERT INTO branches (branch_name) VALUES
    ('Borella'),
    ('Dehiwala'),
    ('Dematagoda'),
    ('Homagama'),
    ('Head Office'),
    ('Kadawatha'),
    ('Kiribathgoda'),
    ('Kotikawatta'),
    ('Kottawa'),
    ('Panadura'),
    ('Wattala 2'),
    ('Wattala 3'),
    ('Wattala 4')
ON CONFLICT (branch_name) DO NOTHING;

-- 2. Ledger Batches (Monthly Batches with Book Classification)
CREATE TABLE IF NOT EXISTS ledger_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    batch_month DATE NOT NULL,
    year INT DEFAULT 2025,
    month INT DEFAULT 10,
    book_category TEXT DEFAULT 'lr_book' CHECK (book_category IN ('lr_book', 'm_book', 'over_10k', 'under_10k')),
    original_pdf_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(branch_id, year, month, book_category)
);

-- 3. Daily Ledger Sheets
CREATE TABLE IF NOT EXISTS daily_ledgers (
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
CREATE TABLE IF NOT EXISTS ledger_transactions (
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

-- Storage Bucket Setup
INSERT INTO storage.buckets (id, name, public) VALUES ('ledger-documents', 'ledger-documents', true)
ON CONFLICT (id) DO NOTHING;

-- 5. ENABLE ROW LEVEL SECURITY (RLS) ON EVERY TABLE
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES

-- SELECT Policies: Allow public read access for viewing dashboard data
CREATE POLICY "Allow public read on branches" ON branches FOR SELECT USING (true);
CREATE POLICY "Allow public read on ledger_batches" ON ledger_batches FOR SELECT USING (true);
CREATE POLICY "Allow public read on daily_ledgers" ON daily_ledgers FOR SELECT USING (true);
CREATE POLICY "Allow public read on ledger_transactions" ON ledger_transactions FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE Policies: Scoped to authenticated users only (prevents unauthorized client mutation)
CREATE POLICY "Allow auth insert on branches" ON branches FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow auth update on branches" ON branches FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow auth delete on branches" ON branches FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow auth insert on ledger_batches" ON ledger_batches FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow auth update on ledger_batches" ON ledger_batches FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow auth delete on ledger_batches" ON ledger_batches FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow auth insert on daily_ledgers" ON daily_ledgers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow auth update on daily_ledgers" ON daily_ledgers FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow auth delete on daily_ledgers" ON daily_ledgers FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow auth insert on ledger_transactions" ON ledger_transactions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow auth update on ledger_transactions" ON ledger_transactions FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow auth delete on ledger_transactions" ON ledger_transactions FOR DELETE USING (auth.role() = 'authenticated');

-- 6. STORAGE POLICIES (Allows client-side uploads/downloads using anon API key)
CREATE POLICY "Allow public select on ledger-documents" ON storage.objects FOR SELECT USING (bucket_id = 'ledger-documents');
CREATE POLICY "Allow public insert on ledger-documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'ledger-documents');
CREATE POLICY "Allow public delete on ledger-documents" ON storage.objects FOR DELETE USING (bucket_id = 'ledger-documents');

