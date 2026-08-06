import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { BatchItem } from '../components/MainDashboard';
import { DailyLedger } from '../types/ledger';

interface LedgerScannerDB extends DBSchema {
  batches: {
    key: string; // batch id
    value: BatchItem;
  };
  draft_ledgers: {
    key: string; // composite key: `${batchId}_${dayNumber}`
    value: {
      id: string;
      batchId: string;
      dayNumber: number;
      ledger: DailyLedger;
      pendingSync: boolean;
      lastModified: number;
    };
    indexes: {
      'by-batch': string; // index on batchId
    };
  };
}

const DB_NAME = 'ledger-scanner-db';
const DB_VERSION = 1;

export class CacheService {
  private static dbPromise: Promise<IDBPDatabase<LedgerScannerDB>> | null = null;

  private static getDB() {
    if (!this.dbPromise) {
      this.dbPromise = openDB<LedgerScannerDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('batches')) {
            db.createObjectStore('batches', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('draft_ledgers')) {
            const store = db.createObjectStore('draft_ledgers', { keyPath: 'id' });
            store.createIndex('by-batch', 'batchId');
          }
        },
      });
    }
    return this.dbPromise;
  }

  // --- Batches Cache ---

  static async cacheBatches(batches: BatchItem[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('batches', 'readwrite');
    // We overwrite entirely to ensure we don't keep stale deleted records
    await tx.store.clear();
    for (const b of batches) {
      await tx.store.put(b);
    }
    await tx.done;
  }

  static async getCachedBatches(): Promise<BatchItem[]> {
    const db = await this.getDB();
    return db.getAll('batches');
  }

  // --- Draft Ledgers Cache ---

  static async saveDraftLedger(batchId: string, ledger: DailyLedger, pendingSync: boolean = true): Promise<void> {
    const db = await this.getDB();
    const id = `${batchId}_${ledger.day_number}`;
    await db.put('draft_ledgers', {
      id,
      batchId,
      dayNumber: ledger.day_number,
      ledger,
      pendingSync,
      lastModified: Date.now(),
    });
  }

  static async getDraftLedgers(batchId: string): Promise<DailyLedger[]> {
    const db = await this.getDB();
    const records = await db.getAllFromIndex('draft_ledgers', 'by-batch', batchId);
    return records.map(r => r.ledger);
  }
  
  static async getUnsyncedDrafts(batchId: string): Promise<DailyLedger[]> {
    const db = await this.getDB();
    const records = await db.getAllFromIndex('draft_ledgers', 'by-batch', batchId);
    return records.filter(r => r.pendingSync).map(r => r.ledger);
  }

  static async markDraftsAsSynced(batchId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('draft_ledgers', 'readwrite');
    const records = await tx.store.index('by-batch').getAll(batchId);
    for (const r of records) {
      r.pendingSync = false;
      await tx.store.put(r);
    }
    await tx.done;
  }

  static async clearDraftsForBatch(batchId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('draft_ledgers', 'readwrite');
    const index = tx.store.index('by-batch');
    const keys = await index.getAllKeys(batchId);
    for (const key of keys) {
      await tx.store.delete(key);
    }
    await tx.done;
  }
}
