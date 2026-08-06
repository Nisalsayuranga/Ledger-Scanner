import pg from 'pg';

const connectionString = 'postgresql://postgres.sdakiautnmwoqppbjkkl:xcXJpkkiUy74ozaZ@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({ connectionString });

async function dropUniqueConstraint() {
  try {
    console.log("Dropping UNIQUE constraint: ledger_batches_branch_id_year_month_book_category_key ...");
    await pool.query('ALTER TABLE ledger_batches DROP CONSTRAINT IF EXISTS ledger_batches_branch_id_year_month_book_category_key;');
    console.log("Done!");

    // Verify
    const result = await pool.query(`
      SELECT conname, contype FROM pg_constraint
      WHERE conrelid = 'ledger_batches'::regclass AND contype = 'u';
    `);
    console.log("Remaining UNIQUE constraints:", result.rows.length === 0 ? "NONE (correct)" : result.rows);
  } catch (error) {
    console.error("Failed:", error);
  } finally {
    await pool.end();
  }
}

dropUniqueConstraint();
