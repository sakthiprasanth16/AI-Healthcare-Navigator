import React, { useState, useRef, useEffect } from 'react';
import {
  Trash2, TrendingDown, CheckCircle, Info, HelpCircle,
  Plus, RefreshCw, Calendar, Store,
} from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../lib/toast-context';
import { Medicine } from '../../types';

interface PharmacyOption {
  pharmacy_id:      string;
  pharmacy_name:    string;
  area:             string;
  address?:         string;
  distance_km?:     number;
  travel_time_min?: number;
}
interface PharmacyMed  { name: string; price: number; }
interface PharmacyGroup {
  pharmacy_id: string; pharmacy_name: string;
  area: string; address: string; medicines: PharmacyMed[];
}
interface AltOption {
  name: string; pharmacy_id: string;
  pharmacy_name: string; area: string; price: number;
}
interface Props {
  medicines:            Medicine[];
  // Accepts either a new array directly, OR a React-style updater function
  // (prev => next) — matches how this prop is actually called throughout
  // this file (e.g. onChange(prev => prev.map(...))).
  onChange:             (updated: Medicine[] | ((prev: Medicine[]) => Medicine[])) => void;
  recommendedPharmacy?: PharmacyOption | null;
  pharmacyResetKey?:    number;
}

type MedStatus = 'saving_found' | 'already_best' | 'marginal_saving' | 'not_found' | string;
const MARGINAL = 10;

function StatusBadge({ status, saving }: { status: MedStatus; saving: number }) {
  if (status === 'saving_found' && saving > 0)
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-display font-semibold bg-teal-50 border border-teal-200 text-teal-700 whitespace-nowrap"><TrendingDown className="w-3 h-3" />Save ₹{saving}</span>;
  if (status === 'already_best')
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-display font-semibold bg-green-50 border border-green-200 text-green-700 whitespace-nowrap"><CheckCircle className="w-3 h-3" />Best price</span>;
  if (status === 'marginal_saving')
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-display font-semibold bg-blue-50 border border-blue-200 text-blue-600 whitespace-nowrap"><Info className="w-3 h-3" />Low saving</span>;
  if (status === 'not_found')
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-display font-semibold bg-amber-50 border border-amber-200 text-amber-700 whitespace-nowrap"><HelpCircle className="w-3 h-3" />Not in catalog</span>;
  if (saving > 0)
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-display font-semibold bg-teal-50 border border-teal-200 text-teal-700 whitespace-nowrap"><TrendingDown className="w-3 h-3" />Save ₹{saving}</span>;
  return <span className="text-xs text-slate-400">—</span>;
}
function rowBg(s: MedStatus) {
  if (s === 'already_best')    return 'bg-green-50/30';
  if (s === 'marginal_saving') return 'bg-blue-50/20';
  if (s === 'not_found')       return 'bg-amber-50/40';
  return '';
}
const makeVal = (n: string, pid: string, pn: string, a: string, p: number) =>
  `${n}||${pid}||${pn}||${a}||${p}`;

export default function MedicineTable({
  medicines, onChange, recommendedPharmacy, pharmacyResetKey = 0,
}: Props) {
  const { showToast } = useToast();

  // ── Alternatives store: medicineId → grouped { pharmacyName → AltOption[] } ──
  const [pharmAlts, setPharmAlts] = useState<Record<string, Record<string, AltOption[]>>>({});

  // ── Track which medicine IDs we have already fetched alts for ─────────────
  // Key: medicineId only (NOT pharmacy_id) — we fetch once per medicine,
  // store ALL options across ALL pharmacies, never refetch.
  // The dropdown always has all options. Auto-select is done ONCE on first fetch.
  const fetchedIds = useRef<Set<string>>(new Set());

  // ── Track which medicine IDs we have already AUTO-SELECTED for ────────────
  // Prevents infinite loop: auto-select changes pharmacy_id → triggers re-render
  // → but we DON'T re-fetch or re-auto-select because id is in this set.
  const autoSelectedIds = useRef<Set<string>>(new Set());

  // Add medicine
  const [pharmacyGroups, setPharmacyGroups]         = useState<PharmacyGroup[]>([]);
  const [addPharmacyId, setAddPharmacyId]           = useState('');
  const [addMedName, setAddMedName]                 = useState('');
  const [addQty, setAddQty]                         = useState(1);
  const [addLoading, setAddLoading]                 = useState(false);
  const [pharmGroupsLoading, setPharmGroupsLoading] = useState(false);

  // Frequency
  const freqMemory = useRef<Record<string, number | null>>({});
  const [daysInput, setDaysInput] = useState<Record<string, string>>({});

  // Sync freq memory
  useEffect(() => {
    medicines.forEach(m => {
      const fpd = (m as any).frequencyPerDay ?? null;
      if (fpd !== undefined && !(m.id in freqMemory.current))
        freqMemory.current[m.id] = fpd;
    });
  }, [medicines]);

  // Fetch pharmacy groups for Add Medicine (once)
  useEffect(() => {
    if (pharmacyGroups.length > 0) return;
    setPharmGroupsLoading(true);
    api.get('/pharmacy/medicines')
      .then(res => setPharmacyGroups(res.data))
      .catch(() => {})
      .finally(() => setPharmGroupsLoading(false));
  }, []);

  // Clear caches when pharmacy recommendation changes
  useEffect(() => {
    if (pharmacyResetKey === 0) return;
    fetchedIds.current.clear();
    autoSelectedIds.current.clear();
    setPharmAlts({});
  }, [pharmacyResetKey]);

  // ── Fetch alternatives for each medicine (ONCE per medicine id) ───────────
  useEffect(() => {
    medicines.forEach(async (med) => {
      // Only fetch if not already fetched for this medicine id
      if (fetchedIds.current.has(med.id)) return;
      // Skip if explicitly not_found (set by workflow for truly unknown medicines)
      if ((med as any).status === 'not_found') {
        fetchedIds.current.add(med.id); // mark so it stops showing "Loading..."
        return;
      }
      // For medicines with no pharmacy_id (not found in any pharmacy via name match)
      // still try alternatives by ingredient — may find something
      const pharmId = (med as any).pharmacy_id ?? '';
      // Wait for pharmacy recommendation to assign pharmacy_id
      // But if price is 0 AND no pharmacy_id AND already tried — mark as done
      if (!pharmId && (med as any).currentPrice === 0) {
        // Try ingredient-based search even without pharmacy
        fetchedIds.current.add(med.id);
        const activeIng = med.activeIngredient || '';
        const strength  = med.strength || '';
        if (!activeIng || activeIng === 'Unknown') {
          // Truly unknown — mark not_found
          onChange(prev => prev.map(m =>
            m.id !== med.id ? m : { ...m, status: 'not_found' } as any
          ));
          return;
        }
        // Has ingredient info — try finding alternatives
        try {
          const res = await api.post('/pharmacy/alternatives', {
            medicine_name:       med.name,
            active_ingredient:   activeIng,
            strength:            strength,
            current_pharmacy_id: '',
          });
          const alts: AltOption[] = res.data;
          if (alts.length > 0) {
            const grouped: Record<string, AltOption[]> = {};
            alts.forEach(a => {
              if (!grouped[a.pharmacy_name]) grouped[a.pharmacy_name] = [];
              grouped[a.pharmacy_name].push(a);
            });
            setPharmAlts(prev => ({ ...prev, [med.id]: grouped }));
            // Auto-select cheapest
            const cheapest = alts[0];
            onChange(prev => prev.map(m => {
              if (m.id !== med.id) return m;
              return {
                ...m,
                currentPrice:         0,   // original price unknown
                selectedMedicineName: cheapest.name,
                selectedPrice:        cheapest.price,
                rowTotal:             parseFloat((cheapest.price * m.quantity).toFixed(2)),
                saving:               0,   // can't calc saving without original price
                status:               'already_best',
                pharmacy_id:          cheapest.pharmacy_id,
                pharmacy_name:        cheapest.pharmacy_name,
                pharmacy_area:        cheapest.area,
              } as any;
            }));
          } else {
            // No alternatives either → truly not_found
            onChange(prev => prev.map(m =>
              m.id !== med.id ? m : { ...m, status: 'not_found' } as any
            ));
          }
        } catch {
          onChange(prev => prev.map(m =>
            m.id !== med.id ? m : { ...m, status: 'not_found' } as any
          ));
        }
        return;
      }
      if (!pharmId) return; // still waiting for pharmacy recommendation

      fetchedIds.current.add(med.id);

      try {
        const res = await api.post('/pharmacy/alternatives', {
          medicine_name:       med.name,
          active_ingredient:   med.activeIngredient,
          strength:            med.strength,
          current_pharmacy_id: pharmId,
        });

        const alts: AltOption[] = res.data;

        // Group by pharmacy name for optgroup display
        const grouped: Record<string, AltOption[]> = {};
        alts.forEach(a => {
          if (!grouped[a.pharmacy_name]) grouped[a.pharmacy_name] = [];
          grouped[a.pharmacy_name].push(a);
        });
        setPharmAlts(prev => ({ ...prev, [med.id]: grouped }));

        // ── Auto-select cheapest IF not already done for this medicine ──────
        if (autoSelectedIds.current.has(med.id)) return;
        if (alts.length === 0) return;

        const cheapest = alts[0]; // sorted by price asc
        const saving   = med.currentPrice - cheapest.price;

        if (saving >= MARGINAL) {
          autoSelectedIds.current.add(med.id); // mark BEFORE onChange to prevent re-trigger
          onChange(prev => prev.map(m => {
            if (m.id !== med.id) return m;
            const qty      = m.quantity;
            const rowSaving = parseFloat((saving * qty).toFixed(2));
            return {
              ...m,
              selectedMedicineName: cheapest.name,
              selectedPrice:        cheapest.price,
              rowTotal:             parseFloat((cheapest.price * qty).toFixed(2)),
              saving:               rowSaving,
              status:               'saving_found',
              pharmacy_id:          cheapest.pharmacy_id,
              pharmacy_name:        cheapest.pharmacy_name,
              pharmacy_area:        cheapest.area,
            } as any;
          }));
        } else {
          // No significant saving — mark as already done so we don't check again
          autoSelectedIds.current.add(med.id);
        }

      } catch {
        setPharmAlts(prev => ({ ...prev, [med.id]: {} }));
        fetchedIds.current.delete(med.id); // allow retry on error
      }
    });
  // Only re-run when medicines array changes by id — NOT by pharmacy_id
  // This prevents the infinite loop where auto-select changes pharmacy_id
  // which would re-trigger the effect
  }, [medicines.map(m => m.id).join(','), pharmacyResetKey]);

  // ── Row update ────────────────────────────────────────────────────────────
  const updateRow = (id: string, patch: Partial<Medicine> & Record<string, any>) => {
    onChange(medicines.map(m => {
      if (m.id !== id) return m;
      const u: any = { ...m, ...patch };
      u.rowTotal = parseFloat((u.selectedPrice * u.quantity).toFixed(2));
      const st   = u.status ?? (m as any).status;
      u.saving   = st === 'saving_found'
        ? Math.max(0, parseFloat(((u.currentPrice - u.selectedPrice) * u.quantity).toFixed(2)))
        : 0;
      return u as Medicine;
    }));
  };

  // User manually changes dropdown
  const handleAltChange = (id: string, value: string) => {
    if (!value) return;
    const [medName, pharmId, pharmName, area, priceStr] = value.split('||');
    const price     = parseFloat(priceStr);
    const med       = medicines.find(m => m.id === id)!;
    const newSaving = Math.max(0, med.currentPrice - price);
    const newStatus = newSaving >= MARGINAL ? 'saving_found'
                    : newSaving > 0 ? 'marginal_saving' : 'already_best';
    updateRow(id, {
      selectedMedicineName: medName, selectedPrice: price,
      saving: newSaving, status: newStatus,
      pharmacy_id: pharmId, pharmacy_name: pharmName, pharmacy_area: area,
    });
  };

  const handleQtyChange = (id: string, qty: number) => {
    if (qty >= 1) updateRow(id, { quantity: qty });
  };

  const handleDaysUpdate = (id: string) => {
    const days = parseInt(daysInput[id] || '0', 10);
    if (!days || days < 1) { showToast({ type: 'warning', title: 'Enter valid number of days' }); return; }
    const fpd = freqMemory.current[id];
    if (!fpd) { updateRow(id, { quantity: days }); showToast({ type: 'info', title: `Qty set to ${days}` }); return; }
    const qty = Math.max(1, Math.round(fpd * days));
    updateRow(id, { quantity: qty });
    showToast({ type: 'success', title: `Qty updated to ${qty}`, message: `${fpd}×/day × ${days} days` });
  };

  const removeRow = (id: string) => onChange(medicines.filter(m => m.id !== id));

  const handleAddMedicine = async () => {
    if (!addMedName || !addPharmacyId) return;
    setAddLoading(true);
    try {
      const res = await api.post('/medicine/optimize/manual', {
        patient_type: 'General Health Checkup', medicines: [{ name: addMedName }],
      });
      if (res.data.medicines?.length > 0) {
        const nm    = res.data.medicines[0];
        const group = pharmacyGroups.find(g => g.pharmacy_id === addPharmacyId);
        const pmed  = group?.medicines.find(m => m.name === addMedName);
        const price = pmed?.price ?? nm.selected_price;
        const conv: any = {
          id: nm.id, name: nm.name,
          activeIngredient: nm.active_ingredient, strength: nm.strength,
          currentPrice: price,
          alternatives: (nm.alternatives || []).map((a: any) => ({ name: a.name, price: a.price, isGeneric: false })),
          selectedMedicineName: nm.name, selectedPrice: price,
          quantity: addQty, rowTotal: parseFloat((price * addQty).toFixed(2)),
          saving: 0, status: 'already_best',
          pharmacy_id: addPharmacyId,
          pharmacy_name: group?.pharmacy_name ?? '',
          pharmacy_area: group?.area ?? '',
        };
        onChange([...medicines, conv]);
        setAddMedName(''); setAddPharmacyId(''); setAddQty(1);
        showToast({ type: 'success', title: `${addMedName} added` });
      } else { showToast({ type: 'warning', title: 'Medicine not found in catalog' }); }
    } catch { showToast({ type: 'error', title: 'Could not add medicine' }); }
    finally  { setAddLoading(false); }
  };

  if (medicines.length === 0) return null;

  const grandTotal  = medicines.filter(m => (m as any).status !== 'not_found').reduce((s, m) => s + m.rowTotal, 0);
  const totalSaving = medicines.reduce((s, m) => s + m.saving, 0);
  const selPharmMeds = pharmacyGroups.find(g => g.pharmacy_id === addPharmacyId)?.medicines ?? [];

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <TrendingDown className="w-4 h-4 text-purple-600" />
        <h3 className="font-display font-semibold text-slate-800">Medicine Alternatives</h3>
        <span className="ml-auto text-xs text-slate-400 font-mono">{medicines.length} medicine(s)</span>
      </div>

      {recommendedPharmacy && (
        <div className="px-6 py-2.5 bg-violet-50 border-b border-violet-100 flex items-center gap-2">
          <Store className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />
          <span className="text-xs font-display text-violet-700">
            <span className="font-bold">AI Recommended: </span>
            {recommendedPharmacy.pharmacy_name} — {recommendedPharmacy.area}
            {recommendedPharmacy.distance_km != null && (
              <span className="text-violet-500 ml-2">
                · {recommendedPharmacy.distance_km} km · {recommendedPharmacy.travel_time_min} min
              </span>
            )}
          </span>
        </div>
      )}

      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              {['Medicine','Pharmacy','Price','Select Alternative','Alt Price','Days','Qty','Total','Status',''].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 font-display uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {medicines.map(med => {
              const status     = ((med as any).status ?? 'saving_found') as MedStatus;
              const isNotFound = status === 'not_found';
              const pharmName  = (med as any).pharmacy_name as string | undefined;
              const pharmArea  = (med as any).pharmacy_area as string | undefined;
              const pharmId    = (med as any).pharmacy_id   as string | undefined;
              const freqLabel  = (med as any).frequency
                ? `${(med as any).frequency}${(med as any).durationDays ? ` · ${(med as any).durationDays}d` : ''}` : null;
              const hasFpd     = !!freqMemory.current[med.id];
              const grouped    = pharmAlts[med.id] ?? {};
              const hasAlts    = Object.keys(grouped).length > 0;
              const altsReady  = fetchedIds.current.has(med.id);
              const currentVal = makeVal(med.selectedMedicineName, pharmId ?? '', pharmName ?? '', pharmArea ?? '', med.selectedPrice);

              return (
                <tr key={med.id} className={`border-b border-slate-50 hover:bg-slate-50/30 transition-colors ${rowBg(status)}`}>
                  <td className="px-3 py-3">
                    <div className="font-display font-semibold text-slate-800 text-sm">{med.name}</div>
                    {med.strength && <div className="text-xs text-slate-400">{med.activeIngredient} · {med.strength}</div>}
                    {freqLabel && <div className="text-xs text-purple-500 mt-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" />{freqLabel}</div>}
                  </td>
                  <td className="px-3 py-3 min-w-[110px]">
                    {pharmName
                      ? <div><div className="text-xs font-display font-semibold text-slate-700">{pharmName}</div><div className="text-xs text-slate-400">{pharmArea}</div></div>
                      : <span className="text-xs text-slate-400 italic">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {isNotFound ? <span className="text-xs text-slate-400 italic">Unknown</span>
                      : <span className="font-display font-bold text-slate-700">₹{med.currentPrice}</span>}
                  </td>
                  <td className="px-3 py-3 min-w-[240px]">
                    {isNotFound ? <span className="text-xs text-amber-600 italic">Ask pharmacist</span>
                      : !altsReady
                        ? <span className="text-xs text-slate-400 italic flex items-center gap-1"><div className="w-3 h-3 border border-purple-300 border-t-purple-600 rounded-full animate-spin" />Loading…</span>
                        : !hasAlts
                          ? <span className="text-xs text-slate-400 italic">Only option available</span>
                          : (
                            <select className="input-field text-sm py-2 w-full" value={currentVal} onChange={e => handleAltChange(med.id, e.target.value)}>
                              <option value={currentVal}>
                                {med.selectedMedicineName}{pharmName ? ` @ ${pharmName}` : ''} — ₹{med.selectedPrice}
                                {status === 'saving_found' ? ' ✓' : ''}
                              </option>
                              {Object.entries(grouped).map(([pname, opts]) => (
                                <optgroup key={pname} label={`── ${pname} ──`}>
                                  {opts.map(a => {
                                    const val = makeVal(a.name, a.pharmacy_id, a.pharmacy_name, a.area, a.price);
                                    if (val === currentVal) return null;
                                    const s = med.currentPrice - a.price;
                                    return (
                                      <option key={val} value={val}>
                                        {a.name} — ₹{a.price}{s >= MARGINAL ? ` (save ₹${s})` : ''}
                                      </option>
                                    );
                                  })}
                                </optgroup>
                              ))}
                            </select>
                          )}
                  </td>
                  <td className="px-3 py-3">
                    {isNotFound ? <span className="text-xs text-slate-400">—</span>
                      : <span className={`font-display font-bold text-sm ${med.selectedPrice < med.currentPrice ? 'text-teal-700' : 'text-slate-700'}`}>₹{med.selectedPrice}</span>}
                  </td>
                  <td className="px-3 py-3 min-w-[110px]">
                    {isNotFound ? <span className="text-xs text-slate-400">—</span> : (
                      <div className="flex items-center gap-1">
                        <input type="number" min={1} max={365} placeholder="days" value={daysInput[med.id] ?? ''}
                          onChange={e => setDaysInput(prev => ({ ...prev, [med.id]: e.target.value }))}
                          className="w-14 input-field text-sm py-1.5 text-center" />
                        <button onClick={() => handleDaysUpdate(med.id)} title={hasFpd ? 'Auto-calc qty' : 'Set qty=days'}
                          className="p-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-600 transition-colors">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {isNotFound ? <span className="text-xs text-slate-400">—</span>
                      : <input type="number" min={1} max={999} value={med.quantity}
                          onChange={e => handleQtyChange(med.id, parseInt(e.target.value) || 1)}
                          className="w-16 input-field text-sm py-1.5 text-center" />}
                  </td>
                  <td className="px-3 py-3">
                    {isNotFound ? <span className="text-xs text-slate-400">—</span>
                      : <span className="font-display font-bold text-slate-800">₹{med.rowTotal}</span>}
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={status} saving={med.saving} /></td>
                  <td className="px-3 py-3">
                    <button onClick={() => removeRow(med.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-purple-50 border-t-2 border-purple-100">
              <td colSpan={7} className="px-3 py-3 font-display font-bold text-slate-700 text-sm">
                Grand Total
                {totalSaving > 0 && <span className="ml-3 text-xs font-normal text-teal-600">(saving ₹{totalSaving.toFixed(0)})</span>}
              </td>
              <td className="px-3 py-3 font-display font-bold text-purple-700 text-base">₹{grandTotal.toFixed(2)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden divide-y divide-slate-100">
        {medicines.map(med => {
          const status     = ((med as any).status ?? 'saving_found') as MedStatus;
          const isNotFound = status === 'not_found';
          const pharmName  = (med as any).pharmacy_name as string | undefined;
          const pharmArea  = (med as any).pharmacy_area as string | undefined;
          const pharmId    = (med as any).pharmacy_id   as string | undefined;
          const freqLabel  = (med as any).frequency ? `${(med as any).frequency}${(med as any).durationDays ? ` · ${(med as any).durationDays}d` : ''}` : null;
          const hasFpd     = !!freqMemory.current[med.id];
          const grouped    = pharmAlts[med.id] ?? {};
          const hasAlts    = Object.keys(grouped).length > 0;
          const altsReady  = fetchedIds.current.has(med.id);
          const currentVal = makeVal(med.selectedMedicineName, pharmId ?? '', pharmName ?? '', pharmArea ?? '', med.selectedPrice);

          return (
            <div key={med.id} className={`p-4 space-y-3 ${rowBg(status)}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display font-semibold text-slate-800">{med.name}</div>
                  {med.strength && <div className="text-xs text-slate-400">{med.strength}</div>}
                  {pharmName && <div className="text-xs text-purple-600 flex items-center gap-1 mt-0.5"><Store className="w-3 h-3" />{pharmName} · {pharmArea}</div>}
                  {freqLabel && <div className="text-xs text-purple-500 mt-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" />{freqLabel}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={status} saving={med.saving} />
                  <button onClick={() => removeRow(med.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              {!isNotFound && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/80 rounded-lg p-2 text-center border border-slate-100">
                    <div className="text-xs text-slate-400">Original Price</div>
                    <div className="font-display font-bold text-slate-700">₹{med.currentPrice}</div>
                  </div>
                  <div className={`rounded-lg p-2 text-center border ${med.selectedPrice < med.currentPrice ? 'bg-teal-50 border-teal-100' : 'bg-white/80 border-slate-100'}`}>
                    <div className="text-xs text-slate-400">Selected</div>
                    <div className={`font-display font-bold ${med.selectedPrice < med.currentPrice ? 'text-teal-700' : 'text-slate-700'}`}>₹{med.selectedPrice}</div>
                  </div>
                </div>
              )}
              {!isNotFound && !altsReady && <div className="text-xs text-slate-400 italic flex items-center gap-1"><div className="w-3 h-3 border border-purple-300 border-t-purple-600 rounded-full animate-spin" />Loading alternatives…</div>}
              {!isNotFound && altsReady && hasAlts && (
                <select className="input-field text-sm w-full" value={currentVal} onChange={e => handleAltChange(med.id, e.target.value)}>
                  <option value={currentVal}>{med.selectedMedicineName}{pharmName ? ` @ ${pharmName}` : ''} — ₹{med.selectedPrice}</option>
                  {Object.entries(grouped).map(([pname, opts]) => (
                    <optgroup key={pname} label={pname}>
                      {opts.map(a => {
                        const val = makeVal(a.name, a.pharmacy_id, a.pharmacy_name, a.area, a.price);
                        if (val === currentVal) return null;
                        const s = med.currentPrice - a.price;
                        return <option key={val} value={val}>{a.name} — ₹{a.price}{s >= MARGINAL ? ` (save ₹${s})` : ''}</option>;
                      })}
                    </optgroup>
                  ))}
                </select>
              )}
              {!isNotFound && altsReady && !hasAlts && <div className="text-xs text-slate-400 italic">Only option available</div>}
              {!isNotFound && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-display w-8">Days:</label>
                    <input type="number" min={1} max={365} placeholder="days" value={daysInput[med.id] ?? ''}
                      onChange={e => setDaysInput(prev => ({ ...prev, [med.id]: e.target.value }))}
                      className="w-20 input-field text-sm py-1.5 text-center" />
                    <button onClick={() => handleDaysUpdate(med.id)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-600 text-xs font-display font-semibold transition-colors">
                      <RefreshCw className="w-3 h-3" />{hasFpd ? 'Auto' : 'Set'}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 font-display">Qty:</label>
                      <input type="number" min={1} max={999} value={med.quantity}
                        onChange={e => handleQtyChange(med.id, parseInt(e.target.value) || 1)}
                        className="w-16 input-field text-sm py-1.5 text-center" />
                    </div>
                    <div className="flex-1 text-right">
                      <span className="text-xs text-slate-400">Total: </span>
                      <span className="font-display font-bold text-slate-800">₹{med.rowTotal}</span>
                    </div>
                  </div>
                </div>
              )}
              {isNotFound && <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">Not in our catalog. Please ask your pharmacist.</div>}
            </div>
          );
        })}
        <div className="bg-purple-50 px-4 py-3 flex items-center justify-between border-t-2 border-purple-100">
          <div>
            <span className="font-display font-bold text-slate-700 text-sm">Grand Total</span>
            {totalSaving > 0 && <span className="ml-2 text-xs text-teal-600">saving ₹{totalSaving.toFixed(0)}</span>}
          </div>
          <span className="font-display font-bold text-purple-700 text-base">₹{grandTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Add Medicine */}
      <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-display font-semibold text-slate-600">Add another medicine</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input-field text-sm flex-1 min-w-[170px]" value={addPharmacyId}
            onChange={e => { setAddPharmacyId(e.target.value); setAddMedName(''); }}
            disabled={pharmGroupsLoading}>
            <option value="">{pharmGroupsLoading ? 'Loading…' : 'Select pharmacy…'}</option>
            {pharmacyGroups.map(g => <option key={g.pharmacy_id} value={g.pharmacy_id}>{g.pharmacy_name} — {g.area}</option>)}
          </select>
          <select className="input-field text-sm flex-1 min-w-[170px]" value={addMedName}
            onChange={e => setAddMedName(e.target.value)} disabled={!addPharmacyId}>
            <option value="">{addPharmacyId ? 'Select medicine…' : 'Select pharmacy first'}</option>
            {selPharmMeds
              .filter(m => !medicines.some(ex => ex.name === m.name && (ex as any).pharmacy_id === addPharmacyId))
              .map(m => <option key={m.name} value={m.name}>{m.name} — ₹{m.price}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <label className="text-xs text-slate-500 font-display whitespace-nowrap">Qty:</label>
            <input type="number" min={1} max={999} value={addQty}
              onChange={e => setAddQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 input-field text-sm py-2 text-center" />
          </div>
          <button onClick={handleAddMedicine} disabled={!addMedName || !addPharmacyId || addLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white font-display font-semibold text-sm rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-all whitespace-nowrap">
            {addLoading ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Medicine
          </button>
        </div>
      </div>
    </div>
  );
}
