import React from 'react';
import { Trophy, MapPin, Clock, Star, Sparkles, CheckCircle, IndianRupee } from 'lucide-react';
import { LabResult, LabTestPrice } from '../../types';

interface Props {
  lab: LabResult;
  reason: string;
  testType: string;
  isMultiTest?: boolean;
  onSelect: (lab: LabResult) => void;
  selected: boolean;
}

export default function RecommendedLabCard({ lab, reason, testType, isMultiTest, onSelect, selected }: Props) {
  const displayPrice = lab.total_cost ?? lab.price;
  const isFallback = lab.distance_source === "fallback";

  return (
    <div className={`relative overflow-hidden rounded-2xl border-2 transition-all duration-300 ${
      selected ? 'border-violet-500 shadow-lg' : 'border-violet-200 hover:border-violet-400 hover:shadow-md'
    } bg-gradient-to-br from-violet-50 to-white`}>

      <div className="bg-gradient-to-r from-violet-700 to-violet-500 px-6 py-3 flex items-center gap-2">
        <Trophy className="w-4 h-4 text-yellow-300" />
        <span className="text-white font-display font-semibold text-sm">AI Recommended</span>
        <span className="ml-auto badge bg-white/20 border-white/30 text-white text-xs">{testType}</span>
      </div>

      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-2xl text-slate-800">{lab.name}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 text-sm">{lab.area}</span>
              <span className="text-slate-300">•</span>
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="text-slate-600 text-sm font-medium">{lab.rating.toFixed(1)}</span>
            </div>
          </div>
          {selected && (
            <span className="badge badge-teal">
              <CheckCircle className="w-3 h-3" />Selected
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm">
            <IndianRupee className="w-4 h-4 text-violet-600 mx-auto mb-1" />
            <div className="font-display font-bold text-xl text-slate-800">₹{displayPrice}</div>
            <div className="text-xs text-slate-400 mt-0.5">{isMultiTest ? 'Total Cost' : 'Test Cost'}</div>
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm">
            <MapPin className="w-4 h-4 text-violet-400 mx-auto mb-1" />
            <div className="font-display font-bold text-xl text-slate-800">
              {lab.distance_km != null ? `${isFallback ? '~' : ''}${lab.distance_km}` : '—'}
              <span className="text-sm font-normal text-slate-500"> km</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {isFallback ? 'Est. Distance' : 'Distance'}
            </div>
            {isFallback && (
              <span className="badge badge-gold mt-1" style={{ fontSize: '10px', padding: '2px 6px' }}>
                Approximate
              </span>
            )}
          </div>
          <div className="bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm">
            <Clock className="w-4 h-4 text-violet-400 mx-auto mb-1" />
            <div className="font-display font-bold text-xl text-slate-800">
              {lab.travel_time_min != null ? `${isFallback ? '~' : ''}${lab.travel_time_min}` : '—'}
              <span className="text-sm font-normal text-slate-500"> min</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {isFallback ? 'Est. Travel' : 'Travel'}
            </div>
          </div>
        </div>

        {/* Per-test breakdown for multi-test */}
        {isMultiTest && lab.test_prices && lab.test_prices.length > 0 && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4">
            <p className="text-xs font-display font-semibold text-slate-500 mb-2 uppercase tracking-wide">Test Breakdown</p>
            <div className="space-y-1">
              {lab.test_prices.map((tp: LabTestPrice) => (
                <div key={tp.test_name} className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">{tp.test_name}</span>
                  <span className="font-display font-semibold text-slate-800">₹{tp.price}</span>
                </div>
              ))}
              <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between items-center text-sm">
                <span className="font-display font-bold text-slate-800">Total</span>
                <span className="font-display font-bold text-violet-700">₹{displayPrice}</span>
              </div>
            </div>
          </div>
        )}

        {/* Gemini summary */}
        <div className="bg-white/80 border border-violet-100 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-xs font-semibold text-violet-700 font-display uppercase tracking-wide">AI Analysis</span>
          </div>
          <p className="text-slate-600 text-sm leading-relaxed">{reason}</p>
        </div>

        <button
          onClick={() => onSelect(lab)}
          className={`w-full py-3 rounded-xl font-display font-semibold text-sm transition-all duration-200 ${
            selected ? 'bg-violet-100 text-violet-800 border-2 border-violet-300 cursor-default' : 'btn-primary'
          }`}
        >
          {selected ? '✓ Lab Selected' : 'Select This Lab'}
        </button>
      </div>
    </div>
  );
}
