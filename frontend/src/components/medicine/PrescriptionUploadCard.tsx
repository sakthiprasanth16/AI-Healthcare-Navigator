import React, { useRef, useState } from 'react';
import { Upload, FileImage, X, Search } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../lib/toast-context';
import { MedicineCostResultAPI } from '../../types';

interface Props { onResult: (result: MedicineCostResultAPI) => void; }

export default function PrescriptionUploadCard({ onResult }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const handleFile = (f: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowed.includes(f.type)) {
      showToast({ type: 'error', title: 'Invalid file type', message: 'Use JPG, PNG, or PDF' });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      showToast({ type: 'error', title: 'File too large', message: 'Max 10MB' });
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/medicine/optimize/prescription', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onResult(res.data);
      showToast({ type: 'success', title: 'Prescription analyzed!' });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Analysis failed',
        message: err.response?.data?.detail || 'Could not extract medicines',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
          <FileImage className="w-4 h-4 text-blue-600" />
        </div>
        <h3 className="font-display font-semibold text-slate-800">Upload Prescription</h3>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          dragging
            ? 'border-purple-400 bg-purple-50'
            : file
            ? 'border-purple-300 bg-purple-50/50'
            : 'border-slate-200 hover:border-purple-300 hover:bg-slate-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileImage className="w-8 h-8 text-purple-500" />
            <div className="text-left">
              <p className="font-display font-semibold text-slate-800 text-sm">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setFile(null); }}
              className="text-slate-400 hover:text-red-500 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-display font-semibold text-slate-600 mb-1">Drop prescription here</p>
            <p className="text-xs text-slate-400">JPG, PNG, PDF · Max 10MB</p>
          </>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        className="btn-primary w-full mt-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Analyzing…
          </>
        ) : (
          <>
            <Search className="w-4 h-4" />
            Find Best Alternative
          </>
        )}
      </button>

      <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        <p className="font-semibold mb-1">💡 For best results:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Use a clear, well-lit photo</li>
          <li>Medicine names must be legible</li>
          <li>Gemini AI extracts medicine names, frequency &amp; duration automatically</li>
        </ul>
      </div>
    </div>
  );
}
