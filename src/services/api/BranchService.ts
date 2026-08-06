import { supabase } from "../supabaseClient";

export class BranchService {
  static async resolveBranchId(branchName: string): Promise<string> {
    // 1. Try to fetch existing
    const { data } = await supabase
      .from("branches")
      .select("id")
      .eq("branch_name", branchName)
      .maybeSingle();

    if (data?.id) return data.id;

    // 2. Create if missing (idempotent due to UNIQUE constraint)
    const { data: newBranch, error } = await supabase
      .from("branches")
      .insert({ branch_name: branchName })
      .select("id")
      .single();

    if (error && error.code === '23505') {
      // 23505 is unique violation, meaning it was inserted concurrently
      const { data: concurrent } = await supabase
        .from("branches")
        .select("id")
        .eq("branch_name", branchName)
        .single();
      return concurrent!.id;
    }

    if (!newBranch) {
      throw new Error("Could not resolve or create branch ID");
    }

    return newBranch.id;
  }
}
