import React, { useState } from 'react';
import { Stethoscope, Plus, Loader } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../lib/toast-context';

interface Props { onAdded: () => void; }

type VisitType = 'one_time' | 'subscription';

export default function AddDoctorVisitCard({ onAdded }: Props) {
  const [vt, setVt]             = useState<VisitType>('one_time');
  const [doctorName, setDoctor] = useState('');
  const [subType, setSubType]   = useState('Follow-up');
  const [amount, setAmount]     = useState('');
  const [visitDate, setDate]    = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes]       = useState('');
  // Subscription fields
  const [planName, setPlan]     = useState('');
  const [totalAmt, setTotal]    = useState('');
  const [months, setMonths]     = useState('3');
  const [startMonth, setStart]  = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading]   = useState(false);
  const { showToast }           = useToast();

  const perMonth = totalAmt && months
    ? Math.round(parseFloat(totalAmt) / parseInt(months))
    : 0;

  const handleSubmit = async () => {
    if (!doctorName.trim()) {
      showToast({ type: 'warning', title: 'Enter doctor name' }); return;
    }
    if (vt === 'one_time' && !amount) {
      showToast({ type: 'warning', title: 'Enter amount' }); return;
    }
    if (vt === 'subscription' && (!totalAmt || !months)) {
      showToast({ type: 'warning', title: 'Enter total amount and months' }); return;
    }

    setLoading(true);
    try {
      const body = vt === 'one_time'
        ? { visit_type: 'one_time', doctor_name: doctorName, visit_sub_type: subType,
            amount: parseFloat(amount), visit_date: visitDate, notes }
        : { visit_type: 'subscription', doctor_name: doctorName, plan_name: planName,
            total_amount: parseFloat(totalAmt), months: parseInt(months),
            start_month: startMonth, notes };

      await api.post('/spending/doctor-visit', body);
      showToast({ type: 'success', title: 'Visit saved!' });
      // Reset
      setDoctor(''); setAmount(''); setNotes(''); setPlan('');
      setTotal(''); setMonths('3');
      onAdded();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Failed to save', message: err.response?.data?.detail });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
          <Stethoscope className="w-4 h-4 text-blue-600" />
        </div>
        <h3 className="font-display font-semibold text-slate-800">Add Doctor Visit</h3>
      </div>

      {/* Visit type toggle */}
      <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl mb-5">
        {(['one_time', 'subscription'] as VisitType[]).map(t => (
          <button key={t} onClick={() => setVt(t)}
            className={`py-2 rounded-lg text-xs font-display font-semibold transition-all ${
              vt === t ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t === 'one_time' ? '🏥 One-time Visit' : '📅 Subscription Plan'}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-display font-semibold text-slate-600 mb-1 block">Doctor Name</label>
          <input className="input-field text-sm" placeholder="Dr. Meena Krishnamurthy"
            value={doctorName} onChange={e => setDoctor(e.target.value)} />
        </div>

        {vt === 'one_time' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-display font-semibold text-slate-600 mb-1 block">Visit Type</label>
                <select className="input-field text-sm" value={subType} onChange={e => setSubType(e.target.value)}>
                  {['New Consultation','Follow-up','Emergency','Online / Telemedicine'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-display font-semibold text-slate-600 mb-1 block">Amount (₹)</label>
                <input className="input-field text-sm" type="number" min="0" placeholder="500"
                  value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-display font-semibold text-slate-600 mb-1 block">Visit Date</label>
              <input className="input-field text-sm" type="date"
                value={visitDate} onChange={e => setDate(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs font-display font-semibold text-slate-600 mb-1 block">Plan Name</label>
              <input className="input-field text-sm" placeholder="Diabetes Management Plan"
                value={planName} onChange={e => setPlan(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-display font-semibold text-slate-600 mb-1 block">Total Amount (₹)</label>
                <input className="input-field text-sm" type="number" min="0" placeholder="1500"
                  value={totalAmt} onChange={e => setTotal(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-display font-semibold text-slate-600 mb-1 block">Duration (months)</label>
                <input className="input-field text-sm" type="number" min="1" max="24" placeholder="3"
                  value={months} onChange={e => setMonths(e.target.value)} />
              </div>
            </div>
            {perMonth > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-display font-semibold">
                = ₹{perMonth}/month for {months} months
              </div>
            )}
            <div>
              <label className="text-xs font-display font-semibold text-slate-600 mb-1 block">Start Month</label>
              <input className="input-field text-sm" type="month"
                value={startMonth} onChange={e => setStart(e.target.value)} />
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-display font-semibold text-slate-600 mb-1 block">Notes (optional)</label>
          <input className="input-field text-sm" placeholder="e.g. Quarterly diabetes checkup"
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <button onClick={handleSubmit} disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
          {loading
            ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</>
            : <><Plus className="w-4 h-4" />Add Visit</>}
        </button>
      </div>
    </div>
  );
}
