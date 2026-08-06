import React, { useState, useEffect } from "react";
import { Upload, FileText, X, CheckCircle2, Layers, Loader2, AlertTriangle, RefreshCcw } from "lucide-react";
import { bulkUploadQueue, QueueItem, UploadStatus } from "../services/BulkUploadQueue";

interface Props {
  onClose: () => void;
  onRefreshData: () => void;
}

export const BulkPdfUploader: React.FC<Props> = ({ onClose, onRefreshData }) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [view, setView] = useState<'SELECT' | 'QUEUE'>('SELECT');

  useEffect(() => {
    const unsubscribe = bulkUploadQueue.subscribe((updatedQueue) => {
      setQueue(updatedQueue);
      if (updatedQueue.length > 0 && view === 'SELECT') {
        setView('QUEUE');
      }
    });
    return () => unsubscribe();
  }, [view]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files).slice(0, 50); // Limit up to 50 PDFs
      setSelectedFiles(filesArray);
    }
  };

  const handleConfirmUpload = () => {
    if (selectedFiles.length > 0) {
      bulkUploadQueue.enqueueFiles(selectedFiles);
      bulkUploadQueue.startProcessing();
      setView('QUEUE');
    }
  };

  const handleClose = () => {
    if (queue.length > 0) {
      // If we are in the queue view, closing should clear the queue and trigger a refresh
      bulkUploadQueue.cancelProcessing();
      bulkUploadQueue.clearQueue();
      onRefreshData();
    }
    onClose();
  };

  const getStatusBadge = (status: UploadStatus) => {
    switch (status) {
      case 'QUEUED':
        return <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">Queued</span>;
      case 'UPLOADING':
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/> Uploading</span>;
      case 'UPLOADED':
        return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> Uploaded</span>;
      case 'FAILED':
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> Failed</span>;
      case 'DUPLICATE':
        return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-[10px] font-bold uppercase tracking-wider">Duplicate</span>;
      case 'RETRYING':
        return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><RefreshCcw className="h-3 w-3 animate-spin"/> Retrying</span>;
    }
  };

  const totalFiles = queue.length;
  const completedFiles = queue.filter(q => q.status === 'UPLOADED' || q.status === 'DUPLICATE').length;
  const progressPercent = totalFiles > 0 ? (completedFiles / totalFiles) * 100 : 0;
  const isFinished = totalFiles > 0 && queue.every(q => q.status === 'UPLOADED' || q.status === 'DUPLICATE' || q.status === 'FAILED');

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col overflow-hidden border border-slate-200 h-[80vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-lg">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Bulk PDF Upload (Up to 50 PDFs)
              </h3>
              <p className="text-xs text-slate-400">
                {view === 'SELECT' ? 'Upload files without instant OCR scan. Files will auto-sort.' : 'Upload Queue Manager'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-hidden flex flex-col">
          {view === 'SELECT' ? (
            <div className="space-y-4 flex-1 flex flex-col">
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100/50 transition-colors shrink-0">
                <Layers className="mx-auto h-12 w-12 text-slate-400 mb-3" />
                <h4 className="text-sm font-bold text-slate-800">Select Multiple PDF Ledger Books</h4>
                <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
                  You can select up to 50 PDF documents at once. Filenames will automatically match branches (e.g. Kiribathgoda, Borella).
                </p>

                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  id="bulkPdfInput"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <label
                  htmlFor="bulkPdfInput"
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow cursor-pointer inline-flex items-center gap-2 transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  Choose Files (Up to 50 PDFs)
                </label>
              </div>

              {/* Selected Files List */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2 flex-1 flex flex-col min-h-0">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-700 shrink-0">
                    <span>Selected {selectedFiles.length} PDF files</span>
                    <button
                      onClick={() => setSelectedFiles([])}
                      className="text-red-600 hover:underline font-normal text-[11px]"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white p-2">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="py-2 px-3 flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate">{file.name}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono shrink-0 ml-2">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full gap-4">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl shrink-0 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Upload Progress</h4>
                  <p className="text-xs text-slate-500">{completedFiles} of {totalFiles} files processed</p>
                </div>
                <div className="w-1/2">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${isFinished ? 'bg-emerald-500' : 'bg-blue-600'}`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
                {queue.map((item) => (
                  <div key={item.id} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h5 className="text-sm font-bold text-slate-800 truncate pr-4" title={item.file.name}>{item.file.name}</h5>
                        {getStatusBadge(item.status)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold">{item.metadata.branchName}</span>
                        <span>&bull;</span>
                        <span>{item.metadata.year}-{item.metadata.month}</span>
                        <span>&bull;</span>
                        <span>{item.metadata.bookCategory === 'lr_book' ? 'L/R' : 'M Book'}</span>
                      </div>
                      
                      {/* Error Message */}
                      {item.error && (
                        <div className="mt-2 text-[11px] text-red-600 bg-red-50 p-2 rounded border border-red-100">
                          {item.error}
                        </div>
                      )}
                      
                      {/* Progress bar for uploading state */}
                      {(item.status === 'UPLOADING' || item.status === 'RETRYING') && (
                        <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${item.progress}%` }} />
                        </div>
                      )}
                    </div>
                    
                    {/* Retry Button */}
                    {item.status === 'FAILED' && (
                      <button 
                        onClick={() => bulkUploadQueue.retryItem(item.id)}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors shrink-0"
                        title="Retry Upload"
                      >
                        <RefreshCcw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <span className="text-xs text-slate-500">
            {view === 'SELECT' ? 'Files will be queued for on-demand OCR scanning' : (isFinished ? 'All processing complete. You can close this window.' : 'Please do not close this window while processing.')}
          </span>
          <div className="flex gap-2">
            {view === 'SELECT' ? (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmUpload}
                  disabled={selectedFiles.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-lg shadow inline-flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Queue {selectedFiles.length} Files
                </button>
              </>
            ) : (
              <button
                onClick={handleClose}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-lg shadow transition-colors"
              >
                {isFinished ? 'Close Window' : 'Close & Stop Queue'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
