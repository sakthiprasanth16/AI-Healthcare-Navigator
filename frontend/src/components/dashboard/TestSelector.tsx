import React, { useState } from 'react';
import { FlaskConical, Search, X } from 'lucide-react';
import { TestType } from '../../types';

const TESTS: { value: TestType; label: string; desc: string }[] = [
  { value: 'HbA1c',                label: 'HbA1c',                desc: 'Diabetes monitoring' },
  { value: 'CBC',                  label: 'CBC',                  desc: 'Complete blood count' },
  { value: 'Thyroid Profile',      label: 'Thyroid Profile',      desc: 'Thyroid function' },
  { value: 'Lipid Profile',        label: 'Lipid Profile',        desc: 'Cholesterol levels' },
  { value: 'Vitamin D',            label: 'Vitamin D',            desc: 'Vitamin D levels' },
  { value: 'Fasting Blood Sugar',  label: 'Fasting Blood Sugar',  desc: 'Glucose levels' },
  { value: 'Creatinine',           label: 'Creatinine',           desc: 'Kidney function' },
  { value: 'Liver Function Test',  label: 'Liver Function Test',  desc: 'Liver health panel' },
  { value: 'Kidney Function Test', label: 'Kidney Function Test', desc: 'Kidney health panel' },
];

interface Props {
  onSearch: (tests: TestType[]) => void;
  loading: boolean;
  hasLocation: boolean;
}

export default function TestSelector({ onSearch, loading, hasLocation }: Props) {
  const [selected, setSelected] = useState<TestType[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const toggle = (test: TestType) => {
    setSelected(prev =>
      prev.includes(test) ? prev.filter(t => t !== test) : [...prev, test]
    );
  };

  const remove = (test: TestType) => setSelected(prev => prev.filter(t => t !== test));

  const isMulti = selected.length > 1;

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
          <FlaskConical className="w-4 h-4 text-violet-600" />
        </div>
        <h3 className="font-display font-semibold text-slate-800">Find Nearby Labs</h3>
        {isMulti && (
          <span className="badge badge-teal ml-auto text-xs">Multi-test</span>
        )}
      </div>

      {/* Selected chips — no icons */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected.map(t => (
            <span key={t}
              className="inline-flex items-center gap-1.5 bg-violet-50 border border-violet-200 text-violet-800 text-xs font-semibold font-display rounded-full px-3 py-1.5">
              {t}
              <button onClick={() => remove(t)} className="text-violet-400 hover:text-violet-700 ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {selected.length > 1 && (
            <button onClick={() => setSelected([])}
              className="text-xs text-slate-400 hover:text-red-500 underline font-display ml-1">
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Dropdown */}
      <div className="relative mb-4">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between px-4 py-3 border rounded-xl transition-all text-left ${
            isOpen
              ? 'border-violet-500 shadow-[0_0_0_3px_rgba(124,58,237,0.1)]'
              : 'border-slate-200 hover:border-violet-300'
          }`}
        >
          <span className="text-slate-400 text-sm">
            {selected.length === 0
              ? 'Select one or more tests…'
              : `${selected.length} test${selected.length > 1 ? 's' : ''} selected — click to add more`}
          </span>
          <span className="text-slate-400 text-xs">▼</span>
        </button>

        {isOpen && (
          <div className="absolute z-20 w-full top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden animate-fade-in max-h-72 overflow-y-auto">
            {TESTS.map(test => {
              const isSel = selected.includes(test.value);
              return (
                <button
                  key={test.value}
                  onClick={() => toggle(test.value)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50 transition-colors text-left ${isSel ? 'bg-violet-50' : ''}`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSel ? 'border-violet-500 bg-violet-500' : 'border-slate-300'
                  }`}>
                    {isSel && <span className="text-white text-[10px] font-bold">✓</span>}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 font-display text-sm">{test.label}</div>
                    <div className="text-xs text-slate-400">{test.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isMulti && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 text-xs text-violet-700 mb-3 font-display">
          🔍 Multi-test mode: finding labs that offer <strong>all {selected.length} selected tests</strong>
        </div>
      )}

      <button
        onClick={() => { setIsOpen(false); selected.length > 0 && onSearch(selected); }}
        disabled={!selected.length || !hasLocation || loading}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
      >
        {loading ? (
          <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Running AI analysis…</>
        ) : (
          <><Search className="w-4 h-4" />Find Nearby Labs</>
        )}
      </button>

      {!hasLocation && (
        <p className="text-xs text-amber-600 text-center mt-2">⚠️ Set your location first</p>
      )}
    </div>
  );
}
