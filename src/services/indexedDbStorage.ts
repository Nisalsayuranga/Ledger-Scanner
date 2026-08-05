import { BatchItem } from "../components/MainDashboard";

const DB_NAME = "OCR_Ledger_Database";
const DB_VERSION = 1;
const STORE_NAME = "ledger_batches_store";

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveBatchToIndexedDb = async (batch: BatchItem): Promise<void> => {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Remove rawFile before saving to IDB to avoid clone issues
    const { rawFile, ...serializable } = batch;
    store.put(serializable);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("Error saving batch to IndexedDB:", err);
  }
};

export const saveAllBatchesToIndexedDb = async (batches: BatchItem[]): Promise<void> => {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    for (const batch of batches) {
      const { rawFile, ...serializable } = batch;
      store.put(serializable);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("Error saving all batches to IndexedDB:", err);
  }
};

export const getAllBatchesFromIndexedDb = async (): Promise<BatchItem[]> => {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Error getting batches from IndexedDB:", err);
    return [];
  }
};

export const deleteBatchFromIndexedDb = async (id: string): Promise<void> => {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("Error deleting batch from IndexedDB:", err);
  }
};
