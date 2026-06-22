import React, { useState } from 'react';
import { Stethoscope, ChevronDown, LogOut, Home } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useNavigate, useLocation } from 'react-router-dom';

export default function DashboardHeader() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const location         = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  const isHome = location.pathname === '/';

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">

        {/* Logo */}
        <button onClick={() => navigate('/')} className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-violet-700 rounded-xl flex items-center justify-center shadow-md">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-display font-bold text-slate-800 text-lg">MedNav</span>
            <span className="text-violet-600 font-display text-xs ml-1.5 font-medium">Chennai</span>
          </div>
        </button>

        {/* Nav — Home only. Module navigation happens via Home page cards, not top nav tabs. */}
        <nav className="hidden md:flex items-center gap-1">
          <button
            onClick={() => navigate('/')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-display font-semibold transition-colors ${
              isHome
                ? 'bg-violet-50 text-violet-700'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Home className="w-4 h-4" />Home
          </button>
        </nav>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-violet-400 to-violet-600 rounded-lg flex items-center justify-center text-white font-display font-bold text-sm">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-semibold text-slate-800 font-display leading-none">{user?.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">@{user?.username}</div>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 card shadow-lg py-1 animate-fade-in z-50">
              <div className="px-3 py-2 border-b border-slate-100">
                <div className="text-xs text-slate-400">Signed in as</div>
                <div className="text-sm font-semibold text-slate-800 font-display">@{user?.username}</div>
                <div className="text-xs text-slate-400 mt-0.5">{user?.patient_type}</div>
              </div>
              {/* Mobile: Home link inside menu */}
              <div className="md:hidden border-b border-slate-100 py-1">
                <button
                  onClick={() => { navigate('/'); setMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    isHome ? 'text-violet-700 bg-violet-50' : 'text-slate-600 hover:bg-slate-50'
                  }`}>
                  <Home className="w-4 h-4" />Home
                </button>
              </div>
              <button onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                <LogOut className="w-4 h-4" />Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
