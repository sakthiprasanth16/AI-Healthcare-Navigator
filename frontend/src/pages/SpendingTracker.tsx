import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader, FlaskConical, Pill, Stethoscope } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import api from '../lib/api';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import MonthSelector from '../components/spending/MonthSelector';
import SpendingSummaryCards from '../components/spending/SpendingSummaryCards';
import AddDoctorVisitCard from '../components/spending/AddDoctorVisitCard';
import PatternsList from '../components/spending/PatternsList';
import SuggestionsList from '../components/spending/SuggestionsList';
import SpendingReportDownload from '../components/spending/SpendingReportDownload';

interface MonthOption {
  month: string;
  is_current_month: boolean;
  label: string;
}

interface SummaryData {
  month: string;
  month_label: string;
  is_current_month: boolean;
  lab_items: any[];
  medicine_items: any[];
  doctor_items: any[];
  total_lab: number;
  total_medicine: number;
  total_doctor: number;
  grand_total: number;
  prev_month_total: number | null;
  change_amount: number | null;
  change_pct: number | null;
  patterns: any[];
  suggestions: any[];
  ai_summary: string;
}

export default function SpendingTracker() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [months, setMonths]           = useState<MonthOption[]>([]);
  const [selectedMonth, setSelected]  = useState('');
  const [summary, setSummary]         = useState<SummaryData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [activeTab, setActiveTab]     = useState<'overview' | 'details' | 'add'>('overview');

  useEffect(() => {
    api.get('/spending/months')
      .then(res => {
        setMonths(res.data);
        const cur = res.data.find((m: MonthOption) => m.is_current_month);
        if (cur) setSelected(cur.month);
        else if (res.data.length > 0) setSelected(res.data[0].month);
      })
      .catch(() => showToast({ type: 'error', title: 'Could not load months' }));
  }, []);

  const loadSummary = useCallback(async (month: string) => {
    if (!month) return;
    setLoading(true);
    setSummary(null);
    try {
      const res = await api.get(`/spending/summary?month=${month}`);
      setSummary(res.data);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Could not load summary', message: err.response?.data?.detail });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMonth) loadSummary(selectedMonth);
  }, [selectedMonth]);

  const handleMonthSelect = (m: string) => setSelected(m);

  const handleVisitAdded = () => {
    setActiveTab('overview');
    loadSummary(selectedMonth);
    showToast({ type: 'success', title: 'Visit added! Refreshing data...' });
  };

  const hasData = summary && (
    summary.grand_total > 0 ||
    summary.lab_items.length > 0 ||
    summary.medicine_items.length > 0 ||
    summary.doctor_items.length > 0
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/20 to-slate-100">
      <DashboardHeader />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Page header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-violet-700 rounded-2xl flex items-center justify-center shadow-md">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-3xl text-slate-800">
                Spending Tracker
              </h1>
              <p className="text-slate-500 text-sm mt-0.5">
                Monthly healthcare expense summary
              </p>
            </div>
          </div>
        </div>

        {/* Month selector */}
        {months.length > 0 && (
          <div className="mb-6 animate-slide-up">
            <MonthSelector
              months={months}
              selectedMonth={selectedMonth}
              onSelect={handleMonthSelect}
            />
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="card p-8 text-center animate-fade-in">
            <div className="flex items-center justify-center gap-3 mb-1">
              <Loader className="w-5 h-5 text-violet-600 animate-spin" />
              <span className="font-display font-semibold text-slate-700">
                Loading spending data…
              </span>
            </div>
          </div>
        )}

        {/* Main content */}
        {summary && !loading && (
          <div className="space-y-6 animate-fade-in">

            {/* Summary cards */}
            <SpendingSummaryCards
              totalLab={summary.total_lab}
              totalMedicine={summary.total_medicine}
              totalDoctor={summary.total_doctor}
              grandTotal={summary.grand_total}
              prevMonthTotal={summary.prev_month_total}
              changeAmount={summary.change_amount}
              changePct={summary.change_pct}
              isCurrentMonth={summary.is_current_month}
              monthLabel={summary.month_label}
            />

            {/* Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-200 p-1 rounded-xl max-w-md">
              {(['overview', 'details', 'add'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`py-2 rounded-lg text-xs font-display font-semibold transition-all capitalize ${
                    activeTab === tab
                      ? 'bg-white text-violet-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {tab === 'overview' ? 'Overview' : tab === 'details' ? 'Details' : 'Add Visit'}
                </button>
              ))}
            </div>

            {/* Overview tab */}
            {activeTab === 'overview' && (
              <div className="grid lg:grid-cols-2 gap-6 animate-fade-in">
                <PatternsList patterns={summary.patterns} />
                <SuggestionsList suggestions={summary.suggestions} />
              </div>
            )}

            {/* Details tab */}
            {activeTab === 'details' && (
              <div className="space-y-4 animate-fade-in">
                {summary.medicine_items.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 bg-purple-50/50">
                      <Pill className="w-4 h-4 text-purple-600" />
                      <h3 className="font-display font-semibold text-slate-800 text-sm">
                        Medicines — ₹{summary.total_medicine.toLocaleString('en-IN')}
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {summary.medicine_items.map((item: any, i: number) => (
                        <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="font-display font-semibold text-slate-800 text-sm">
                              {item.medicine_name}
                            </div>
                            {item.selected_medicine !== item.medicine_name && (
                              <div className="text-xs text-green-600">
                                → {item.selected_medicine}
                                {item.saving > 0 && ` (saved ₹${item.saving})`}
                              </div>
                            )}
                            {item.pharmacy_name && (
                              <div className="text-xs text-slate-400">
                                🏪 Bought at {item.pharmacy_name}
                              </div>
                            )}
                          </div>
                          <span className="font-display font-bold text-purple-700">₹{item.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {summary.lab_items.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 bg-violet-50/50">
                      <FlaskConical className="w-4 h-4 text-violet-600" />
                      <h3 className="font-display font-semibold text-slate-800 text-sm">
                        Lab Tests — ₹{summary.total_lab.toLocaleString('en-IN')}
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {summary.lab_items.map((item: any, i: number) => (
                        <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="font-display font-semibold text-slate-800 text-sm">{item.test_name}</div>
                            <div className="text-xs text-slate-400">{item.lab_name} · {item.date}</div>
                          </div>
                          <span className="font-display font-bold text-violet-700">₹{item.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {summary.doctor_items.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 bg-blue-50/50">
                      <Stethoscope className="w-4 h-4 text-blue-600" />
                      <h3 className="font-display font-semibold text-slate-800 text-sm">
                        Doctor Visits — ₹{summary.total_doctor.toLocaleString('en-IN')}
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {summary.doctor_items.map((item: any, i: number) => (
                        <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="font-display font-semibold text-slate-800 text-sm">
                              {item.doctor_name}
                            </div>
                            <div className="text-xs text-slate-400 flex items-center gap-1">
                              {item.is_subscription && (
                                <span className="badge badge-blue text-[10px] px-1.5 py-0.5">Subscription</span>
                              )}
                              {item.plan_name || item.visit_type} · {item.date}
                            </div>
                          </div>
                          <span className="font-display font-bold text-blue-700">₹{item.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!hasData && (
                  <div className="card p-8 text-center">
                    <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="font-display font-semibold text-slate-500 mb-1">No spending data</p>
                    <p className="text-xs text-slate-400">
                      Use Lab Navigator or Medicine Optimizer to build your spending history.
                      Add doctor visits using the "Add Visit" tab.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Add Visit tab */}
            {activeTab === 'add' && (
              <div className="max-w-lg animate-fade-in">
                <AddDoctorVisitCard onAdded={handleVisitAdded} />
              </div>
            )}

            {/* Monthly summary — plain language, no AI/backend mentions */}
            {summary.ai_summary && (
              <div className="card p-5 animate-slide-up">
                <h3 className="text-sm font-display font-semibold text-slate-700 mb-2">
                  Monthly Summary
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">{summary.ai_summary}</p>
              </div>
            )}

            {/* Download report */}
            <SpendingReportDownload
              summaryData={summary}
              disabled={!hasData}
            />
          </div>
        )}

        {/* Empty state — no months at all */}
        {!loading && months.length === 0 && (
          <div className="card p-12 text-center animate-fade-in">
            <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="font-display font-bold text-xl text-slate-700 mb-2">
              No spending history yet
            </h3>
            <p className="text-slate-400 max-w-sm mx-auto text-sm">
              Start by using the Lab Cost Navigator to find and select a lab,
              or use the Medicine Optimizer to save your medicine report.
              Your spending will appear here automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
