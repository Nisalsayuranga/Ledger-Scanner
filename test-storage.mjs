import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sdakiautnmwoqppbjkkl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkYWtpYXV0bm13b3FwcGJqa2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NjU2MTEsImV4cCI6MjEwMTA0MTYxMX0.Dmy4a8L2z7EsCuy_Xden4iXy-egdjKfyDBPwH-y-Juk';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BUCKET = 'ledger-documents';

// Helper: create a dummy PDF-like blob for testing
function createDummyPdf(sizeKb = 1) {
  const content = 'A'.repeat(sizeKb * 1024);
  return new Blob([content], { type: 'application/pdf' });
}

async function resolveBranchId(branchName) {
  const { data } = await supabase.from('branches').select('id').eq('branch_name', branchName).maybeSingle();
  return data?.id;
}

async function test_1_same_filename_different_batches() {
  console.log('\n--- Test 1: Same filename, two separate uploads ---');
  const branchId = await resolveBranchId('Borella');
  const filename = 'duplicate_test.pdf';

  // Upload 1
  const { data: b1 } = await supabase.from('ledger_batches').insert({
    branch_id: branchId, batch_month: '2025-01-01', year: 2025, month: 1,
    book_category: 'lr_book', status: 'uploaded', original_filename: filename,
    storage_bucket: BUCKET, uploaded_at: new Date().toISOString()
  }).select('id').single();

  const path1 = `${branchId}/2025/01/${b1.id}/original/${b1.id}.pdf`;
  const { error: e1 } = await supabase.storage.from(BUCKET).upload(path1, createDummyPdf(), { upsert: false });
  console.log(`  Upload 1 (batch ${b1.id}):`, e1 ? `FAIL - ${e1.message}` : 'OK');

  // Upload 2 — same filename, different batch UUID
  const { data: b2 } = await supabase.from('ledger_batches').insert({
    branch_id: branchId, batch_month: '2025-01-01', year: 2025, month: 1,
    book_category: 'lr_book', status: 'uploaded', original_filename: filename,
    storage_bucket: BUCKET, uploaded_at: new Date().toISOString()
  }).select('id').single();

  const path2 = `${branchId}/2025/01/${b2.id}/original/${b2.id}.pdf`;
  const { error: e2 } = await supabase.storage.from(BUCKET).upload(path2, createDummyPdf(), { upsert: false });
  console.log(`  Upload 2 (batch ${b2.id}):`, e2 ? `FAIL - ${e2.message}` : 'OK');

  // Verify both exist
  const { data: list1 } = await supabase.storage.from(BUCKET).list(`${branchId}/2025/01/${b1.id}/original`);
  const { data: list2 } = await supabase.storage.from(BUCKET).list(`${branchId}/2025/01/${b2.id}/original`);
  console.log(`  File 1 exists:`, list1?.length > 0 ? 'YES' : 'NO');
  console.log(`  File 2 exists:`, list2?.length > 0 ? 'YES' : 'NO');
  console.log(`  Separate records in DB:`, b1.id !== b2.id ? 'YES (different UUIDs)' : 'FAIL');

  // Cleanup
  await supabase.storage.from(BUCKET).remove([path1, path2]);
  await supabase.from('ledger_batches').delete().eq('id', b1.id);
  await supabase.from('ledger_batches').delete().eq('id', b2.id);
  console.log('  Cleaned up test data.');
}

async function test_2_different_branches() {
  console.log('\n--- Test 2: Different branches, same month ---');
  const borella = await resolveBranchId('Borella');
  const dehiwala = await resolveBranchId('Dehiwala');

  const { data: b1 } = await supabase.from('ledger_batches').insert({
    branch_id: borella, batch_month: '2025-03-01', year: 2025, month: 3,
    book_category: 'lr_book', status: 'uploaded', original_filename: 'march_ledger.pdf',
    storage_bucket: BUCKET, uploaded_at: new Date().toISOString()
  }).select('id').single();

  const { data: b2 } = await supabase.from('ledger_batches').insert({
    branch_id: dehiwala, batch_month: '2025-03-01', year: 2025, month: 3,
    book_category: 'lr_book', status: 'uploaded', original_filename: 'march_ledger.pdf',
    storage_bucket: BUCKET, uploaded_at: new Date().toISOString()
  }).select('id').single();

  const path1 = `${borella}/2025/03/${b1.id}/original/${b1.id}.pdf`;
  const path2 = `${dehiwala}/2025/03/${b2.id}/original/${b2.id}.pdf`;

  const { error: e1 } = await supabase.storage.from(BUCKET).upload(path1, createDummyPdf(), { upsert: false });
  const { error: e2 } = await supabase.storage.from(BUCKET).upload(path2, createDummyPdf(), { upsert: false });

  console.log(`  Borella upload:`, e1 ? `FAIL - ${e1.message}` : 'OK');
  console.log(`  Dehiwala upload:`, e2 ? `FAIL - ${e2.message}` : 'OK');
  console.log(`  Isolated paths:`, path1 !== path2 ? 'YES' : 'FAIL');

  await supabase.storage.from(BUCKET).remove([path1, path2]);
  await supabase.from('ledger_batches').delete().eq('id', b1.id);
  await supabase.from('ledger_batches').delete().eq('id', b2.id);
  console.log('  Cleaned up test data.');
}

async function test_3_upsert_false_prevents_overwrite() {
  console.log('\n--- Test 3: upsert=false prevents overwrite ---');
  const branchId = await resolveBranchId('Borella');

  const { data: b1 } = await supabase.from('ledger_batches').insert({
    branch_id: branchId, batch_month: '2025-06-01', year: 2025, month: 6,
    book_category: 'm_book', status: 'uploaded', original_filename: 'test.pdf',
    storage_bucket: BUCKET, uploaded_at: new Date().toISOString()
  }).select('id').single();

  const path = `${branchId}/2025/06/${b1.id}/original/${b1.id}.pdf`;

  // First upload
  const { error: e1 } = await supabase.storage.from(BUCKET).upload(path, createDummyPdf(1), { upsert: false });
  console.log(`  First upload:`, e1 ? `FAIL - ${e1.message}` : 'OK');

  // Attempt overwrite with upsert: false
  const { error: e2 } = await supabase.storage.from(BUCKET).upload(path, createDummyPdf(2), { upsert: false });
  console.log(`  Second upload (same path, upsert=false):`, e2 ? `BLOCKED (expected) - ${e2.message}` : 'FAIL - should have been blocked!');

  await supabase.storage.from(BUCKET).remove([path]);
  await supabase.from('ledger_batches').delete().eq('id', b1.id);
  console.log('  Cleaned up test data.');
}

async function test_4_db_record_with_metadata() {
  console.log('\n--- Test 4: DB record stores full document metadata ---');
  const branchId = await resolveBranchId('Kottawa');

  const { data: b1 } = await supabase.from('ledger_batches').insert({
    branch_id: branchId, batch_month: '2026-02-01', year: 2026, month: 2,
    book_category: 'lr_book', status: 'uploaded',
    original_filename: 'February_Ledger_2026.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 5242880,
    storage_bucket: BUCKET,
    uploaded_at: new Date().toISOString()
  }).select('*').single();

  console.log(`  original_filename:`, b1.original_filename);
  console.log(`  mime_type:`, b1.mime_type);
  console.log(`  file_size_bytes:`, b1.file_size_bytes);
  console.log(`  storage_bucket:`, b1.storage_bucket);
  console.log(`  uploaded_at:`, b1.uploaded_at);
  console.log(`  All metadata present:`, 
    b1.original_filename && b1.mime_type && b1.file_size_bytes && b1.storage_bucket && b1.uploaded_at 
    ? 'YES' : 'FAIL');

  await supabase.from('ledger_batches').delete().eq('id', b1.id);
  console.log('  Cleaned up test data.');
}

async function runAllTests() {
  console.log('=== Phase 2 Storage Tests ===');
  await test_1_same_filename_different_batches();
  await test_2_different_branches();
  await test_3_upsert_false_prevents_overwrite();
  await test_4_db_record_with_metadata();
  console.log('\n=== All tests complete ===');
}

runAllTests();
