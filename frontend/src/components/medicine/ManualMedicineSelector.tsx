import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Search, Pill } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../lib/toast-context';
import { MedicineCostResultAPI } from '../../types';

interface CatalogGroup { group: string; medicines: string[]; }

interface Props {
  patientType: string;
  onResult: (result: MedicineCostResultAPI) => void;
}

export default function ManualMedicineSelector({ patientType, onResult }: Props) {
  const [catalog, setCatalog]   = useState<CatalogGroup[]>([]);
  const [selected, setSelected] = useState('');
  const [list, setList]         = useState<string[]>([]);
  const [loading, setLoading]   = useState(false);
  const [fetching, setFetching] = useState(true);
  const { showToast } = useToast();

  // ── Fetch medicine catalog from DB ────────────────────────────────────────
  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const res = await api.get('/medicine/catalog');
        setCatalog(res.data);
      } catch {
        // Fallback hardcoded if API fails
        setCatalog([
          { group: 'Type 2 Diabetes',  medicines: ['Glycomet GP2','Glycomet SR 500','Janumet 50/500','Amaryl 2','Metformin 500','Glimepiride 2mg'] },
          { group: 'Hypertension',     medicines: ['Telma 40','Telsar 40','Amlokind 5','Repace 50','Telmikind 40','Amlodipine 5mg','Telmisartan 40mg'] },
          { group: 'High Cholesterol', medicines: ['Rosuvas 10','Rozavel 10','Atorlip 10','Storvas 10','Rosuvastatin 10mg','Atorvastatin 10mg'] },
          { group: 'Hypothyroidism',   medicines: ['Thyronorm 50','Eltroxin 50','Levothyroxine 50mcg'] },
          { group: 'Asthma',           medicines: ['Asthalin','Budecort','Foracort','Duolin','Salbutamol 100mcg'] },
        ]);
      } finally {
        setFetching(false);
      }
    };
    fetchCatalog();
  }, []);

  const addMedicine = () => {
    if (!selected || list.includes(selected)) return;
    setList(prev => [...prev, selected]);
    setSelected('');
  };

  const remove = (m: string) => setList(prev => prev.filter(x => x !== m));

  const handleOptimize = async () => {
    if (list.length === 0) { showToast({ type: 'warning', title: 'Add at least one medicine' }); return; }
    setLoading(true);
    try {
      const res = await api.post('/medicine/optimize/manual', {
        patient_type: patientType,
        medicines: list.map(name => ({ name })),
      });
      onResult(res.data);
      showToast({ type: 'success', title: 'Alternatives found!', message: `Analyzed ${list.length} medicine(s)` });
    } catch (err: any) {
      showToast({ type: 'error', title: 'Optimization failed', message: err.response?.data?.detail || 'Check medicine names' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
          <Pill className="w-4 h-4 text-purple-600" />
        </div>
        <h3 className="font-display font-semibold text-slate-800">Manual Selection</h3>
        <span className="badge badge-teal ml-auto text-xs">{patientType}</span>
      </div>

      <p className="text-xs text-slate-400 mb-4">
        Select any medicine your doctor prescribed — all medicines listed regardless of condition.
      </p>

      {/* Add medicine row */}
      <div className="flex gap-2 mb-4">
        <select
          className="input-field flex-1 text-sm"
          value={selected}
          onChange={e => setSelected(e.target.value)}
          disabled={fetching}
        >
          <option value="">{fetching ? 'Loading medicines…' : 'Select a medicine…'}</option>
          {catalog.map(group => (
            <optgroup key={group.group} label={group.group}>
              {group.medicines
                .filter(m => !list.includes(m))
                .map(m => <option key={m} value={m}>{m}</option>)}
            </optgroup>
          ))}
        </select>
        <button
          onClick={addMedicine}
          disabled={!selected}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 text-white font-display font-semibold text-sm rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-all"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Medicine list */}
      {list.length > 0 && (
        <div className="space-y-2 mb-4">
          {list.map(m => (
            <div key={m} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Pill className="w-4 h-4 text-purple-400" />
                <span className="font-display font-semibold text-slate-700 text-sm">{m}</span>
              </div>
              <button onClick={() => remove(m)} className="text-slate-300 hover:text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {list.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">
          Add medicines from the dropdown above (up to 5 recommended)
        </div>
      )}

      <button
        onClick={handleOptimize}
        disabled={list.length === 0 || loading}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Finding alternatives…</>
          : <><Search className="w-4 h-4" />Find Best Alternative</>
        }
      </button>
    </div>
  );
}
