import React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface MonthOption {
  month: string;
  is_current_month: boolean;
  label: string;
}

interface Props {
  months: MonthOption[];
  selectedMonth: string;
  onSelect: (month: string) => void;
}

export default function MonthSelector({ months, selectedMonth, onSelect }: Props) {
  const idx     = months.findIndex(m => m.month === selectedMonth);
  const canPrev = idx < months.length - 1;
  const canNext = idx > 0;

  const go = (dir: 'prev' | 'next') => {
    if (dir === 'prev' && canPrev) onSelect(months[idx + 1].month);
    if (dir === 'next' && canNext) onSelect(months[idx - 1].month);
  };

  const current = months.find(m => m.month === selectedMonth);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => go('prev')}
        disabled={!canPrev}
        className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <ChevronLeft className="w-4 h-4 text-slate-600" />
      </button>

      {/* Month pills */}
      <div className="flex gap-2 overflow-x-auto">
        {[...months].reverse().map(m => (
          <button
            key={m.month}
            onClick={() => onSelect(m.month)}
            className={`px-4 py-2 rounded-xl text-sm font-display font-semibold whitespace-nowrap transition-all ${
              m.month === selectedMonth
                ? 'bg-violet-600 text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-violet-300'
            }`}
          >
            {m.label}
            {m.is_current_month && (
              <span className="ml-1.5 text-xs opacity-75">(now)</span>
            )}
          </button>
        ))}
      </div>

      <button
        onClick={() => go('next')}
        disabled={!canNext}
        className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <ChevronRight className="w-4 h-4 text-slate-600" />
      </button>
    </div>
  );
}
