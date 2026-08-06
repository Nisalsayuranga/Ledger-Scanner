import localforage from "localforage";
import { BranchName } from "../constants/branches";
import { BookCategory } from "../types/ledger";

export interface MigrationFileRecord {
  id: string; // Unique ID, usually filename if unique enough
  filename: string;
  fileSize: number;
  fileType: string;
  branch: BranchName;
  year: number;
  month: number;
  category: BookCategory;
  
  // Validation State
  isValid: boolean;
  isDuplicate: boolean;
  validationError?: string;

  // Import State
  upload_status: 'pending' | 'uploading' | 'success' | 'failed';
  document_id?: string;
  storage_path?: string;
  upload_error?: string;
  
  // The actual File object (not persisted to DB, kept in memory)
  fileObj?: File; 
}

const MIGRATION_MANIFEST_KEY = "ledger_migration_manifest";

export class MigrationState {
  static async loadManifest(): Promise<MigrationFileRecord[]> {
    try {
      const data = await localforage.getItem<MigrationFileRecord[]>(MIGRATION_MANIFEST_KEY);
      return data || [];
    } catch (e) {
      console.error("Failed to load migration manifest", e);
      return [];
    }
  }

  static async saveManifest(manifest: MigrationFileRecord[]): Promise<void> {
    try {
      // Strip out the non-serializable File object before saving
      const serializable = manifest.map(m => {
        const { fileObj, ...rest } = m;
        return rest as MigrationFileRecord;
      });
      await localforage.setItem(MIGRATION_MANIFEST_KEY, serializable);
    } catch (e) {
      console.error("Failed to save migration manifest", e);
    }
  }
  
  static async clearManifest(): Promise<void> {
    await localforage.removeItem(MIGRATION_MANIFEST_KEY);
  }
}
