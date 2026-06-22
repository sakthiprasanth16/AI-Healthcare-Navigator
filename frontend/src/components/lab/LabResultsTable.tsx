import React from 'react';
import { MapPin, Star, TrendingDown } from 'lucide-react';
import { LabResult, LabTestPrice } from '../../types';

interface Props {
  labs: LabResult[];
  onSelect: (lab: LabResult) => void;
  selectedLabId: string | null;
  isMultiTest?: boolean;
  testTypes?: string[];
}

export default function LabResultsTable({ labs, onSelect, selectedLabId, isMultiTest, testTypes }: Props) {
  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-violet-600" />
          <h3 className="font-display font-semibold text-slate-800">Top 5 Nearby Labs</h3>
          {isMultiTest && (
            <span className="badge badge-blue text-xs">All {testTypes?.length} tests available</span>
          )}
        </div>
        <span className="text-xs text-slate-400 font-mono">Ranked by {isMultiTest ? 'total cost' : 'price'} + distance</span>
      </div>

      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 font-display uppercase tracking-wide">Rank</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 font-display uppercase tracking-wide">Lab</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 font-display uppercase tracking-wide">Area</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 font-display uppercase tracking-wide">
                {isMultiTest ? 'Total Cost' : 'Price'}
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 font-display uppercase tracking-wide">Distance</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 font-display uppercase tracking-wide">Travel</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 font-display uppercase tracking-wide">Rating</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {labs.map((lab, i) => {
              const isFallback = lab.distance_source === "fallback";
              const prefix = isFallback ? "~" : "";
              return (
                <React.Fragment key={lab.lab_id}>
                  <tr className={`border-b border-slate-50 transition-colors hover:bg-slate-50/50 ${selectedLabId === lab.lab_id ? 'bg-violet-50/50' : ''}`}>
                    <td className="px-5 py-4">
                      <span className={`rank-badge ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other'}`}>{i + 1}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-800 font-display text-sm">{lab.name}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[200px]">{lab.address}</div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{lab.area}</td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-display font-bold text-slate-800">₹{lab.total_cost ?? lab.price}</span>
                    </td>
                    {/* Distance — source-aware */}
                    <td className="px-5 py-4 text-right">
                      {lab.distance_km != null ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm text-slate-600">{prefix}{lab.distance_km} km</span>
                          {isFallback && (
                            <span className="badge badge-gold" style={{ fontSize: '10px', padding: '2px 6px' }}>
                              Approximate
                            </span>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    {/* Travel — source-aware */}
                    <td className="px-5 py-4 text-right text-sm text-slate-600">
                      {lab.travel_time_min != null ? `${prefix}${lab.travel_time_min} min` : '—'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span className="text-sm text-slate-600">{lab.rating.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => onSelect(lab)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-display font-semibold transition-all ${
                          selectedLabId === lab.lab_id
                            ? 'bg-violet-100 text-violet-800 border border-violet-200'
                            : 'bg-violet-600 text-white hover:bg-violet-700'
                        }`}>
                        {selectedLabId === lab.lab_id ? '✓ Selected' : 'Select'}
                      </button>
                    </td>
                  </tr>
                  {/* Per-test breakdown row */}
                  {isMultiTest && lab.test_prices && selectedLabId === lab.lab_id && (
                    <tr className="bg-violet-50/30">
                      <td colSpan={8} className="px-8 pb-3 pt-1">
                        <div className="flex flex-wrap gap-3">
                          {lab.test_prices.map((tp: LabTestPrice) => (
                            <span key={tp.test_name} className="text-xs bg-white border border-violet-100 rounded-lg px-2.5 py-1 font-display">
                              <span className="text-slate-500">{tp.test_name}:</span>
                              <span className="font-semibold text-violet-700 ml-1">₹{tp.price}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden divide-y divide-slate-100">
        {labs.map((lab, i) => {
          const isFallback = lab.distance_source === "fallback";
          const prefix = isFallback ? "~" : "";
          return (
            <div key={lab.lab_id} className={`p-4 ${selectedLabId === lab.lab_id ? 'bg-violet-50/50' : ''}`}>
              <div className="flex items-start gap-3 mb-3">
                <span className={`rank-badge flex-shrink-0 ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other'}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold text-slate-800 text-sm">{lab.name}</div>
                  <div className="text-xs text-slate-400">{lab.area}</div>
                </div>
                <div className="flex items-center gap-0.5">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span className="text-xs text-slate-500">{lab.rating.toFixed(1)}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <div className="font-display font-bold text-slate-800 text-sm">₹{lab.total_cost ?? lab.price}</div>
                  <div className="text-xs text-slate-400">{isMultiTest ? 'Total' : 'Price'}</div>
                </div>
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <div className="font-display font-bold text-slate-800 text-sm">
                    {lab.distance_km != null ? `${prefix}${lab.distance_km}km` : '—'}
                  </div>
                  <div className="text-xs text-slate-400">{isFallback ? 'Est. Dist.' : 'Distance'}</div>
                  {isFallback && (
                    <span className="badge badge-gold mt-0.5" style={{ fontSize: '9px', padding: '1px 5px' }}>
                      Approx.
                    </span>
                  )}
                </div>
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <div className="font-display font-bold text-slate-800 text-sm">
                    {lab.travel_time_min != null ? `${prefix}${lab.travel_time_min}m` : '—'}
                  </div>
                  <div className="text-xs text-slate-400">{isFallback ? 'Est. Travel' : 'Travel'}</div>
                </div>
              </div>
              <button onClick={() => onSelect(lab)}
                className={`w-full py-2 rounded-lg text-xs font-display font-semibold transition-all ${
                  selectedLabId === lab.lab_id
                    ? 'bg-violet-100 text-violet-800 border border-violet-200'
                    : 'bg-violet-600 text-white hover:bg-violet-700'
                }`}>
                {selectedLabId === lab.lab_id ? '✓ Selected' : 'Select This Lab'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
