import React, { useState } from "react";
import { Activity, ShieldAlert, CheckCircle2, AlertTriangle, AlertCircle, Loader2, Database, RefreshCw, Layers, HardDrive } from "lucide-react";
import { DiagnosticService, DiagnosticReport } from "../services/api/DiagnosticService";

export const DiagnosticDashboard: React.FC = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [report, setReport] = useState<DiagnosticReport | null>(null);

  const runAudit = async () => {
    setIsScanning(true);
    try {
      const res = await DiagnosticService.runCompleteAudit();
      setReport(res);
    } catch (e) {
      console.error(e);
      alert("Diagnostic audit failed to complete.");
    } finally {
      setIsScanning(false);
    }
  };

  const highIssues = report?.issues.filter(i => i.severity === 'high') || [];
  const mediumIssues = report?.issues.filter(i => i.severity === 'medium') || [];
  const lowIssues = report?.issues.filter(i => i.severity === 'low') || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-xl">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">System Diagnostic &amp; Data Integrity</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                Run a safe, read-only audit across all Supabase records and Storage files. This tool identifies corruptions, orphans, duplicates, and missing files without modifying or deleting any data.
              </p>
            </div>
          </div>
          <button
            onClick={runAudit}
            disabled={isScanning}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 shrink-0"
          >
            {isScanning ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Scanning Database...</>
            ) : (
              <><Activity className="h-4 w-4" /> Run Complete Audit</>
            )}
          </button>
        </div>
      </div>

      {report && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-100 rounded-lg text-slate-600">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Batches</p>
                <h3 className="text-xl font-bold text-slate-800 mt-0.5">{report.totalBatches}</h3>
              </div>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-100 rounded-lg text-slate-600">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Ledgers</p>
                <h3 className="text-xl font-bold text-slate-800 mt-0.5">{report.totalLedgers}</h3>
              </div>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-100 rounded-lg text-slate-600">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Transactions</p>
                <h3 className="text-xl font-bold text-slate-800 mt-0.5">{report.totalTransactions}</h3>
              </div>
            </div>
            
            <div className={`p-5 rounded-xl border shadow-sm flex items-center gap-4 ${report.issues.length === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className={`p-3 rounded-lg ${report.issues.length === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                {report.issues.length === 0 ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </div>
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wider ${report.issues.length === 0 ? 'text-emerald-700' : 'text-red-700'}`}>Anomalies Detected</p>
                <h3 className={`text-xl font-bold mt-0.5 ${report.issues.length === 0 ? 'text-emerald-800' : 'text-red-800'}`}>{report.issues.length}</h3>
              </div>
            </div>
          </div>

          {/* Results Area */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-slate-500" /> Audit Results
              </h3>
              <span className="text-xs font-semibold text-slate-500">
                Completed at {new Date(report.timestamp).toLocaleTimeString()}
              </span>
            </div>
            
            <div className="p-0">
              {report.issues.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-800">System is Healthy</h4>
                  <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                    No data corruption, missing files, or orphaned records were detected across the entire database.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {/* High Severity */}
                  {highIssues.map((issue, idx) => (
                    <div key={`high-${idx}`} className="p-4 pl-6 bg-red-50/30 flex gap-4 hover:bg-red-50/50 transition-colors">
                      <div className="mt-0.5 shrink-0">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold uppercase tracking-wider rounded">Critical</span>
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{issue.type.replace(/_/g, ' ')}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">{issue.message}</p>
                        {issue.details && (
                          <pre className="mt-2 text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200 overflow-x-auto">
                            {JSON.stringify(issue.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* Medium Severity */}
                  {mediumIssues.map((issue, idx) => (
                    <div key={`med-${idx}`} className="p-4 pl-6 bg-amber-50/30 flex gap-4 hover:bg-amber-50/50 transition-colors">
                      <div className="mt-0.5 shrink-0">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold uppercase tracking-wider rounded">Warning</span>
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{issue.type.replace(/_/g, ' ')}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">{issue.message}</p>
                        {issue.details && (
                          <pre className="mt-2 text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200 overflow-x-auto">
                            {JSON.stringify(issue.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* Low Severity */}
                  {lowIssues.map((issue, idx) => (
                    <div key={`low-${idx}`} className="p-4 pl-6 flex gap-4 hover:bg-slate-50 transition-colors">
                      <div className="mt-0.5 shrink-0">
                        <Activity className="h-5 w-5 text-slate-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold uppercase tracking-wider rounded">Notice</span>
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{issue.type.replace(/_/g, ' ')}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">{issue.message}</p>
                        {issue.details && (
                          <pre className="mt-2 text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200 overflow-x-auto">
                            {JSON.stringify(issue.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
