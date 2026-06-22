import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, FlaskConical, Pill, ChevronRight } from 'lucide-react';

interface Suggestion {
  category: 'medicine' | 'lab';
  title: string;
  current_spend: number;
  potential_saving: number;
  action: string;
  link_to: string;
}

interface Props { suggestions: Suggestion[]; }

// Show this many cards before the list scrolls instead of growing the page
const VISIBLE_CARDS = 4;
const CARD_HEIGHT_PX = 84; // approx height of one suggestion card

export default function SuggestionsList({ suggestions }: Props) {
  const navigate = useNavigate();

  if (suggestions.length === 0) {
    return (
      <div className="card p-6 text-center">
        <Lightbulb className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">No saving suggestions at this time</p>
      </div>
    );
  }

  const totalSaving = suggestions.reduce((s, sg) => s + sg.potential_saving, 0);
  const needsScroll  = suggestions.length > VISIBLE_CARDS;

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h3 className="font-display font-semibold text-slate-800">Saving Suggestions</h3>
        <span className="ml-auto badge badge-teal text-xs">
          Save ₹{totalSaving.toLocaleString('en-IN')}
        </span>
      </div>

      <div
        className={needsScroll ? 'divide-y divide-slate-50 overflow-y-auto' : 'divide-y divide-slate-50'}
        style={needsScroll ? { maxHeight: `${VISIBLE_CARDS * CARD_HEIGHT_PX}px` } : undefined}
      >
        {suggestions.map((sg, i) => (
          <div key={i} className="px-5 py-4">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                sg.category === 'medicine' ? 'bg-purple-100' : 'bg-violet-100'
              }`}>
                {sg.category === 'medicine'
                  ? <Pill className="w-4 h-4 text-purple-600" />
                  : <FlaskConical className="w-4 h-4 text-violet-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold text-slate-800 text-sm">{sg.title}</div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{sg.action}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-display font-bold text-green-700 text-sm">
                  Save ₹{sg.potential_saving}
                </div>
                <button
                  onClick={() => navigate(sg.link_to)}
                  className="flex items-center gap-0.5 text-xs text-violet-600 font-display font-semibold hover:gap-1.5 transition-all mt-1"
                >
                  {sg.category === 'medicine' ? 'Optimize' : 'Find Lab'}
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {needsScroll && (
        <div className="px-6 py-2 border-t border-slate-100 text-center">
          <span className="text-xs text-slate-400">
            Showing {VISIBLE_CARDS} of {suggestions.length} · scroll for more
          </span>
        </div>
      )}
    </div>
  );
}
