import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Activity, Eye, EyeOff, Stethoscope } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import { PatientType } from '../types';

const PATIENT_TYPES: PatientType[] = [
  'Type 2 Diabetes',
  'Hypertension',
  'Asthma',
  'Hypothyroidism',
  'High Cholesterol',
  'General Health Checkup',
];

export default function SignupPage() {
  const [form, setForm] = useState({
    name: '',
    age: '',
    username: '',
    password: '',
    patient_type: '' as PatientType | '',
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!form.name || !form.age || !form.username || !form.password || !form.patient_type) {
      showToast({ type: 'warning', title: 'All fields required', message: 'Please fill in every field' });
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/signup', {
        ...form,
        age: parseInt(form.age),
      });
      login(res.data.access_token, res.data.user);
      showToast({ type: 'success', title: `Account created! Welcome, ${res.data.user.name}!` });
      navigate('/login');
    } catch (err: any) {
      showToast({ type: 'error', title: 'Signup failed', message: err.response?.data?.detail || 'Try a different username' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg animate-slide-up">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <span className="text-violet-700 font-display font-bold text-xl">MedNav</span>
        </div>

        <h2 className="font-display font-bold text-3xl text-slate-800 mb-1">Create your account</h2>
        <p className="text-slate-500 mb-8">Start making smarter healthcare decisions today</p>

        <div className="card p-8">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2 font-display">Full Name</label>
              <input
                className="input-field"
                placeholder="Ravi Kumar"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2 font-display">Age</label>
              <input
                className="input-field"
                type="number"
                placeholder="35"
                min="1"
                max="120"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="block text-sm font-semibold text-slate-700 mb-2 font-display">Username</label>
            <input
              className="input-field"
              placeholder="ravikumar"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>

          <div className="mt-5">
            <label className="block text-sm font-semibold text-slate-700 mb-2 font-display">Password</label>
            <div className="relative">
              <input
                className="input-field pr-12"
                type={showPass ? 'text' : 'password'}
                placeholder="Minimum 6 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
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

          <div className="mt-5">
            <label className="block text-sm font-semibold text-slate-700 mb-3 font-display">Health Profile</label>
            <div className="grid grid-cols-2 gap-2">
              {PATIENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm({ ...form, patient_type: type })}
                  className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                    form.patient_type === type
                      ? 'border-violet-500 bg-violet-50 shadow-sm'
                      : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50'
                  }`}
                >
                  <div className={`text-xs font-semibold font-display leading-tight ${
                    form.patient_type === type ? 'text-violet-700' : 'text-slate-700'
                  }`}>{type}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
          >
            {loading && <Activity className="w-4 h-4 animate-spin" />}
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </div>

        <p className="text-center text-slate-500 mt-6 text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-violet-600 font-semibold hover:text-violet-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
