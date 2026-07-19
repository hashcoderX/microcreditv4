'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/api';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotPassword, setForgotPassword] = useState('');
  const [forgotPasswordConfirm, setForgotPasswordConfirm] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky-100 via-cyan-100 to-emerald-100 px-4 sm:px-6 lg:px-8">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-600" />
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPassword = password.trim();

      const response = await axios.post(`${getApiBaseUrl()}/login`, {
        email: normalizedEmail,
        password: normalizedPassword,
      });
      localStorage.setItem('token', response.data.token);
      if (response.data?.user) {
        localStorage.setItem('auth_user', JSON.stringify(response.data.user));
      }
      router.push('/dashboard');
    } catch (error: unknown) {
      const responseData = axios.isAxiosError(error) ? error.response?.data : null;
      const backendMessage = responseData && typeof responseData === 'object' ? (responseData as { message?: unknown }).message : null;
      const backendErrors = responseData && typeof responseData === 'object' ? (responseData as { errors?: unknown }).errors : null;

      let firstValidationError = '';
      if (backendErrors && typeof backendErrors === 'object') {
        const errorMap = backendErrors as Record<string, unknown>;
        const firstKey = Object.keys(errorMap)[0];
        const firstValue = firstKey ? errorMap[firstKey] : undefined;
        if (Array.isArray(firstValue) && firstValue[0]) {
          firstValidationError = String(firstValue[0]);
        } else if (firstValue) {
          firstValidationError = String(firstValue);
        }
      }

      const message = String(
        backendMessage ||
          firstValidationError ||
          'Login failed. Please check your credentials.'
      );
      setModalMessage(String(message));
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (forgotPassword !== forgotPasswordConfirm) {
      setModalMessage('New password and confirm password do not match.');
      setShowModal(true);
      return;
    }

    setForgotLoading(true);
    try {
      const response = await axios.post(`${getApiBaseUrl()}/forgot-password`, {
        email: forgotEmail.trim().toLowerCase(),
        password: forgotPassword,
        password_confirmation: forgotPasswordConfirm,
      });

      setShowForgotModal(false);
      setForgotEmail('');
      setForgotPassword('');
      setForgotPasswordConfirm('');
      setModalMessage(String(response?.data?.message || 'Password reset successful.'));
      setShowModal(true);
    } catch (error: unknown) {
      const responseData = axios.isAxiosError(error) ? error.response?.data : null;
      const message =
        (responseData && typeof responseData === 'object' && typeof (responseData as { message?: unknown }).message === 'string'
          ? (responseData as { message: string }).message
          : null) ||
        (responseData && typeof responseData === 'object'
          ? (responseData as { errors?: { email?: string[]; password?: string[] } }).errors?.email?.[0] ||
            (responseData as { errors?: { email?: string[]; password?: string[] } }).errors?.password?.[0]
          : null) ||
        'Failed to reset password.';
      setModalMessage(String(message));
      setShowModal(true);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky-100 via-cyan-100 to-emerald-100 px-4 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -top-16 left-8 h-72 w-72 rounded-full bg-cyan-300/70 blur-3xl"></div>
        <div className="absolute top-24 right-6 h-96 w-96 rounded-full bg-emerald-300/65 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-sky-300/65 blur-3xl"></div>
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/50 bg-white/55 p-8 shadow-[0_25px_65px_-30px_rgba(12,74,110,0.7)] backdrop-blur-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-cyan-700">
            Desk of Finance
          </div>
          <h1 className="mt-4 text-4xl font-black leading-tight text-slate-900 sm:text-5xl">
            Global Capital Credit
            <span className="block bg-gradient-to-r from-cyan-600 to-emerald-600 bg-clip-text text-transparent">
              Operations Portal
            </span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-600 sm:text-base">
            Manage lending, collections, and team workflows from one secure workspace designed for day-to-day field and office operations.
          </p>

          <div className="mt-6">
            <img
              src="/media/company/logo"
              alt="Company logo"
              onError={(event) => {
                const target = event.currentTarget;
                if (target.src.includes('/icons/icon-192.png')) return;
                target.src = '/icons/icon-192.png';
              }}
              className="h-44 w-full max-w-md rounded-2xl border border-cyan-100 bg-white object-contain p-3 shadow-lg sm:h-56"
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-cyan-100 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Access Level</p>
              <p className="mt-1 text-lg font-extrabold text-slate-900">Role Based</p>
            </div>
            <div className="rounded-2xl border border-cyan-100 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
              <p className="mt-1 text-lg font-extrabold text-emerald-700">System Online</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/65 bg-white/85 p-8 shadow-[0_25px_65px_-30px_rgba(8,47,73,0.75)] backdrop-blur-xl">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Welcome Back</p>
            <h2 className="mt-2 text-3xl font-black text-slate-900">Sign in to continue</h2>
            <p className="mt-2 text-sm text-slate-600">Use your account credentials to access your dashboard.</p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleLogin}>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="block w-full rounded-xl border border-cyan-100 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition-all duration-200 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email.trim().toLowerCase());
                    setShowForgotModal(true);
                  }}
                  className="text-xs font-semibold text-cyan-700 hover:text-cyan-800"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="block w-full rounded-xl border border-cyan-100 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition-all duration-200 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-500/30 transition-all duration-300 hover:from-cyan-600 hover:to-emerald-600 hover:shadow-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-[0_28px_70px_-30px_rgba(190,24,93,0.55)]">
            <h3 className="text-xl font-extrabold text-rose-700">Login Error</h3>
            <p className="mt-3 text-sm text-slate-700">{modalMessage}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 text-white text-sm font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-cyan-200 bg-white p-6 shadow-[0_28px_70px_-30px_rgba(14,116,144,0.55)]">
            <h3 className="text-xl font-extrabold text-cyan-700">Reset Password</h3>
            <p className="mt-3 text-sm text-slate-700">Enter your email and choose a new password.</p>

            <form className="mt-4 space-y-3" onSubmit={handleForgotPassword}>
              <div>
                <label htmlFor="forgot-email" className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="block w-full rounded-xl border border-cyan-100 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                  placeholder="name@company.com"
                />
              </div>

              <div>
                <label htmlFor="forgot-password" className="mb-1 block text-sm font-semibold text-slate-700">New Password</label>
                <input
                  id="forgot-password"
                  type="password"
                  minLength={8}
                  required
                  value={forgotPassword}
                  onChange={(e) => setForgotPassword(e.target.value)}
                  className="block w-full rounded-xl border border-cyan-100 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                  placeholder="Minimum 8 characters"
                />
              </div>

              <div>
                <label htmlFor="forgot-password-confirm" className="mb-1 block text-sm font-semibold text-slate-700">Confirm New Password</label>
                <input
                  id="forgot-password-confirm"
                  type="password"
                  minLength={8}
                  required
                  value={forgotPasswordConfirm}
                  onChange={(e) => setForgotPasswordConfirm(e.target.value)}
                  className="block w-full rounded-xl border border-cyan-100 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                  placeholder="Re-enter new password"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (forgotLoading) return;
                    setShowForgotModal(false);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {forgotLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
