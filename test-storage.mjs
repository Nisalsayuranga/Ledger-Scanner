import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  "https://sdakiautnmwoqppbjkkl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkYWtpYXV0bm13b3FwcGJqa2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NjU2MTEsImV4cCI6MjEwMTA0MTYxMX0.Dmy4a8L2z7EsCuy_Xden4iXy-egdjKfyDBPwH-y-Juk"
);

async function testStorage() {
  const fileName = "w4 January 2026 m(4).pdf";
  const cleanFilename = fileName.replace(/\s+/g, "_");
  const branchName = "Homagama L";
  
  const filePath = `${branchName}/2026/1/lr_book/${cleanFilename}`;
  console.log("filePath:", filePath);
  
  const { error: upErr } = await supabase.storage.from("ledger-documents").upload(filePath, "hello world", { upsert: true });
  console.log("Upload error:", upErr);

  const { data } = supabase.storage.from("ledger-documents").getPublicUrl(filePath);
  console.log("Public URL returned:", data.publicUrl);
  
  const res = await fetch(data.publicUrl);
  console.log("Fetch status:", res.status);
  
  await supabase.storage.from("ledger-documents").remove([filePath]);
}

testStorage();
