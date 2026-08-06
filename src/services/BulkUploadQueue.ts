import { BatchService } from "./api/BatchService";
import { BranchService } from "./api/BranchService";
import { DocumentService } from "./api/DocumentService";
import { detectBranchAndCategoryFromFilename } from "../utils/filenameDetector";
import { BookCategory } from "../types/ledger";
import { BranchName } from "../constants/branches";

export type UploadStatus = 'QUEUED' | 'UPLOADING' | 'UPLOADED' | 'FAILED' | 'DUPLICATE' | 'RETRYING';

export interface QueueItem {
  id: string; // Unique ID for queue
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  metadata: {
    branchName: BranchName;
    year: number;
    month: number;
    bookCategory: BookCategory;
  };
}

type Subscriber = (queue: QueueItem[]) => void;

export class BulkUploadQueue {
  private queue: QueueItem[] = [];
  private isProcessing: boolean = false;
  private subscribers: Set<Subscriber> = new Set();
  private cancelSignal: boolean = false;

  constructor() {}

  public subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    callback(this.queue);
    return () => this.subscribers.delete(callback);
  }

  private notify() {
    this.subscribers.forEach(cb => cb([...this.queue]));
  }

  public enqueueFiles(files: File[]) {
    const newItems = files.map(file => {
      const detected = detectBranchAndCategoryFromFilename(file.name);
      return {
        id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: 'QUEUED' as UploadStatus,
        progress: 0,
        metadata: detected
      };
    });

    this.queue.push(...newItems);
    this.notify();
  }

  public getQueue(): QueueItem[] {
    return [...this.queue];
  }

  public async startProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.cancelSignal = false;

    while (this.queue.some(i => i.status === 'QUEUED' || i.status === 'RETRYING')) {
      if (this.cancelSignal) break;

      const itemIdx = this.queue.findIndex(i => i.status === 'QUEUED' || i.status === 'RETRYING');
      if (itemIdx === -1) break;

      const item = this.queue[itemIdx];
      await this.processItem(itemIdx, item);
    }

    this.isProcessing = false;
    this.notify();
  }

  private async processItem(index: number, item: QueueItem) {
    try {
      this.updateItem(index, { status: 'UPLOADING', progress: 10, error: undefined });

      const branchId = await BranchService.resolveBranchId(item.metadata.branchName);
      
      this.updateItem(index, { progress: 30 });
      
      // Duplicate detection
      const exists = await BatchService.checkIfBatchExists(branchId, item.metadata.year, item.metadata.month, item.metadata.bookCategory);
      if (exists) {
        this.updateItem(index, { status: 'DUPLICATE', progress: 100, error: 'A ledger book already exists for this exact branch and month.' });
        return;
      }

      this.updateItem(index, { progress: 50 });

      // Create batch
      const batchId = await BatchService.createOrGetBatch({
        branchId,
        year: item.metadata.year,
        month: item.metadata.month,
        bookCategory: item.metadata.bookCategory,
        originalFilename: item.file.name,
        fileSizeBytes: item.file.size
      });

      this.updateItem(index, { progress: 70 });

      // Upload file to Supabase
      await DocumentService.uploadDocument(item.file, batchId, branchId, item.metadata.year, item.metadata.month);
      
      this.updateItem(index, { status: 'UPLOADED', progress: 100 });
    } catch (e: any) {
      console.error(`Failed to process ${item.file.name}:`, e);
      this.updateItem(index, { status: 'FAILED', error: e.message || String(e) });
    }
  }

  private updateItem(index: number, updates: Partial<QueueItem>) {
    this.queue[index] = { ...this.queue[index], ...updates };
    this.notify();
  }

  public retryItem(id: string) {
    const index = this.queue.findIndex(i => i.id === id);
    if (index !== -1) {
      this.updateItem(index, { status: 'RETRYING', progress: 0, error: undefined });
      if (!this.isProcessing) {
        this.startProcessing();
      }
    }
  }

  public cancelProcessing() {
    this.cancelSignal = true;
  }
  
  public clearQueue() {
    this.queue = [];
    this.notify();
  }
}

// Global instance
export const bulkUploadQueue = new BulkUploadQueue();
