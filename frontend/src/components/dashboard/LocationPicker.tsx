import React, { useState } from 'react';
import { MapPin, Navigation, Hash, CheckCircle, Loader } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../lib/toast-context';
import { LocationData } from '../../types';

interface Props {
  location: LocationData | null;
  onLocationSet: (loc: LocationData) => void;
}

type Mode = 'saved' | 'gps' | 'coords' | 'link';

export default function LocationPicker({ location, onLocationSet }: Props) {
  const [mode, setMode] = useState<Mode>('saved');
  const [mapsUrl, setMapsUrl] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  // ─── GPS ────────────────────────────────────────────────────────────────────
  const handleGPS = () => {
    if (!navigator.geolocation) {
      showToast({ type: 'error', title: 'GPS unavailable' });
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc: LocationData = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          label: 'Current Location',
        };
        try { await api.post('/location/save', loc); } catch {}
        onLocationSet(loc);
        setLoading(false);
        showToast({ type: 'success', title: 'Location set!', message: `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}` });
      },
      (err) => {
        setLoading(false);
        showToast({ type: 'error', title: 'Could not get location', message: err.message });
      }
    );
  };

  // ─── Manual Coordinates ─────────────────────────────────────────────────────
  const handleManualCoords = async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      showToast({ type: 'error', title: 'Invalid coordinates', message: 'Enter valid numbers for latitude and longitude' });
      return;
    }
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      showToast({ type: 'error', title: 'Out of range', message: 'Latitude: -90 to 90, Longitude: -180 to 180' });
      return;
    }
    setLoading(true);
    const loc: LocationData = { latitude: latNum, longitude: lngNum, label: 'Manual Location' };
    try {
      await api.post('/location/save', loc);
      onLocationSet(loc);
      setLat(''); setLng('');
      showToast({ type: 'success', title: 'Location set!', message: `${latNum.toFixed(5)}, ${lngNum.toFixed(5)}` });
    } catch {
      showToast({ type: 'error', title: 'Failed to save location' });
    } finally {
      setLoading(false);
    }
  };

  // ─── Google Maps Short Link — browser-side fetch ─────────────────────────────
  const extractCoordsFromText = (text: string): [number, number] | null => {
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
      /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /\/place\/[^/]+\/@(-?\d+\.\d+),(-?\d+\.\d+)/,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return [parseFloat(m[1]), parseFloat(m[2])];
    }
    return null;
  };

  const handleMapsLink = async () => {
    const url = mapsUrl.trim();
    if (!url) return;
    setLoading(true);

    try {
      // Step 1: Try extracting directly from the pasted URL (works for full URLs)
      const direct = extractCoordsFromText(url);
      if (direct) {
        const [latV, lngV] = direct;
        const loc: LocationData = { latitude: latV, longitude: lngV, label: 'Google Maps Location' };
        await api.post('/location/save', loc);
        onLocationSet(loc);
        setMapsUrl('');
        showToast({ type: 'success', title: 'Location set!', message: `${latV.toFixed(5)}, ${lngV.toFixed(5)}` });
        setLoading(false);
        return;
      }

      // Step 2: For short links — browser fetch follows the redirect automatically
      // We use a CORS proxy so we can READ the final redirected URL & page content
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      let finalUrl = '';
      let pageText = '';

      try {
        const resp = await fetch(proxyUrl);
        finalUrl = resp.url; // browser gives us the final URL after all redirects
        pageText = await resp.text();
      } catch {
        // corsproxy.io failed, try allorigins
        try {
          const resp2 = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
          const data = await resp2.json();
          finalUrl = data?.status?.url || '';
          pageText = data?.contents || '';
        } catch {
          finalUrl = '';
          pageText = '';
        }
      }

      // Step 3: Try extracting from the final redirected URL
      if (finalUrl) {
        const fromUrl = extractCoordsFromText(finalUrl);
        if (fromUrl) {
          const [latV, lngV] = fromUrl;
          const loc: LocationData = { latitude: latV, longitude: lngV, label: 'Google Maps Location' };
          await api.post('/location/save', loc);
          onLocationSet(loc);
          setMapsUrl('');
          showToast({ type: 'success', title: 'Location set!', message: `${latV.toFixed(5)}, ${lngV.toFixed(5)}` });
          setLoading(false);
          return;
        }
      }

      // Step 4: Try extracting from page HTML content
      if (pageText) {
        const fromPage = extractCoordsFromText(pageText);
        if (fromPage) {
          const [latV, lngV] = fromPage;
          const loc: LocationData = { latitude: latV, longitude: lngV, label: 'Google Maps Location' };
          await api.post('/location/save', loc);
          onLocationSet(loc);
          setMapsUrl('');
          showToast({ type: 'success', title: 'Location set!', message: `${latV.toFixed(5)}, ${lngV.toFixed(5)}` });
          setLoading(false);
          return;
        }
      }

      // Step 5: All failed — guide user to use coordinates tab instead
      showToast({
        type: 'warning',
        title: 'Could not extract location',
        message: 'Switch to "Coordinates" tab and paste the lat/lng from Google Maps instead.',
      });

    } catch (err: any) {
      showToast({ type: 'error', title: 'Failed to parse link', message: 'Use the Coordinates tab instead.' });
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { key: 'saved' as Mode, icon: '📍', label: 'Saved' },
    { key: 'gps' as Mode, icon: '🛰️', label: 'GPS' },
    { key: 'coords' as Mode, icon: '🔢', label: 'Coordinates' },
    { key: 'link' as Mode, icon: '🔗', label: 'Maps Link' },
  ];

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
          <MapPin className="w-4 h-4 text-teal-600" />
        </div>
        <h3 className="font-display font-semibold text-slate-800">Your Location</h3>
        {location && (
          <span className="badge badge-teal ml-auto">
            <CheckCircle className="w-3 h-3" /> Set
          </span>
        )}
      </div>

      {/* Current location display */}
      {location && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-teal-600 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-teal-800 font-display">{location.label || 'Saved Location'}</div>
            <div className="text-xs text-teal-600 font-mono">
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            </div>
          </div>
        </div>
      )}

      {/* Mode tabs */}
      <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl mb-4">
        {tabs.map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-lg text-xs font-semibold font-display transition-all ${
              mode === key ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>{icon}</span>
            <span className="text-[10px]">{label}</span>
          </button>
        ))}
      </div>

      {/* ── SAVED ── */}
      {mode === 'saved' && (
        <div className="text-sm text-slate-500 text-center py-4">
          {location
            ? 'Using your last saved location. Switch tabs to update it.'
            : 'No saved location yet. Use GPS or enter coordinates.'}
        </div>
      )}

      {/* ── GPS ── */}
      {mode === 'gps' && (
        <button
          onClick={handleGPS}
          disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
          {loading ? 'Getting location...' : 'Use Current Location'}
        </button>
      )}

      {/* ── COORDINATES ── */}
      {mode === 'coords' && (
        <div className="space-y-3">
          {/* How to get coords from Google Maps */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 leading-relaxed">
            <p className="font-semibold mb-1">📋 How to get coordinates from Google Maps:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open <strong>Google Maps</strong> on your phone or PC</li>
              <li>Long press (hold) on your location on the map</li>
              <li>Coordinates appear at the top — e.g. <span className="font-mono bg-blue-100 px-1 rounded">13.04183, 80.23412</span></li>
              <li>Tap them to copy, then paste below</li>
            </ol>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-600 font-display mb-1 block">Latitude</label>
              <input
                className="input-field text-sm"
                placeholder="e.g. 13.04183"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 font-display mb-1 block">Longitude</label>
              <input
                className="input-field text-sm"
                placeholder="e.g. 80.23412"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={handleManualCoords}
            disabled={loading || !lat || !lng}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />}
            {loading ? 'Saving...' : 'Set This Location'}
          </button>
        </div>
      )}

      {/* ── MAPS LINK ── */}
      {mode === 'link' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 leading-relaxed">
            <p className="font-semibold mb-1">🔗 Paste any Google Maps link:</p>
            <p>Works best with full URLs. For short links like <span className="font-mono">maps.app.goo.gl/...</span> the app will try to expand it automatically.</p>
            <p className="mt-1.5 font-semibold text-amber-600">💡 Tip: If this doesn't work, use the <strong>Coordinates</strong> tab instead — it's more reliable!</p>
          </div>

          <input
            className="input-field text-sm"
            placeholder="Paste Google Maps link here…"
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
          />

          <button
            onClick={handleMapsLink}
            disabled={loading || !mapsUrl}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <span>🔗</span>}
            {loading ? 'Extracting location...' : 'Extract Location'}
          </button>
        </div>
      )}
    </div>
  );
}
