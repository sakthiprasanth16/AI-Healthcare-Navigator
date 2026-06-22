import React from 'react';
import { IndianRupee, TrendingDown, Sparkles, Download, Save } from 'lucide-react';
import { Medicine } from '../../types';

interface Props {
  medicines: Medicine[];
  originalCost: number;
  optimizedCost: number;
  totalSaving: number;
  summary: string;
  onSaveReport: () => void;
  onDownloadPlan: () => void;
  saving: boolean;
}

export default function SavingsSummaryCard({
  medicines, originalCost, optimizedCost, totalSaving,
  summary, onSaveReport, onDownloadPlan, saving,
}: Props) {
  // Always recompute live from current medicine selections
  const currentOptimized = medicines.reduce((s, m) => s + m.rowTotal, 0);
  const currentSaving    = medicines.reduce((s, m) => s + m.saving, 0);

  // Recalculate original cost live too (sum of currentPrice × qty)
  const currentOriginal = medicines.reduce((s, m) => {
    const status = (m as any).status;
    if (status === 'not_found') return s;
    return s + m.currentPrice * m.quantity;
  }, 0);

  const base       = currentOriginal > 0 ? currentOriginal : originalCost;
  const savingPct  = base > 0 ? Math.round((currentSaving / base) * 100) : 0;

  return (
    <div className="card overflow-hidden">
      {/* Header strip */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-500 px-6 py-4">
        <h3 className="font-display font-bold text-white text-lg">💊 Cost Summary</h3>
        <p className="text-purple-100 text-sm mt-0.5">Based on your current selections</p>
      </div>

      <div className="p-6 space-y-5">
        {/* Cost trio */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <IndianRupee className="w-4 h-4 text-slate-400 mx-auto mb-1" />
            <div className="font-display font-bold text-xl text-slate-700">
              ₹{base > 0 ? base.toFixed(0) : originalCost.toFixed(0)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Original Cost</div>
          </div>
          <div className="text-center p-4 bg-teal-50 border border-teal-100 rounded-xl">
            <TrendingDown className="w-4 h-4 text-teal-500 mx-auto mb-1" />
            <div className="font-display font-bold text-xl text-teal-700">
              ₹{currentOptimized.toFixed(0)}
            </div>
            <div className="text-xs text-teal-600 mt-0.5">Optimized Cost</div>
          </div>
          <div className="text-center p-4 bg-green-50 border border-green-100 rounded-xl">
            <div className="text-lg mb-1">🎉</div>
            <div className="font-display font-bold text-xl text-green-700">
              ₹{currentSaving.toFixed(0)}
            </div>
            <div className="text-xs text-green-600 mt-0.5">
              {currentSaving > 0 ? `You Save (${savingPct}%)` : 'No saving yet'}
            </div>
          </div>
        </div>

        {/* Cost summary */}
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-xs font-semibold text-purple-700 font-display uppercase tracking-wide">
              Summary
            </span>
          </div>
          <p className="text-slate-600 text-sm leading-relaxed">{summary}</p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onSaveReport}
            disabled={saving}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-purple-200 text-purple-700 font-display font-semibold text-sm hover:bg-purple-50 transition-all disabled:opacity-50"
          >
            {saving
              ? <div className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
              : <Save className="w-4 h-4" />}
            Save Report
          </button>
          <button
            onClick={onDownloadPlan}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-display font-semibold text-sm hover:from-purple-700 hover:to-purple-600 transition-all shadow-md"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
