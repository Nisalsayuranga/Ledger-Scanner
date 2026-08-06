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
    status TEXT DEFAULT 'upload' CHECK (status IN ('upload', 'uploaded', 'processing', 'needs_review', 'verified', 'failed')),
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(daily_ledger_id, row_order)
);

-- Storage Bucket Setup
INSERT INTO storage.buckets (id, name, public) VALUES ('ledger-documents', 'ledger-documents', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Branch Authorization (User to Branch mapping)
CREATE TABLE IF NOT EXISTS user_branches (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, branch_id)
);

-- Enable RLS on user_branches
ALTER TABLE user_branches ENABLE ROW LEVEL SECURITY;

-- Only users can see their own branch mappings
CREATE POLICY "Users can view their own branch mappings" ON user_branches 
FOR SELECT USING (auth.uid() = user_id);

-- 6. ENABLE ROW LEVEL SECURITY (RLS) ON EVERY TABLE
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;

-- 7. RLS POLICIES (Database)

-- Branches: Users can only select branches they are assigned to
CREATE POLICY "Users can view assigned branches" ON branches 
FOR SELECT USING (
    id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())
);

-- Ledger Batches: Users can only access batches for their assigned branches
CREATE POLICY "Users can view batches of their branches" ON ledger_batches 
FOR SELECT USING (
    branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert batches to their branches" ON ledger_batches 
FOR INSERT WITH CHECK (
    branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update batches of their branches" ON ledger_batches 
FOR UPDATE USING (
    branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete batches of their branches" ON ledger_batches 
FOR DELETE USING (
    branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())
);

-- Daily Ledgers: Access based on batch's branch
CREATE POLICY "Users can view daily ledgers of their branches" ON daily_ledgers 
FOR SELECT USING (
    batch_id IN (
        SELECT id FROM ledger_batches WHERE branch_id IN (
            SELECT branch_id FROM user_branches WHERE user_id = auth.uid()
        )
    )
);
CREATE POLICY "Users can insert daily ledgers to their branches" ON daily_ledgers 
FOR INSERT WITH CHECK (
    batch_id IN (
        SELECT id FROM ledger_batches WHERE branch_id IN (
            SELECT branch_id FROM user_branches WHERE user_id = auth.uid()
        )
    )
);
CREATE POLICY "Users can update daily ledgers of their branches" ON daily_ledgers 
FOR UPDATE USING (
    batch_id IN (
        SELECT id FROM ledger_batches WHERE branch_id IN (
            SELECT branch_id FROM user_branches WHERE user_id = auth.uid()
        )
    )
);
CREATE POLICY "Users can delete daily ledgers of their branches" ON daily_ledgers 
FOR DELETE USING (
    batch_id IN (
        SELECT id FROM ledger_batches WHERE branch_id IN (
            SELECT branch_id FROM user_branches WHERE user_id = auth.uid()
        )
    )
);

-- Ledger Transactions: Access based on daily ledger's batch's branch
CREATE POLICY "Users can view transactions of their branches" ON ledger_transactions 
FOR SELECT USING (
    daily_ledger_id IN (
        SELECT id FROM daily_ledgers WHERE batch_id IN (
            SELECT id FROM ledger_batches WHERE branch_id IN (
                SELECT branch_id FROM user_branches WHERE user_id = auth.uid()
            )
        )
    )
);
CREATE POLICY "Users can insert transactions to their branches" ON ledger_transactions 
FOR INSERT WITH CHECK (
    daily_ledger_id IN (
        SELECT id FROM daily_ledgers WHERE batch_id IN (
            SELECT id FROM ledger_batches WHERE branch_id IN (
                SELECT branch_id FROM user_branches WHERE user_id = auth.uid()
            )
        )
    )
);
CREATE POLICY "Users can update transactions of their branches" ON ledger_transactions 
FOR UPDATE USING (
    daily_ledger_id IN (
        SELECT id FROM daily_ledgers WHERE batch_id IN (
            SELECT id FROM ledger_batches WHERE branch_id IN (
                SELECT branch_id FROM user_branches WHERE user_id = auth.uid()
            )
        )
    )
);
CREATE POLICY "Users can delete transactions of their branches" ON ledger_transactions 
FOR DELETE USING (
    daily_ledger_id IN (
        SELECT id FROM daily_ledgers WHERE batch_id IN (
            SELECT id FROM ledger_batches WHERE branch_id IN (
                SELECT branch_id FROM user_branches WHERE user_id = auth.uid()
            )
        )
    )
);

-- 8. STORAGE POLICIES (Restrict to authenticated users)
-- Instead of public access, require authentication.
-- For a strict setup, we ensure the user is authenticated. 
-- In a real-world scenario, we would also parse the branch_id from the folder path ((storage.foldername(name))[1]) and check it against user_branches.
CREATE POLICY "Authenticated users can select documents" ON storage.objects 
FOR SELECT USING (
    bucket_id = 'ledger-documents' AND auth.role() = 'authenticated'
);
CREATE POLICY "Authenticated users can insert documents" ON storage.objects 
FOR INSERT WITH CHECK (
    bucket_id = 'ledger-documents' AND auth.role() = 'authenticated'
);
CREATE POLICY "Authenticated users can update documents" ON storage.objects 
FOR UPDATE USING (
    bucket_id = 'ledger-documents' AND auth.role() = 'authenticated'
);
CREATE POLICY "Authenticated users can delete documents" ON storage.objects 
FOR DELETE USING (
    bucket_id = 'ledger-documents' AND auth.role() = 'authenticated'
);


