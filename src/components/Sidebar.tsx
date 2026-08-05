import React from "react";
import { LayoutDashboard, Grid, FolderArchive, Upload, Database, Layers, Building2, RefreshCw } from "lucide-react";

export type ActiveTab = "overview" | "matrix" | "archive" | "upload" | "supabase";

interface Props {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  totalBatchesCount: number;
  isProcessing?: boolean;
  progressText?: string;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  onTabChange,
  totalBatchesCount,
  isProcessing = false,
  progressText = ""
}) => {
  const menuItems = [
    {
      id: "overview" as ActiveTab,
      label: "System Overview",
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: "matrix" as ActiveTab,
      label: "Completion Matrix",
      icon: Grid,
      badge: "2025"
    },
    {
      id: "archive" as ActiveTab,
      label: "Ledger Archives",
      icon: FolderArchive,
      badge: totalBatchesCount > 0 ? `${totalBatchesCount}` : null
    },
    {
      id: "upload" as ActiveTab,
      label: "Upload & Scan PDF",
      icon: Upload,
      badge: null
    },
    {
      id: "supabase" as ActiveTab,
      label: "Supabase DB Status",
      icon: Database,
      badge: "Live"
    }
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen border-r border-slate-800 shrink-0 select-none">
      {/* Brand / Title Header */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow">
          <Layers className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-base font-black text-white tracking-tight leading-tight">
            Ledger Automation
          </h1>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5 flex items-center gap-1">
            <Building2 className="h-3 w-3 text-slate-400" />
            13 Branch Center
          </p>
        </div>
      </div>

      {/* Navigation Menu Links */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
          Navigation Pages
        </div>

        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                    isActive
                      ? "bg-slate-900 text-emerald-300"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Live Batch Upload & Processing Progress Line Bar Card */}
      {isProcessing && (
        <div className="mx-4 mb-3 p-3 bg-[#0f172a] rounded-xl border border-blue-500/30 space-y-2.5 shadow-lg animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-bold text-slate-100">
            <span className="flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
              Batch Processing...
            </span>
            <span className="text-[10px] bg-blue-950 text-blue-300 font-mono px-2 py-0.5 rounded border border-blue-800">
              Processing
            </span>
          </div>

          {/* Solid Blue Animated Progress Line Bar */}
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800 relative">
            <div className="bg-blue-600 h-full rounded-full animate-pulse w-full transition-all duration-300" />
          </div>

          <p className="text-[11px] text-slate-300 font-medium truncate" title={progressText}>
            {progressText || "Processing uploaded PDF documents..."}
          </p>
        </div>
      )}

      {/* Sidebar Footer Info */}
      <div className="p-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-2 bg-slate-950/40">
        <div className="flex justify-between items-center font-semibold">
          <span>Engine Status</span>
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Ready
          </span>
        </div>
        <div className="text-[10px] text-slate-400">
          Vite • React • Supabase DB
        </div>
      </div>
    </aside>
  );
};
