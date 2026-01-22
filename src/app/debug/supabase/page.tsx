'use client';

import { useState } from 'react';
import { supabase } from '../../../lib/supabase/client';

export default function SupabaseDebugPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleHealthCheck = async () => {
    setError(null);
    setHealthStatus('Checking...');
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
        headers: { apikey: supabaseAnonKey },
      });
      setHealthStatus(`Status ${response.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Health check failed';
      setHealthStatus(null);
      setError(message);
    }
  };

  const handleGetSession = async () => {
    setError(null);
    setSessionStatus('Checking...');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setSessionStatus(null);
        setError(sessionError.message);
        return;
      }
      setSessionStatus(data.session ? 'Session exists' : 'No session');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Session check failed';
      setSessionStatus(null);
      setError(message);
    }
  };

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary">Supabase Debug</h1>
          <p className="text-sm text-theme-tertiary mt-1">
            Verify Supabase env vars and auth connectivity.
          </p>
        </div>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-theme-muted">Supabase URL</p>
            <p className="text-theme-primary font-medium break-all">{supabaseUrl || 'Not set'}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleHealthCheck}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors"
            >
              Health check
            </button>
            <button
              type="button"
              onClick={handleGetSession}
              className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
            >
              Get session
            </button>
          </div>

          {healthStatus && (
            <p className="text-sm text-theme-secondary">Health: {healthStatus}</p>
          )}

          {sessionStatus && (
            <p className="text-sm text-theme-secondary">Session: {sessionStatus}</p>
          )}

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
