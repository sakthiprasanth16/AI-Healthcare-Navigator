import React, { useState, useEffect } from 'react';
import { Clock, FlaskConical, Download, CheckCircle, Search } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import api from '../lib/api';
import jsPDF from 'jspdf';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import LocationPicker from '../components/dashboard/LocationPicker';
import TestSelector from '../components/dashboard/TestSelector';
import RecommendedLabCard from '../components/lab/RecommendedLabCard';
import LabResultsTable from '../components/lab/LabResultsTable';
import { LabCardSkeleton, TableSkeleton } from '../components/ui/Skeleton';
import { LocationData, SearchResponse, LabResult, TestType, LabTestPrice } from '../types';

const PATIENT_TYPE_ICONS: Record<string, string> = {
  'Type 2 Diabetes': '🩸', 'Hypertension': '❤️', 'Asthma': '🫁',
  'Hypothyroidism': '🦋', 'High Cholesterol': '🫀', 'General Health Checkup': '✅',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [location, setLocation] = useState<LocationData | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const [selectedLab, setSelectedLab] = useState<LabResult | null>(null);
  const [selectedTests, setSelectedTests] = useState<TestType[]>([]);

  // ── Restore session memory on mount ──────────────────────────────────────
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('lab_last_search');
      if (saved) {
        const parsed = JSON.parse(saved);
        setSearchResult(parsed.searchResult);
        setSelectedLabId(parsed.selectedLabId ?? null);
        setSelectedLab(parsed.selectedLab ?? null);
        setSelectedTests(parsed.selectedTests ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  // ── Save to session memory ────────────────────────────────────────────────
  useEffect(() => {
    if (!searchResult) return;
    try {
      sessionStorage.setItem('lab_last_search', JSON.stringify({
        searchResult, selectedLabId, selectedLab, selectedTests,
      }));
    } catch { /* ignore */ }
  }, [searchResult, selectedLabId, selectedLab, selectedTests]);

  useEffect(() => {
    api.get('/location/saved').then(res => { if (res.data) setLocation(res.data); }).catch(() => {});
  }, []);

  const handleSearch = async (tests: TestType[]) => {
    if (!location) { showToast({ type: 'warning', title: 'No location set' }); return; }
    setLoading(true);
    setSearchResult(null);
    setSelectedLabId(null);
    setSelectedLab(null);
    setSelectedTests(tests);
    sessionStorage.removeItem('lab_last_search');
    try {
      const res = await api.post('/labs/search', {
        latitude: location.latitude,
        longitude: location.longitude,
        test_types: tests,
      });
      setSearchResult(res.data);
      showToast({ type: 'success', title: 'Analysis complete!', message: `Found ${res.data.top_labs.length} labs` });
      setTimeout(() => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Search failed', message: err.response?.data?.detail || 'No labs found for selected tests' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLab = async (lab: LabResult) => {
    if (!searchResult) return;
    try {
      await api.post('/labs/select', {
        lab_id: lab.lab_id,
        lab_name: lab.name,
        test_types: searchResult.test_types,
        price: lab.total_cost ?? lab.price,
      });
      setSelectedLabId(lab.lab_id);
      setSelectedLab(lab);
      showToast({ type: 'success', title: 'Lab selected!', message: `${lab.name} saved` });
    } catch {
      showToast({ type: 'error', title: 'Could not save selection' });
    }
  };

  // ── PDF generation (jsPDF) ────────────────────────────────────────────────
  const handleDownloadPlan = async () => {
    if (!selectedLab || !searchResult) return;
    try {
      const testPrices: LabTestPrice[] = selectedLab.test_prices ?? [
        { test_name: searchResult.test_type ?? selectedTests[0], price: selectedLab.price }
      ];
      const res = await api.post('/labs/test-plan', {
        lab_id: selectedLab.lab_id,
        lab_name: selectedLab.name,
        lab_area: selectedLab.area,
        lab_address: selectedLab.address,
        test_types: searchResult.test_types ?? selectedTests,
        test_prices: testPrices,
        total_cost: selectedLab.total_cost ?? selectedLab.price,
      });
      const plan = res.data;
      generatePDF(plan);
      showToast({ type: 'success', title: 'Lab Test Plan PDF downloaded!' });
    } catch {
      showToast({ type: 'error', title: 'Download failed' });
    }
  };

  const generatePDF = (plan: any) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentW = pageW - margin * 2;

    // ── Header bar ────────────────────────────────────────────────────────
    doc.setFillColor(109, 40, 217); // violet-700
    doc.rect(0, 0, pageW, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('MedNav Lab Test Plan', margin, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('AI Healthcare Cost Navigator', margin, 22);
    doc.text(`Generated: ${plan.generated_on}`, pageW - margin, 22, { align: 'right' });

    // ── Patient & Lab info grid ───────────────────────────────────────────
    let y = 42;
    doc.setTextColor(15, 23, 42);

    const drawInfoCard = (label: string, value: string, x: number, cardY: number, w: number) => {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, cardY, w, 16, 2, 2, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(label.toUpperCase(), x + 4, cardY + 6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(value, x + 4, cardY + 13);
    };

    const half = (contentW - 4) / 2;
    drawInfoCard('Patient', plan.patient_name, margin, y, half);
    drawInfoCard('Health Profile', plan.patient_type, margin + half + 4, y, half);
    y += 20;
    drawInfoCard('Selected Lab', plan.lab_name, margin, y, half);
    drawInfoCard('Area', plan.lab_area, margin + half + 4, y, half);
    y += 20;
    drawInfoCard('Address', plan.lab_address, margin, y, contentW);
    y += 22;

    // ── Tests table header ────────────────────────────────────────────────
    doc.setFillColor(245, 243, 255); // violet-50
    doc.rect(margin, y, contentW, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(109, 40, 217);
    doc.text('TEST NAME', margin + 4, y + 6);
    doc.text('PRICE', pageW - margin - 4, y + 6, { align: 'right' });
    y += 9;

    // ── Test rows ─────────────────────────────────────────────────────────
    plan.test_rows.forEach((t: any, i: number) => {
      if (i % 2 === 0) {
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(250, 250, 255);
      }
      doc.rect(margin, y, contentW, 10, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 50);
      doc.text(t.test_name, margin + 4, y + 7);
      doc.setFont('helvetica', 'bold');
      doc.text(`Rs. ${t.price}`, pageW - margin - 4, y + 7, { align: 'right' });
      y += 10;
    });

    // ── Total row ─────────────────────────────────────────────────────────
    doc.setFillColor(109, 40, 217);
    doc.rect(margin, y, contentW, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('Total Cost', margin + 4, y + 8.5);
    doc.text(`Rs. ${plan.total_cost}`, pageW - margin - 4, y + 8.5, { align: 'right' });
    y += 18;

    // ── Note box ──────────────────────────────────────────────────────────
    doc.setFillColor(254, 249, 195); // yellow-100
    doc.roundedRect(margin, y, contentW, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 53, 15);
    const noteLines = doc.splitTextToSize(`Note: ${plan.note}`, contentW - 8);
    doc.text(noteLines, margin + 4, y + 7);
    y += 22;

    // ── Footer ────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated by MedNav · AI Healthcare Cost Navigator', pageW / 2, y + 6, { align: 'center' });

    doc.save(`MedNav_Lab_Test_Plan_${plan.lab_name.replace(/\s+/g, '_')}.pdf`);
  };

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const lastLogin = user?.last_login
    ? new Date(user.last_login).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
    : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/20 to-slate-100">
      <DashboardHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Welcome */}
        <div className="mb-8 animate-fade-in">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display font-bold text-3xl text-slate-800">
                {greeting}, {user?.name?.split(' ')[0]}! 👋
              </h1>
              <p className="text-slate-500 mt-1">Find the most affordable lab for your tests</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {user?.patient_type && (
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
                  <div>
                    <div className="text-xs text-slate-400 font-display">Health Profile</div>
                    <div className="text-sm font-semibold text-slate-700 font-display">{user.patient_type}</div>
                  </div>
                </div>
              )}
              {lastLogin && (
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <div>
                    <div className="text-xs text-slate-400 font-display">Last login</div>
                    <div className="text-sm font-semibold text-slate-700 font-display">{lastLogin}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Location + Test picker */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <LocationPicker location={location} onLocationSet={setLocation} />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <TestSelector onSearch={handleSearch} loading={loading} hasLocation={!!location} />
          </div>
        </div>

        {/* ── Loading — simple searching indicator ── */}
        {loading && (
          <div className="space-y-6 animate-fade-in" id="results-section">
            <div className="card p-8 flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-14 h-14 bg-violet-100 rounded-2xl flex items-center justify-center">
                <Search className="w-7 h-7 text-violet-500 animate-pulse" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-slate-800 text-lg">Searching nearby labs…</h3>
                <p className="text-sm text-slate-400 mt-1">Finding the best options for you</p>
              </div>
              {/* Animated dots */}
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i}
                    className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
            <LabCardSkeleton />
            <TableSkeleton />
          </div>
        )}

        {/* ── Results ── */}
        {searchResult && !loading && (
          <div id="results-section" className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-full px-4 py-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-display font-semibold text-violet-700">
                  {searchResult.top_labs.length} labs found
                </span>
              </div>
              {searchResult.is_multi_test && searchResult.test_types && (
                <span className="text-xs text-slate-400 font-display hidden sm:inline">
                  {searchResult.test_types.length} tests · multi-test search
                </span>
              )}
            </div>

            {selectedLab && (
              <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-5 py-3 animate-fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-violet-600" />
                  <span className="font-display font-semibold text-violet-800 text-sm">
                    {selectedLab.name} selected
                  </span>
                </div>
                <button
                  onClick={handleDownloadPlan}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-display font-semibold text-sm px-4 py-2 rounded-lg transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download Lab Test Plan PDF
                </button>
              </div>
            )}

            <div className="animate-slide-up">
              <RecommendedLabCard
                lab={searchResult.recommended_lab}
                reason={searchResult.recommendation_reason}
                testType={searchResult.is_multi_test
                  ? `${searchResult.test_types?.length} Tests`
                  : (searchResult.test_type ?? '')}
                isMultiTest={searchResult.is_multi_test}
                onSelect={handleSelectLab}
                selected={selectedLabId === searchResult.recommended_lab.lab_id}
              />
            </div>

            <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
              <LabResultsTable
                labs={searchResult.top_labs}
                onSelect={handleSelectLab}
                selectedLabId={selectedLabId}
                isMultiTest={searchResult.is_multi_test}
                testTypes={searchResult.test_types ?? []}
              />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !searchResult && (
          <div className="card p-12 text-center animate-fade-in">
            <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FlaskConical className="w-8 h-8 text-violet-500" />
            </div>
            <h3 className="font-display font-bold text-xl text-slate-700 mb-2">Ready to find labs</h3>
            <p className="text-slate-400 max-w-sm mx-auto">Set your location and select one or more tests to find the best lab for you.</p>
          </div>
        )}
      </div>
    </div>
  );
}
