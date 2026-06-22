import React from 'react';
import { FlaskConical, Pill, Stethoscope, TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface Props {
  totalLab: number;
  totalMedicine: number;
  totalDoctor: number;
  grandTotal: number;
  prevMonthTotal: number | null;
  changeAmount: number | null;
  changePct: number | null;
  isCurrentMonth: boolean;
  monthLabel: string;
}

export default function SpendingSummaryCards({
  totalLab, totalMedicine, totalDoctor, grandTotal,
  prevMonthTotal, changeAmount, changePct,
  isCurrentMonth, monthLabel,
}: Props) {
  const hasComparison = prevMonthTotal !== null && prevMonthTotal > 0;
  const saved   = changeAmount !== null && changeAmount < 0;
  const higher  = changeAmount !== null && changeAmount > 0;

  const cards = [
    { icon: <Pill className="w-5 h-5 text-purple-500" />,   label: 'Medicines',  amount: totalMedicine, bg: 'bg-purple-50 border-purple-100', text: 'text-purple-700' },
    { icon: <FlaskConical className="w-5 h-5 text-violet-500" />, label: 'Lab Tests', amount: totalLab, bg: 'bg-violet-50 border-violet-100', text: 'text-violet-700' },
    { icon: <Stethoscope className="w-5 h-5 text-blue-500" />, label: 'Doctor',    amount: totalDoctor, bg: 'bg-blue-50 border-blue-100',  text: 'text-blue-700' },
  ];

  return (
    <div className="space-y-4">
      {/* Grand total row */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm">
        <div>
          <div className="text-xs text-slate-400 font-display uppercase tracking-wide">
            {isCurrentMonth ? `${monthLabel} (so far)` : monthLabel}
          </div>
          <div className="font-display font-bold text-3xl text-slate-800 mt-0.5">
            ₹{grandTotal.toLocaleString('en-IN')}
          </div>
        </div>

        {hasComparison && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-display font-semibold ${
            saved  ? 'bg-green-50 border-green-200 text-green-700' :
            higher ? 'bg-red-50 border-red-200 text-red-600' :
                     'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            {saved  ? <TrendingDown className="w-4 h-4" /> :
             higher ? <TrendingUp className="w-4 h-4" />   :
                      <Minus className="w-4 h-4" />}
            {saved  ? `Saved ₹${Math.abs(changeAmount!)} vs last month` :
             higher ? `₹${changeAmount} more than last month` :
                      'Same as last month'}
            {changePct !== null && changePct !== 0 && (
              <span className="opacity-70">({Math.abs(changePct)}%)</span>
            )}
          </div>
        )}
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-3 gap-3">
        {cards.map(({ icon, label, amount, bg, text }) => (
          <div key={label} className={`border rounded-xl p-4 text-center ${bg}`}>
            <div className="flex justify-center mb-2">{icon}</div>
            <div className={`font-display font-bold text-xl ${text}`}>
              ₹{amount.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
