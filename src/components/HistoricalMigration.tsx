import React, { useState, useEffect, useRef } from "react";
import { FolderUp, CheckCircle2, AlertTriangle, Loader2, Play, Pause, XCircle, FileText } from "lucide-react";
import { MigrationState, MigrationFileRecord } from "../services/MigrationState";
import { detectBranchAndCategoryFromFilename } from "../utils/filenameDetector";
import { BranchService } from "../services/api/BranchService";
import { BatchService } from "../services/api/BatchService";
import { DocumentService } from "../services/api/DocumentService";
import { MONTHS } from "../constants/branches";

export const HistoricalMigration: React.FC = () => {
  const [manifest, setManifest] = useState<MigrationFileRecord[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stopFlag = useRef(false);

  useEffect(() => {
    // Load manifest on mount
    MigrationState.loadManifest().then(data => {
      if (data && data.length > 0) {
        setManifest(data);
      }
    });
  }, []);

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newManifest: MigrationFileRecord[] = [...manifest];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type !== "application/pdf") continue;

      // Check if already in manifest
      if (newManifest.some(m => m.filename === file.name)) {
        // Just attach the file object if it's already there
        const existing = newManifest.find(m => m.filename === file.name);
        if (existing) existing.fileObj = file;
        continue;
      }

      // Parse metadata
      const { branchName, year, month, bookCategory } = detectBranchAndCategoryFromFilename(file.name);
      
      let isValid = true;
      let validationError = "";
      if (file.size === 0) {
        isValid = false;
        validationError = "File is empty (0 bytes).";
      }

      newManifest.push({
        id: file.name,
        filename: file.name,
        fileSize: file.size,
        fileType: file.type,
        branch: branchName,
        year,
        month,
        category: bookCategory,
        isValid,
        isDuplicate: false,
        validationError,
        upload_status: 'pending',
        fileObj: file
      });
    }

    setManifest(newManifest);
    await MigrationState.saveManifest(newManifest);
  };

  const runDryRun = async () => {
    const updated = [...manifest];
    for (let i = 0; i < updated.length; i++) {
      const record = updated[i];
      if (!record.isValid) continue;

      try {
        const branchId = await BranchService.resolveBranchId(record.branch);
        const exists = await BatchService.checkIfBatchExists(branchId, record.year, record.month, record.category);
        if (exists) {
          record.isDuplicate = true;
          record.validationError = "Duplicate batch already exists in database.";
        }
      } catch (e) {
        console.error("Dry run check failed for", record.filename, e);
      }
    }
    setManifest(updated);
    await MigrationState.saveManifest(updated);
  };

  const startMigration = async () => {
    setIsMigrating(true);
    setIsPaused(false);
    stopFlag.current = false;

    for (let i = 0; i < manifest.length; i++) {
      if (stopFlag.current) break;

      const record = manifest[i];
      
      // Skip if invalid, duplicate, or already success
      if (!record.isValid || record.isDuplicate || record.upload_status === 'success') {
        continue;
      }

      if (!record.fileObj) {
        record.upload_status = 'failed';
        record.upload_error = "File object lost. Please reselect the folder.";
        updateManifestRecord(record);
        continue;
      }

      record.upload_status = 'uploading';
      updateManifestRecord(record);

      try {
        const branchId = await BranchService.resolveBranchId(record.branch);
        const batchId = await BatchService.createOrGetBatch({
          branchId,
          year: record.year,
          month: record.month,
          bookCategory: record.category,
          originalFilename: record.filename,
          fileSizeBytes: record.fileSize
        });

        const cloudUrl = await DocumentService.uploadDocument(
          record.fileObj,
          batchId,
          branchId,
          record.year,
          record.month
        );

        record.upload_status = 'success';
        record.document_id = batchId;
        record.storage_path = cloudUrl;
      } catch (err: any) {
        record.upload_status = 'failed';
        record.upload_error = err.message || String(err);
      }

      updateManifestRecord(record);
    }

    setIsMigrating(false);
  };

  const updateManifestRecord = (record: MigrationFileRecord) => {
    setManifest(prev => {
      const next = prev.map(m => m.id === record.id ? record : m);
      MigrationState.saveManifest(next).catch(console.error);
      return next;
    });
  };

  const pauseMigration = () => {
    stopFlag.current = true;
    setIsPaused(true);
    setIsMigrating(false);
  };

  const clearManifest = async () => {
    if (window.confirm("Are you sure you want to clear the current migration state?")) {
      await MigrationState.clearManifest();
      setManifest([]);
    }
  };

  const stats = {
    total: manifest.length,
    pending: manifest.filter(m => m.upload_status === 'pending').length,
    uploading: manifest.filter(m => m.upload_status === 'uploading').length,
    success: manifest.filter(m => m.upload_status === 'success').length,
    failed: manifest.filter(m => m.upload_status === 'failed').length,
    duplicates: manifest.filter(m => m.isDuplicate).length,
    invalid: manifest.filter(m => !m.isValid).length,
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header Panel */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FolderUp className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Historical Document Migration</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Bulk import historical PDFs (Jan 2025 – June 2026). This tool creates a local manifest to safely upload files. Select a folder to begin. The process is resumable if interrupted.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFolderSelect}
            className="hidden"
            multiple
            // @ts-ignore
            webkitdirectory=""
            directory=""
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isMigrating}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <FolderUp className="h-4 w-4" /> Select Master Folder
          </button>
        </div>
      </div>

      {manifest.length > 0 && (
        <>
          {/* Action Panel */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex gap-4 items-center">
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Progress</span>
                <span className="text-lg font-black text-slate-800">{stats.success} / {stats.total} <span className="text-sm font-medium text-slate-500">files</span></span>
              </div>
              <div className="h-10 w-px bg-slate-200 mx-2"></div>
              <div className="flex gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5 text-slate-600"><CheckCircle2 className="h-4 w-4 text-emerald-500"/> {stats.success} Uploaded</div>
                <div className="flex items-center gap-1.5 text-slate-600"><AlertTriangle className="h-4 w-4 text-red-500"/> {stats.failed} Failed</div>
                <div className="flex items-center gap-1.5 text-slate-600"><FileText className="h-4 w-4 text-amber-500"/> {stats.duplicates} Duplicates</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={runDryRun}
                disabled={isMigrating}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-sm font-bold rounded-lg transition-colors"
              >
                Run Validation (Dry Run)
              </button>
              
              {!isMigrating ? (
                <button
                  onClick={startMigration}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow transition-colors flex items-center gap-2"
                >
                  <Play className="h-4 w-4" /> {isPaused || stats.success > 0 ? "Resume Import" : "Start Import"}
                </button>
              ) : (
                <button
                  onClick={pauseMigration}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg shadow transition-colors flex items-center gap-2"
                >
                  <Pause className="h-4 w-4" /> Pause
                </button>
              )}
              
              <button
                onClick={clearManifest}
                disabled={isMigrating}
                className="px-3 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg transition-colors"
                title="Clear Manifest"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${(stats.success / stats.total) * 100}%` }}
            />
          </div>

          {/* Manifest Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                  <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="p-3 pl-6 font-semibold">Filename</th>
                    <th className="p-3 font-semibold">Parsed Branch</th>
                    <th className="p-3 font-semibold">Period</th>
                    <th className="p-3 font-semibold">Category</th>
                    <th className="p-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {manifest.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/50 text-sm">
                      <td className="p-3 pl-6">
                        <p className="font-semibold text-slate-800 truncate max-w-[200px]" title={record.filename}>
                          {record.filename}
                        </p>
                        {!record.fileObj && record.upload_status !== 'success' && (
                          <p className="text-[10px] text-red-500 font-bold">File missing in memory. Reselect folder.</p>
                        )}
                      </td>
                      <td className="p-3 font-medium text-slate-700">{record.branch}</td>
                      <td className="p-3 font-medium text-slate-700">
                        {MONTHS.find(m => m.value === record.month)?.label} {record.year}
                      </td>
                      <td className="p-3 font-medium text-slate-700">
                        {record.category === 'lr_book' ? 'L/R' : 'M Book'}
                      </td>
                      <td className="p-3">
                        {record.upload_status === 'success' && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded"><CheckCircle2 className="h-3 w-3"/> Uploaded</span>}
                        {record.upload_status === 'uploading' && <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded"><Loader2 className="h-3 w-3 animate-spin"/> Uploading</span>}
                        {record.upload_status === 'failed' && <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded" title={record.upload_error}><AlertTriangle className="h-3 w-3"/> Failed</span>}
                        {record.upload_status === 'pending' && record.isDuplicate && <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded"><FileText className="h-3 w-3"/> Duplicate</span>}
                        {record.upload_status === 'pending' && !record.isValid && <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded"><XCircle className="h-3 w-3"/> Invalid</span>}
                        {record.upload_status === 'pending' && !record.isDuplicate && record.isValid && <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">Pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
