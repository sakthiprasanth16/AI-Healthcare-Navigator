export interface User {
  id: string;
  name: string;
  username: string;
  patient_type: string;
  age: number;
  last_login: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  label?: string;
  saved_at?: string;
}

export interface LabTestPrice {
  test_name: string;
  price: number;
}

export interface LabResult {
  lab_id: string;
  name: string;
  area: string;
  address: string;
  price: number;
  total_cost?: number;
  test_prices?: LabTestPrice[];
  rating: number;
  distance_km?: number;
  travel_time_min?: number;
  rank?: number;
  score?: number;
  distance_source?: "ors" | "fallback";  // "ors" = OpenRouteService, "fallback" = haversine estimate
}

export interface SearchResponse {
  recommended_lab: LabResult;
  recommendation_reason: string;
  top_labs: LabResult[];
  test_type?: string;
  test_types?: string[];
  is_multi_test: boolean;
}

export type TestType =
  | 'HbA1c'
  | 'CBC'
  | 'Thyroid Profile'
  | 'Lipid Profile'
  | 'Vitamin D'
  | 'Fasting Blood Sugar'
  | 'Creatinine'
  | 'Liver Function Test'
  | 'Kidney Function Test';

export type PatientType =
  | 'Type 2 Diabetes'
  | 'Hypertension'
  | 'Asthma'
  | 'Hypothyroidism'
  | 'High Cholesterol'
  | 'General Health Checkup';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
}

// ── Medicine Cost Optimizer ────────────────────────────────────────────────────
export interface AlternativeMedicine {
  name: string;
  price: number;
  isGeneric: boolean;
}

export interface Medicine {
  id: string;
  name: string;
  activeIngredient: string;
  strength: string;
  currentPrice: number;
  alternatives: AlternativeMedicine[];
  selectedMedicineName: string;
  selectedPrice: number;
  quantity: number;
  rowTotal: number;
  saving: number;
}

export interface MedicineCostResult {
  medicines: Medicine[];
  originalCost: number;
  optimizedCost: number;
  totalSaving: number;
  summary: string;
}

// Raw API response shape (snake_case from backend)
export interface MedicineRowAPI {
  id: string;
  name: string;
  active_ingredient: string;
  strength: string;
  current_price: number;
  alternatives: { name: string; price: number; is_generic: boolean }[];
  selected_medicine_name: string;
  selected_price: number;
  quantity: number;
  row_total: number;
  saving: number;
  // ── Prescription extras ──
  frequency?: string | null;
  frequency_per_day?: number | null;
  duration_days?: number | null;
  status?: string | null;
}

export interface MedicineCostResultAPI {
  medicines: MedicineRowAPI[];
  original_cost: number;
  optimized_cost: number;
  total_saving: number;
  summary: string;
}
