import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Activity, Eye, EyeOff, Stethoscope } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      login(res.data.access_token, res.data.user);
      showToast({ type: 'success', title: `Welcome back, ${res.data.user.name}!` });
      navigate('/');
    } catch (err: any) {
      showToast({ type: 'error', title: 'Login failed', message: err.response?.data?.detail || 'Check your credentials' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-100 flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] bg-gradient-to-br from-violet-700 via-violet-600 to-purple-800 p-12 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-purple-900/40 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-violet-400/10 rounded-full blur-2xl" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-display font-bold text-xl">MedNav</span>
          </div>

          <h1 className="text-white font-display font-bold text-4xl leading-tight mb-6">
            Make smarter<br />
            <span className="text-violet-200">healthcare</span><br />
            decisions
          </h1>
          <p className="text-violet-100/80 text-lg leading-relaxed">
            AI-powered navigator that helps you compare costs, find generic medicines, and manage chronic care expenses — all in one place.
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          {[
            { icon: '🏥', title: 'Lab & Provider Comparison', desc: 'Find the most affordable diagnostic labs near you' },
            { icon: '💊', title: 'Generic Medicine Finder', desc: 'Discover cheaper alternatives for your prescriptions' },
            { icon: '📊', title: 'Chronic Care Optimizer', desc: 'Track and reduce your recurring healthcare costs' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 bg-white/10 rounded-xl px-4 py-3">
              <span className="text-xl mt-0.5">{item.icon}</span>
              <div>
                <div className="text-white font-display font-semibold text-sm">{item.title}</div>
                <div className="text-violet-100/70 text-xs mt-0.5">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="text-violet-700 font-display font-bold text-xl">MedNav</span>
          </div>

          <h2 className="font-display font-bold text-3xl text-slate-800 mb-1">Welcome back</h2>
          <p className="text-slate-500 mb-8">Sign in to your account to continue</p>

          <div className="card p-8">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 font-display">Username</label>
                <input
                  className="input-field"
                  placeholder="Enter your username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit(form.username, form.password)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 font-display">Password</label>
                <div className="relative">
                  <input
                    className="input-field pr-12"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit(form.username, form.password)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                onClick={() => handleSubmit(form.username, form.password)}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? <Activity className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </div>

          <p className="text-center text-slate-500 mt-6 text-sm">
            Don't have an account?{' '}
            <Link to="/signup" className="text-violet-600 font-semibold hover:text-violet-700">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
