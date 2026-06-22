import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth-context';
import { ToastProvider } from './lib/toast-context';
import ProtectedRoute from './components/ui/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import MedicineCostOptimizer from './pages/MedicineCostOptimizer';
import SpendingTracker from './pages/SpendingTracker';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/signup"   element={<SignupPage />} />
            <Route path="/"         element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/medicines" element={<ProtectedRoute><MedicineCostOptimizer /></ProtectedRoute>} />
            <Route path="/spending"  element={<ProtectedRoute><SpendingTracker /></ProtectedRoute>} />
            <Route path="*"         element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
