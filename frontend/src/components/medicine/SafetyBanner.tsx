import React from 'react';
import { ShieldAlert } from 'lucide-react';

export default function SafetyBanner() {
  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
      <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-amber-800 leading-relaxed">
        <span className="font-display font-semibold">Important: </span>
        Alternative medicines are shown for <strong>cost awareness purposes only</strong>.
        Please <strong>consult your doctor or pharmacist</strong> before changing any prescribed medication.
      </p>
    </div>
  );
}
