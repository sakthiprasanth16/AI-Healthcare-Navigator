import React, { useState, useEffect, useCallback } from 'react';
import { Pill, Upload, ListChecks, Store, MapPin, Clock, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import api from '../lib/api';
import jsPDF from 'jspdf';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import PrescriptionUploadCard from '../components/medicine/PrescriptionUploadCard';
import ManualMedicineSelector from '../components/medicine/ManualMedicineSelector';
import MedicineTable from '../components/medicine/MedicineTable';
import SavingsSummaryCard from '../components/medicine/SavingsSummaryCard';
import SafetyBanner from '../components/medicine/SafetyBanner';
import LocationPicker from '../components/dashboard/LocationPicker';
import { Medicine, MedicineCostResultAPI } from '../types';

type Tab = 'upload' | 'manual';

interface PharmacyInfo {
  pharmacy_id:       string;
  pharmacy_name:     string;
  area:              string;
  address:           string;
  total_cost?:       number;
  medicines_found?:  number;
  medicines_missing?: string[];
  distance_km?:      number;
  travel_time_min?:  number;
  coordinates?:      number[];
}

// LocationData matches what LocationPicker provides
interface LocationData {
  latitude:  number;
  longitude: number;
  label?:    string;
}

// Shape returned by GET /pharmacy/list (see pharmacy_service.get_all_pharmacies)
interface PharmacyListItem {
  id:           string;
  name:         string;
  area:         string;
  address:      string;
  coordinates?: number[];
}

function convertResult(apiResult: MedicineCostResultAPI) {
  return {
    medicines: apiResult.medicines.map(m => ({
      id: m.id, name: m.name,
      activeIngredient: m.active_ingredient, strength: m.strength,
      currentPrice: m.current_price,
      alternatives: m.alternatives.map(a => ({ name: a.name, price: a.price, isGeneric: false })),
      selectedMedicineName: m.selected_medicine_name,
      selectedPrice:        m.selected_price,
      quantity:  m.quantity,
      rowTotal:  m.row_total,
      saving:    m.saving,
      ...(m.frequency         != null ? { frequency:       m.frequency }         : {}),
      ...(m.frequency_per_day != null ? { frequencyPerDay: m.frequency_per_day } : {}),
      ...(m.duration_days     != null ? { durationDays:    m.duration_days }     : {}),
      // pending_pharmacy = resolved from pharmacies collection, price set by findBestPharmacy
      ...((m as any).status   != null ? { status: (m as any).status === 'pending_pharmacy' ? 'pending_pharmacy' : (m as any).status } : {}),
    })),
    originalCost:  apiResult.original_cost,
    optimizedCost: apiResult.optimized_cost,
    totalSaving:   apiResult.total_saving,
    summary:       apiResult.summary,
  };
}

export default function MedicineCostOptimizer() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab]           = useState<Tab>('manual');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [originalCost, setOriginalCost]   = useState(0);
  const [optimizedCost, setOptimizedCost] = useState(0);
  const [totalSaving, setTotalSaving]     = useState(0);
  const [summary, setSummary]             = useState('');
  const [saving, setSaving]               = useState(false);

  // ── Pharmacy state ────────────────────────────────────────────────────────
  const [pharmacyLoading, setPharmacyLoading]                   = useState(false);
  const [pharmacyResetKey, setPharmacyResetKey]               = useState(0);
  const [storedScores, setStoredScores] = useState<{scores: any[]; perMedicine: any} | null>(null);
  const summaryCalledRef = React.useRef<number>(0); // tracks which pharmacyResetKey summary was called for
  const [recommendedPharmacy, setRecommendedPharmacy]           = useState<PharmacyInfo | null>(null);
  const [pharmacyRecommendation, setPharmacyRecommendation]     = useState('');
  const [pharmacyScores, setPharmacyScores]                     = useState<PharmacyInfo[]>([]);

  // ── Location state ────────────────────────────────────────────────────────
  const [location, setLocation]           = useState<LocationData | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [selectedDistPharmacyId, setSelectedDistPharmacyId] = useState('');
  const [allPharmacies, setAllPharmacies] = useState<PharmacyListItem[]>([]);
  const [distanceResults, setDistanceResults] = useState<{
    pharmacy_id: string; pharmacy_name: string; area: string; address: string;
    distance_km?: number; travel_time_min?: number;
  }[]>([]);

  const hasResults = medicines.length > 0;

  // ── Fetch pharmacy list for the distance-checker dropdown (once on mount) ──
  useEffect(() => {
    api.get('/pharmacy/list')
      .then(res => setAllPharmacies(res.data))
      .catch(() => { /* dropdown just stays empty — non-critical */ });
  }, []);

  // ── Session memory ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('medicine_last_result');
      if (saved) {
        const parsed = JSON.parse(saved);
        setMedicines(parsed.medicines ?? []);
        setOriginalCost(parsed.originalCost ?? 0);
        setOptimizedCost(parsed.optimizedCost ?? 0);
        setTotalSaving(parsed.totalSaving ?? 0);
        setSummary(parsed.summary ?? '');
        setTab(parsed.tab ?? 'manual');
        if (parsed.pharmacyScores)       setPharmacyScores(parsed.pharmacyScores);
        if (parsed.recommendedPharmacy)  setRecommendedPharmacy(parsed.recommendedPharmacy);
        if (parsed.pharmacyRecommendation) setPharmacyRecommendation(parsed.pharmacyRecommendation);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!medicines.length) return;
    try {
      sessionStorage.setItem('medicine_last_result', JSON.stringify({
        medicines, originalCost, optimizedCost, totalSaving, summary, tab,
        pharmacyScores, recommendedPharmacy, pharmacyRecommendation,
      }));
    } catch { /* ignore */ }
  }, [medicines, originalCost, optimizedCost, totalSaving, summary, tab,
      pharmacyScores, recommendedPharmacy, pharmacyRecommendation]);

  // ── Auto-find best pharmacy after getting medicines ───────────────────────
  const findBestPharmacy = useCallback(async (meds: Medicine[]) => {
    const medicineNames = meds
      .filter(m => (m as any).status !== 'not_found')
      .map(m => m.name);
    if (medicineNames.length === 0) return meds;

    setPharmacyLoading(true);
    try {
      // Step 1: best pharmacy data
      const bestRes = await api.post('/pharmacy/best', { medicine_names: medicineNames });
      const data = bestRes.data;

      const scores: PharmacyInfo[] = (data.pharmacy_scores || []).map((ps: any) => ({
        pharmacy_id:       ps.pharmacy_id,
        pharmacy_name:     ps.pharmacy_name,
        area:              ps.area,
        address:           ps.address,
        total_cost:        ps.total_cost,
        medicines_found:   ps.medicines_found,
        medicines_missing: ps.medicines_missing,
        coordinates:       ps.coordinates,
      }));
      setPharmacyScores(scores);

      const best = scores[0];
      if (!best) return meds;

      // Step 2: update each medicine row with best-price pharmacy
      const perMedicine = data.per_medicine || {};
      const updatedMeds = meds.map(med => {
        if ((med as any).status === 'not_found') return med;
        const medData = perMedicine[med.name];
        if (!medData) return med;
        const bestOpt = medData.all_options?.[0];
        if (!bestOpt) return med;

        const newPrice  = bestOpt.price;
        // For pending_pharmacy: currentPrice was 0 (set by workflow)
        // Set currentPrice = pharmacy price (this IS the prescribed price at best pharmacy)
        // saving will be calculated after alternatives fetched in MedicineTable
        return {
          ...med,
          currentPrice:         newPrice,
          selectedMedicineName: med.name,
          selectedPrice:        newPrice,
          rowTotal:             parseFloat((newPrice * med.quantity).toFixed(2)),
          saving:               0,
          status:               'already_best', // MedicineTable will update after alt fetch
          pharmacy_id:          bestOpt.pharmacy_id,
          pharmacy_name:        bestOpt.pharmacy_name,
          pharmacy_area:        bestOpt.area,
          pharmacy_address:     bestOpt.address,
        } as any;
      });

      setRecommendedPharmacy(best);
      setPharmacyResetKey(k => k + 1);  // triggers MedicineTable to re-fetch alternatives

      // Step 3: AI recommendation is called separately after MedicineTable
      // finishes auto-selecting alternatives (triggered by pharmacySummaryKey)
      // Store scores for use in summary generation
      setStoredScores({ scores, perMedicine });

      return updatedMeds;
    } catch (err: any) {
      showToast({ type: 'error', title: 'Pharmacy lookup failed', message: err.response?.data?.detail });
      return meds;
    } finally {
      setPharmacyLoading(false);
    }
  }, [showToast]);

  // ── Handle result from upload/manual ─────────────────────────────────────
  const handleResult = async (raw: MedicineCostResultAPI) => {
    const data = convertResult(raw);
    // Reset pharmacy state
    setRecommendedPharmacy(null);
    setPharmacyRecommendation('');
    setPharmacyScores([]);
    setOriginalCost(data.originalCost);
    setOptimizedCost(data.optimizedCost);
    setTotalSaving(data.totalSaving);
    setSummary(data.summary);

    // Auto-find best pharmacy and update medicines with pharmacy prices
    const updatedMeds = await findBestPharmacy(data.medicines);
    setMedicines(updatedMeds);

    setTimeout(() => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  // ── Auto-calc distance when location is set ───────────────────────────────
  // ── Set location only — user selects pharmacy to calc distance separately ───
  const handleLocationSet = useCallback((loc: LocationData) => {
    setLocation(loc);
    setDistanceResults([]);
    setSelectedDistPharmacyId('');
  }, []);

  // ── Calc distance for one selected pharmacy ───────────────────────────────
  const handleCalcSingleDistance = async () => {
    if (!location || !selectedDistPharmacyId) return;
    setDistanceLoading(true);
    try {
      const res = await api.post('/pharmacy/distances', {
        latitude:     location.latitude,
        longitude:    location.longitude,
        pharmacy_ids: [selectedDistPharmacyId],
      });
      const d = (res.data as any[])[0];
      if (!d) return;
      const pharm = allPharmacies.find(p => p.id === selectedDistPharmacyId);
      const newResult = {
        pharmacy_id:     selectedDistPharmacyId,
        pharmacy_name:   pharm?.name ?? '',
        area:            pharm?.area ?? '',
        address:         pharm?.address ?? '',
        distance_km:     d.distance_km,
        travel_time_min: d.travel_time_min,
      };
      // Replace if exists, otherwise append
      setDistanceResults(prev => {
        const idx = prev.findIndex(r => r.pharmacy_id === selectedDistPharmacyId);
        if (idx >= 0) { const u = [...prev]; u[idx] = newResult; return u; }
        return [...prev, newResult];
      });
      // Update recommended pharmacy banner if it matches
      if (recommendedPharmacy?.pharmacy_id === selectedDistPharmacyId) {
        setRecommendedPharmacy(prev => prev
          ? { ...prev, distance_km: d.distance_km, travel_time_min: d.travel_time_min }
          : prev
        );
      }
      // Update pharmacy scores
      setPharmacyScores(prev => prev.map(ps =>
        ps.pharmacy_id === selectedDistPharmacyId
          ? { ...ps, distance_km: d.distance_km, travel_time_min: d.travel_time_min }
          : ps
      ));
      showToast({ type: 'success', title: `${d.distance_km} km · ${d.travel_time_min} min` });
    } catch {
      showToast({ type: 'error', title: 'Distance calculation failed' });
    } finally {
      setDistanceLoading(false);
    }
  };

  // ── Save report ───────────────────────────────────────────────────────────
  const handleSaveReport = async () => {
    if (!hasResults) return;
    setSaving(true);
    try {
      await api.post('/medicine/report', {
        source: tab === 'upload' ? 'prescription_upload' : 'manual',
        medicines: medicines.map(m => ({
          name: m.name, selected: m.selectedMedicineName,
          price: m.selectedPrice, qty: m.quantity, saving: m.saving,
          pharmacy: (m as any).pharmacy_name ?? '',
        })),
        original_cost:  originalCost,
        optimized_cost: medicines.reduce((s, m) => s + m.rowTotal, 0),
        total_saving:   medicines.reduce((s, m) => s + m.saving, 0),
      });
      showToast({ type: 'success', title: 'Report saved!' });
    } catch { showToast({ type: 'error', title: 'Could not save report' }); }
    finally  { setSaving(false); }
  };

  // ── PDF download ──────────────────────────────────────────────────────────
  const handleDownloadPlan = async () => {
    if (!hasResults || !user) return;
    try {
      const rows = medicines.map(m => ({
        medicine:     m.selectedMedicineName,
        price:        m.selectedPrice,
        qty:          m.quantity,
        total:        m.rowTotal,
        frequency:    (m as any).frequency    ?? '',
        durationDays: (m as any).durationDays ?? null,
        pharmacy:     (m as any).pharmacy_name ?? '',
      }));
      const planRes = await api.post('/medicine/prescription-plan', { rows });
      const plan    = planRes.data;

      const currentOptimized = medicines.reduce((s, m) => s + m.rowTotal, 0);
      const currentSaving    = medicines.reduce((s, m) => s + m.saving, 0);
      const visibleMeds      = medicines.filter(m => (m as any).status !== 'not_found');

      const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const M     = 15; // margin
      const cW    = pageW - M * 2;

      // ── Header ────────────────────────────────────────────────────────────
      doc.setFillColor(109, 40, 217);
      doc.rect(0, 0, pageW, 32, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');   doc.setFontSize(16);
      doc.text('MedNav Prescription Plan', M, 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text('AI Healthcare Cost Navigator', M, 22);
      doc.text(`Generated: ${plan.generated_on}`, pageW - M, 22, { align: 'right' });

      // ── Meta cards ────────────────────────────────────────────────────────
      let y = 40;
      const drawCard = (label: string, value: string, x: number, cy: number, w: number) => {
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, cy, w, 16, 2, 2, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(label.toUpperCase(), x + 4, cy + 6);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(value.length > 30 ? value.slice(0, 28) + '…' : value, x + 4, cy + 13);
      };
      const half = (cW - 4) / 2;
      drawCard('Patient',        user.name,         M,            y, half);
      drawCard('Health Profile', user.patient_type, M + half + 4, y, half);
      y += 20;

      // ── Recommended pharmacy card ─────────────────────────────────────────
      if (recommendedPharmacy) {
        doc.setFillColor(245, 243, 255);
        doc.roundedRect(M, y, cW, 16, 2, 2, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        doc.setTextColor(109, 40, 217);
        doc.text('RECOMMENDED PHARMACY', M + 4, y + 6);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        let pharmText = `${recommendedPharmacy.pharmacy_name}, ${recommendedPharmacy.area}`;
        if (recommendedPharmacy.distance_km != null)
          pharmText += `   |   ${recommendedPharmacy.distance_km} km · ${recommendedPharmacy.travel_time_min} min`;
        doc.text(pharmText, M + 4, y + 13);
        y += 20;
      }

      // ── Table header ──────────────────────────────────────────────────────
      doc.setFillColor(245, 243, 255);
      doc.rect(M, y, cW, 9, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      doc.setTextColor(109, 40, 217);

      // Column positions — carefully calculated to avoid overlap
      // Total width = 180mm (A4 210 - 2×15 margin)
      // Medicine(50) Pharmacy(38) Freq(32) Days(14) Price(16) Qty(10) Total(right-aligned)
      const C = {
        name:   M + 2,
        pharma: M + 52,
        freq:   M + 90,
        days:   M + 122,
        price:  M + 136,
        qty:    M + 152,
        total:  pageW - M - 2,
      };
      doc.text('MEDICINE',  C.name,   y + 6.5);
      doc.text('PHARMACY',  C.pharma, y + 6.5);
      doc.text('FREQUENCY', C.freq,   y + 6.5);
      doc.text('DAYS',      C.days,   y + 6.5);
      doc.text('PRICE',     C.price,  y + 6.5);
      doc.text('QTY',       C.qty,    y + 6.5);
      doc.text('TOTAL',     C.total,  y + 6.5, { align: 'right' });
      y += 9;

      // ── Medicine rows ─────────────────────────────────────────────────────
      visibleMeds.forEach((med, i) => {
        if (i % 2 === 0) doc.setFillColor(255, 255, 255);
        else             doc.setFillColor(250, 250, 255);
        doc.rect(M, y, cW, 10, 'F');

        // Medicine name — max 24 chars to fit in 50mm column
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        const mname = med.selectedMedicineName;
        doc.text(mname.length > 24 ? mname.slice(0, 22) + '…' : mname, C.name, y + 7);

        // Pharmacy name only (no area) — max 18 chars to fit in 38mm column
        const pname = (med as any).pharmacy_name as string ?? '';
        doc.setFontSize(8); doc.setTextColor(100, 116, 139);
        doc.text(pname.length > 18 ? pname.slice(0, 16) + '…' : pname, C.pharma, y + 7);

        // Frequency — max 18 chars for 32mm column
        const freqStr = (med as any).frequency || '—';
        doc.text(freqStr.length > 18 ? freqStr.slice(0, 16) + '…' : freqStr, C.freq, y + 7);

        // Duration days
        const durStr = (med as any).durationDays ? `${(med as any).durationDays}d` : '—';
        doc.text(durStr, C.days, y + 7);

        // Price, Qty, Total
        doc.setFontSize(9); doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'normal');
        doc.text(`Rs.${med.selectedPrice}`, C.price, y + 7);
        doc.text(`${med.quantity}`,          C.qty,   y + 7);
        doc.setFont('helvetica', 'bold');
        doc.text(`Rs.${med.rowTotal.toFixed(2)}`, C.total, y + 7, { align: 'right' });
        y += 10;
      });

      // ── Grand total ───────────────────────────────────────────────────────
      doc.setFillColor(109, 40, 217);
      doc.rect(M, y, cW, 12, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text('Grand Total', M + 4, y + 8.5);
      doc.text(`Rs.${currentOptimized.toFixed(2)}`, pageW - M - 4, y + 8.5, { align: 'right' });
      y += 18;

      // ── Saving ───────────────────────────────────────────────────────────
      if (currentSaving > 0) {
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(M, y, cW, 11, 2, 2, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.setTextColor(22, 163, 74);
        doc.text(`Estimated saving with selected alternatives: Rs.${currentSaving.toFixed(2)}`, M + 4, y + 7.5);
        y += 15;
      }

      // ── Note ─────────────────────────────────────────────────────────────
      doc.setFillColor(254, 249, 195);
      doc.roundedRect(M, y, cW, 16, 2, 2, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.setTextColor(120, 53, 15);
      const noteLines = doc.splitTextToSize(`Note: ${plan.note}`, cW - 8);
      doc.text(noteLines, M + 4, y + 7);
      y += 22;

      // ── Footer ───────────────────────────────────────────────────────────
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Generated by MedNav · AI Healthcare Cost Navigator', pageW / 2, y + 4, { align: 'center' });

      doc.save(`MedNav_Prescription_Plan_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast({ type: 'success', title: 'PDF downloaded!' });
    } catch (err) {
      console.error('PDF error:', err);
      showToast({ type: 'error', title: 'PDF download failed' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/20 to-slate-100">
      <DashboardHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Page header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Pill className="w-5 h-5 text-purple-600" />
                </div>
                <h1 className="font-display font-bold text-3xl text-slate-800">Medicine Cost Optimizer</h1>
              </div>
              <p className="text-slate-500 ml-13">Best pharmacy prices for your prescriptions</p>
            </div>
            {user?.patient_type && (
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
                <div>
                  <div className="text-xs text-slate-400 font-display">Health Profile</div>
                  <div className="text-sm font-semibold text-slate-700 font-display">{user.patient_type}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-6 animate-slide-up"><SafetyBanner /></div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1 bg-slate-200 p-1 rounded-xl mb-6 max-w-sm animate-slide-up">
          {([
            { key: 'manual' as Tab, icon: <ListChecks className="w-4 h-4" />, label: 'Manual Selection' },
            { key: 'upload' as Tab, icon: <Upload    className="w-4 h-4" />, label: 'Upload Prescription' },
          ]).map(({ key, icon, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-display font-semibold transition-all ${
                tab === key ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Input panel */}
        <div className="mb-8">
          {tab === 'manual'
            ? <div className="animate-fade-in"><ManualMedicineSelector patientType={user?.patient_type ?? 'General Health Checkup'} onResult={handleResult} /></div>
            : <div className="animate-fade-in"><PrescriptionUploadCard onResult={handleResult} /></div>
          }
        </div>

        {/* Loading state while finding pharmacy */}
        {pharmacyLoading && (
          <div className="card p-8 flex flex-col items-center gap-4 text-center animate-fade-in mb-6">
            <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center">
              <Store className="w-7 h-7 text-purple-500 animate-pulse" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-slate-800">Finding best pharmacy prices…</h3>
              <p className="text-sm text-slate-400 mt-1">Comparing prices across 5 pharmacies</p>
            </div>
          </div>
        )}

        {/* Results */}
        {hasResults && !pharmacyLoading && (
          <div id="results-section" className="space-y-6 animate-slide-up">

            {/* AI recommendation banner */}
            {pharmacyRecommendation && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3">
                <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-display font-bold text-purple-700 uppercase tracking-wide mb-1">Recommended Pharmacy</div>
                  <p className="text-slate-600 text-sm leading-relaxed">{pharmacyRecommendation}</p>
                </div>
              </div>
            )}

            <div className="inline-flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-full px-4 py-1.5">
              <span className="text-purple-500 text-xs">✓</span>
              <span className="text-xs font-display font-semibold text-purple-700">
                {medicines.length} medicine{medicines.length > 1 ? 's' : ''} analysed
                {recommendedPharmacy ? ` · Best pharmacy: ${recommendedPharmacy.pharmacy_name}` : ''}
              </span>
            </div>

            <MedicineTable
              medicines={medicines}
              onChange={setMedicines}
              recommendedPharmacy={recommendedPharmacy}
              pharmacyResetKey={pharmacyResetKey}
            />

            {/* Pharmacy comparison table */}
            {pharmacyScores.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                  <Store className="w-4 h-4 text-purple-600" />
                  <h3 className="font-display font-semibold text-slate-800">Pharmacy Comparison</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {pharmacyScores.map((ps, i) => (
                    <div key={ps.pharmacy_id} className={`flex items-center justify-between px-6 py-3 ${i === 0 ? 'bg-violet-50/50' : ''}`}>
                      <div className="flex items-center gap-3">
                        {i === 0 && <span className="text-xs bg-violet-600 text-white px-2 py-0.5 rounded-full font-display font-bold">Best</span>}
                        <div>
                          <div className="font-display font-semibold text-slate-800 text-sm">{ps.pharmacy_name}</div>
                          <div className="text-xs text-slate-400">{ps.area} · {ps.address}</div>
                          {ps.medicines_missing && ps.medicines_missing.length > 0 && (
                            <div className="text-xs text-amber-600 mt-0.5">Missing: {ps.medicines_missing.join(', ')}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-display font-bold text-slate-700">₹{ps.total_cost?.toFixed(0)}</div>
                        <div className="text-xs text-slate-400">{ps.medicines_found}/{medicines.filter(m => (m as any).status !== 'not_found').length} medicines</div>
                        {ps.distance_km != null && (
                          <div className="text-xs text-violet-600 flex items-center gap-1 justify-end mt-0.5">
                            <MapPin className="w-3 h-3" />{ps.distance_km} km
                            <Clock className="w-3 h-3 ml-1" />{ps.travel_time_min} min
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <SavingsSummaryCard
              medicines={medicines}
              originalCost={originalCost}
              optimizedCost={optimizedCost}
              totalSaving={totalSaving}
              summary={summary}
              onSaveReport={handleSaveReport}
              onDownloadPlan={handleDownloadPlan}
              saving={saving}
            />
          </div>
        )}

        {/* Empty state */}
        {!hasResults && !pharmacyLoading && (
          <div className="card p-12 text-center animate-fade-in">
            <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Pill className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="font-display font-bold text-xl text-slate-700 mb-2">Ready to optimize</h3>
            <p className="text-slate-400 max-w-sm mx-auto">
              Select medicines manually or upload your prescription to find the best pharmacy prices.
            </p>
          </div>
        )}

        {/* ── Distance section — pharmacy dropdown + location ── */}
        {hasResults && (
          <div className="mt-6 card overflow-hidden animate-fade-in">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-violet-600" />
              <h3 className="font-display font-semibold text-slate-800">Distance to Pharmacy</h3>
              {distanceLoading && <div className="ml-2 w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />}
            </div>
            <div className="p-6 space-y-5">
              <p className="text-xs text-slate-400">
                Set your location and select a pharmacy to see distance and travel time.
              </p>

              {/* Location picker */}
              <LocationPicker
                location={location}
                onLocationSet={handleLocationSet}
              />

              {/* Pharmacy selector dropdown */}
              {location && allPharmacies.length > 0 && (
                <div className="space-y-3">
                  <label className="text-sm font-display font-semibold text-slate-700">Select pharmacy to check distance:</label>
                  <div className="flex gap-2">
                    <select
                      className="input-field flex-1 text-sm"
                      value={selectedDistPharmacyId}
                      onChange={e => setSelectedDistPharmacyId(e.target.value)}
                    >
                      <option value="">Select a pharmacy…</option>
                      {allPharmacies.map(p => (
                        <option key={p.id} value={p.id}>{p.name} — {p.area} — {p.address}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleCalcSingleDistance}
                      disabled={!selectedDistPharmacyId || distanceLoading}
                      className="btn-secondary flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                    >
                      {distanceLoading
                        ? <div className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                        : <MapPin className="w-4 h-4" />
                      }
                      Get Distance
                    </button>
                  </div>
                </div>
              )}

              {/* Distance results */}
              {distanceResults.length > 0 && (
                <div className="space-y-2">
                  {distanceResults.map(r => (
                    <div key={r.pharmacy_id} className="flex items-center justify-between bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                      <div>
                        <div className="font-display font-semibold text-slate-800 text-sm">{r.pharmacy_name}</div>
                        <div className="text-xs text-slate-400">{r.area} · {r.address}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {r.distance_km != null
                          ? <>
                              <div className="flex items-center gap-1 text-violet-700 font-display font-bold text-sm justify-end">
                                <MapPin className="w-3.5 h-3.5" />{r.distance_km} km
                              </div>
                              <div className="flex items-center gap-1 text-slate-500 text-xs justify-end mt-0.5">
                                <Clock className="w-3 h-3" />{r.travel_time_min} min
                              </div>
                            </>
                          : <span className="text-xs text-slate-400">Distance unavailable</span>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
