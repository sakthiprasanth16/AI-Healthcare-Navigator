import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, Pill, ChevronRight, BarChart3 } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import DashboardHeader from '../components/dashboard/DashboardHeader';

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/20 to-slate-100">
      <DashboardHeader />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">

        {/* Welcome */}
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="font-display font-bold text-4xl text-slate-800 mb-3">
            Welcome back, {user?.name?.split(' ')[0]}!
          </h1>
          <p className="text-slate-500 text-lg">What would you like to do today?</p>
        </div>

        {/* Module cards — all 3 in one row */}
        <div className="grid md:grid-cols-3 gap-6 animate-slide-up">

          {/* Lab Cost Navigator */}
          <button
            onClick={() => navigate('/dashboard')}
            className="group card p-8 text-left hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 border-2 border-transparent hover:border-violet-200"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-violet-700 rounded-2xl flex items-center justify-center mb-5 shadow-md group-hover:shadow-lg transition-shadow">
              <FlaskConical className="w-7 h-7 text-white" />
            </div>
            <h2 className="font-display font-bold text-2xl text-slate-800 mb-2">Lab Cost Navigator</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-5">
              Find the most affordable diagnostic labs near you. Compare prices for HbA1c, CBC, Lipid Profile, and more across 25+ Chennai labs.
            </p>
            <div className="flex flex-wrap gap-2 mb-6">
              {['Nearby Labs', 'Best Match', 'Multi-test', 'Lab Plan PDF'].map(tag => (
                <span key={tag} className="badge badge-teal text-xs">{tag}</span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-violet-600 font-display font-semibold text-sm group-hover:gap-3 transition-all">
              Open Lab Navigator <ChevronRight className="w-4 h-4" />
            </div>
          </button>

          {/* Medicine Cost Optimizer */}
          <button
            onClick={() => navigate('/medicines')}
            className="group card p-8 text-left hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 border-2 border-transparent hover:border-purple-200"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl flex items-center justify-center mb-5 shadow-md group-hover:shadow-lg transition-shadow">
              <Pill className="w-7 h-7 text-white" />
            </div>
            <h2 className="font-display font-bold text-2xl text-slate-800 mb-2">Medicine Cost Optimizer</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-5">
              Discover generic alternatives for your medicines and save money. Upload your prescription or select manually. Always consult your doctor before switching.
            </p>
            <div className="flex flex-wrap gap-2 mb-6">
              {['Generic Alternatives', 'Prescription Upload', 'Savings Calculator', 'Prescription Plan'].map(tag => (
                <span key={tag} className="badge badge-blue text-xs">{tag}</span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-purple-600 font-display font-semibold text-sm group-hover:gap-3 transition-all">
              Open Medicine Optimizer <ChevronRight className="w-4 h-4" />
            </div>
          </button>

          {/* Spending Tracker */}
          <button
            onClick={() => navigate('/spending')}
            className="group card p-8 text-left hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 border-2 border-transparent hover:border-violet-300"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl flex items-center justify-center mb-5 shadow-md group-hover:shadow-lg transition-shadow">
              <BarChart3 className="w-7 h-7 text-white" />
            </div>
            <h2 className="font-display font-bold text-2xl text-slate-800 mb-2">Spending Tracker</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-5">
              Track your monthly healthcare expenses across labs, medicines, and doctor visits. Detect recurring costs and get saving suggestions.
            </p>
            <div className="flex flex-wrap gap-2 mb-6">
              {['Expense History', 'Pattern Detection', 'Saving Suggestions', 'Monthly Report'].map(tag => (
                <span key={tag} className="badge badge-gold text-xs">{tag}</span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-violet-700 font-display font-semibold text-sm group-hover:gap-3 transition-all">
              Open Spending Tracker <ChevronRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
