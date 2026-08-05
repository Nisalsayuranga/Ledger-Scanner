import React, { useState } from "react";
import { Upload, FileText, X, CheckCircle2, Layers } from "lucide-react";

interface Props {
  onBulkUpload: (files: File[]) => void;
  onClose: () => void;
}

export const BulkPdfUploader: React.FC<Props> = ({ onBulkUpload, onClose }) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files).slice(0, 50); // Limit up to 50 PDFs
      setSelectedFiles(filesArray);
    }
  };

  const handleConfirmUpload = () => {
    if (selectedFiles.length > 0) {
      onBulkUpload(selectedFiles);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-lg">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Bulk PDF Upload (Up to 50 PDFs)
              </h3>
              <p className="text-xs text-slate-400">
                Upload files without instant OCR scan. Files will auto-sort into 13 branch repositories.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100/50 transition-colors">
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
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Selected {selectedFiles.length} PDF files</span>
                <button
                  onClick={() => setSelectedFiles([])}
                  className="text-red-600 hover:underline font-normal text-[11px]"
                >
                  Clear All
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white p-2">
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

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
          <span className="text-xs text-slate-500">Files will be queued for on-demand OCR scanning</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
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
              Upload &amp; Auto-Sort {selectedFiles.length} Files
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
