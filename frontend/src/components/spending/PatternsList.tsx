import React from 'react';
import { RefreshCw, FlaskConical, Pill, Stethoscope, Clock } from 'lucide-react';

interface Pattern {
  name: string;
  category: 'lab' | 'medicine' | 'doctor';
  months_present: number;
  total_months: number;
  avg_amount: number;
  is_recurring: boolean;
}

interface Props { patterns: Pattern[]; }

const CAT_ICON: Record<string, React.ReactNode> = {
  lab:      <FlaskConical className="w-3.5 h-3.5 text-violet-500" />,
  medicine: <Pill className="w-3.5 h-3.5 text-purple-500" />,
  doctor:   <Stethoscope className="w-3.5 h-3.5 text-blue-500" />,
};

const CAT_LABEL: Record<string, string> = {
  lab: 'Lab', medicine: 'Medicine', doctor: 'Doctor',
};

// Show this many rows before the list scrolls instead of growing the page
const VISIBLE_ROWS = 5;
const ROW_HEIGHT_PX = 52; // approx height of one pattern row incl. gap

export default function PatternsList({ patterns }: Props) {
  if (patterns.length === 0) {
    return (
      <div className="card p-6 text-center">
        <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">Need 2+ months of data to detect patterns</p>
      </div>
    );
  }

  const recurring  = patterns.filter(p => p.is_recurring);
  const occasional = patterns.filter(p => !p.is_recurring);
  const totalRows  = recurring.length + occasional.length;
  const needsScroll = totalRows > VISIBLE_ROWS;

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-violet-600" />
        <h3 className="font-display font-semibold text-slate-800">Spending Patterns</h3>
        <span className="ml-auto text-xs text-slate-400">Last 3 months</span>
      </div>

      <div
        className={needsScroll ? 'overflow-y-auto' : ''}
        style={needsScroll ? { maxHeight: `${VISIBLE_ROWS * ROW_HEIGHT_PX}px` } : undefined}
      >
        {recurring.length > 0 && (
          <div className="p-4 space-y-2">
            <p className="text-xs font-display font-semibold text-slate-400 uppercase tracking-wide px-1 sticky top-0 bg-white">
              🔄 Recurring
            </p>
            {recurring.map((p, i) => (
              <div key={i} className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {CAT_ICON[p.category]}
                  <span className="text-xs text-slate-400 font-display">{CAT_LABEL[p.category]}</span>
                </div>
                <span className="font-display font-semibold text-slate-800 text-sm flex-1 truncate">
                  {p.name}
                </span>
                <div className="text-right flex-shrink-0">
                  <div className="font-display font-bold text-violet-700 text-sm">
                    ₹{p.avg_amount.toLocaleString('en-IN')}
                  </div>
                  <div className="text-xs text-slate-400">{p.months_present}/{p.total_months} months</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {occasional.length > 0 && (
          <div className="px-4 pb-4 space-y-2 border-t border-slate-50 pt-3">
            <p className="text-xs font-display font-semibold text-slate-400 uppercase tracking-wide px-1 sticky top-0 bg-white">
              💡 Occasional
            </p>
            {occasional.map((p, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  {CAT_ICON[p.category]}
                  <span className="text-xs text-slate-400 font-display">{CAT_LABEL[p.category]}</span>
                </div>
                <span className="font-display font-semibold text-slate-700 text-sm flex-1 truncate">{p.name}</span>
                <div className="text-right flex-shrink-0">
                  <div className="font-display font-semibold text-slate-600 text-sm">
                    ₹{p.avg_amount.toLocaleString('en-IN')}
                  </div>
                  <div className="text-xs text-slate-400">{p.months_present}/{p.total_months} months</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {needsScroll && (
        <div className="px-6 py-2 border-t border-slate-100 text-center">
          <span className="text-xs text-slate-400">
            Showing {VISIBLE_ROWS} of {totalRows} · scroll for more
          </span>
        </div>
      )}
    </div>
  );
}
