'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../../lib/supabase/client';
import { formatSupabaseEnvError, getSupabaseEnv } from '../../../lib/supabase/env';
import { useAuthStore } from '../../../store/authStore';
import { useScheduleStore } from '../../../store/scheduleStore';
import { getUserRole } from '../../../utils/role';
import { getJobsStorageType, normalizeJobs } from '../../../utils/jobs';

export default function SupabaseDebugPage() {
  const { activeRestaurantId, activeRestaurantCode, currentUser } = useAuthStore();
  const { shiftLoadCounts, shifts } = useScheduleStore();
  const resolvedRole = getUserRole(currentUser?.role);
  const roleMissing = !currentUser?.role;
  const { supabaseUrl, supabaseAnonKey, urlValid, anonKeyValid, isValid } = getSupabaseEnv();
  const keyPreview = supabaseAnonKey ? `${supabaseAnonKey.slice(0, 12)}...` : '(missing)';
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [tableStatus, setTableStatus] = useState<string | null>(null);
  const [orgLookupStatus, setOrgLookupStatus] = useState<string | null>(null);
  const [userLookupStatus, setUserLookupStatus] = useState<string | null>(null);
  const [whoAmIStatus, setWhoAmIStatus] = useState<string | null>(null);
  const [whoAmIData, setWhoAmIData] = useState<{
    hasSession: boolean;
    authUserId: string | null;
    email: string | null;
    organizationId: string | null;
    role: string | null;
    userRowFound: boolean;
    cookiePresent?: boolean;
  } | null>(null);
  const [browserSessionExists, setBrowserSessionExists] = useState<boolean | null>(null);
  const [orgLookupCode, setOrgLookupCode] = useState(activeRestaurantCode || '');
  const [error, setError] = useState<string | null>(null);
  const [jobsInfo, setJobsInfo] = useState<{ type: string; jobs: string[] } | null>(null);

  const handleHealthCheck = async () => {
    setError(null);
    setHealthStatus('Checking...');
    try {
      if (!isValid) {
        throw new Error(formatSupabaseEnvError());
      }
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
      if (!isValid) {
        throw new Error(formatSupabaseEnvError());
      }
      const { data, error: sessionError } = await getSupabaseClient().auth.getSession();
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

  const handleTableCheck = async () => {
    setError(null);
    setTableStatus('Checking...');
    try {
      if (!isValid) {
        throw new Error(formatSupabaseEnvError());
      }
      const client = getSupabaseClient();
      const [orgResult, userResult, shiftResult] = await Promise.all([
        client.from('organizations').select('id').limit(1),
        client.from('users').select('id').limit(1),
        client.from('shifts').select('id').limit(1),
      ]);
      if (orgResult.error || userResult.error || shiftResult.error) {
        const message = orgResult.error?.message
          || userResult.error?.message
          || shiftResult.error?.message
          || 'Table check failed';
        setTableStatus(null);
        setError(message);
        return;
      }
      setTableStatus('OK');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Table check failed';
      setTableStatus(null);
      setError(message);
    }
  };

  const handleOrgLookup = async () => {
    setError(null);
    setOrgLookupStatus('Checking...');
    try {
      if (!isValid) {
        throw new Error(formatSupabaseEnvError());
      }
      const code = orgLookupCode.trim().toUpperCase();
      if (!code) {
        setOrgLookupStatus('Enter a Restaurant ID.');
        return;
      }
      const client = getSupabaseClient();
      const { data, error: lookupError } = await client
        .from('organizations')
        .select('id')
        .eq('restaurant_code', code);
      if (lookupError) {
        setOrgLookupStatus(null);
        setError(lookupError.message);
        return;
      }
      setOrgLookupStatus(`Matches: ${data?.length ?? 0}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lookup failed';
      setOrgLookupStatus(null);
      setError(message);
    }
  };

  const handleUserLookup = async () => {
    setError(null);
    setUserLookupStatus('Checking...');
    try {
      if (!isValid) {
        throw new Error(formatSupabaseEnvError());
      }
      const client = getSupabaseClient();
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) {
        setUserLookupStatus(null);
        setError(sessionError.message);
        return;
      }
      const authUserId = sessionData.session?.user?.id;
      if (!authUserId) {
        setUserLookupStatus('No session');
        return;
      }
      const { data, error: lookupError } = await client
        .from('users')
        .select('*')
        .eq('auth_user_id', authUserId);
      if (lookupError) {
        const code = lookupError.code ? ` (${lookupError.code})` : '';
        setUserLookupStatus(null);
        setError(`User lookup error${code}: ${lookupError.message}`);
        return;
      }
      setUserLookupStatus(data && data.length > 0 ? 'User found' : 'Zero rows');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lookup failed';
      setUserLookupStatus(null);
      setError(message);
    }
  };

  const handleWhoAmI = async () => {
    setError(null);
    setWhoAmIStatus('Checking...');
    try {
      const browserSession = await getSupabaseClient().auth.getSession();
      setBrowserSessionExists(Boolean(browserSession.data.session));
      const response = await fetch('/api/me', { cache: 'no-store', credentials: 'include' });
      const data = await response.json();
      if (!response.ok) {
        setWhoAmIStatus(null);
        setError(data?.error || 'Who am I failed');
        return;
      }
      if (!data?.hasSession) {
        setWhoAmIStatus('No session');
        setWhoAmIData(data);
        return;
      }
      setWhoAmIData(data);
      setWhoAmIStatus(`User: ${data.email || data.authUserId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Who am I failed';
      setWhoAmIStatus(null);
      setWhoAmIData(null);
      setBrowserSessionExists(null);
      setError(message);
    }
  };

  const fetchJobsInfo = async () => {
    if (!currentUser?.authUserId || !isValid) {
      setJobsInfo(null);
      return;
    }
    try {
      const client = getSupabaseClient();
      const { data, error: lookupError } = (await client
        .from('users')
        .select('jobs')
        .eq('auth_user_id', currentUser.authUserId)
        .maybeSingle()) as {
        data: { jobs?: unknown } | null;
        error: { message: string } | null;
      };
      if (lookupError) {
        setJobsInfo(null);
        return;
      }
      setJobsInfo({
        type: getJobsStorageType(data?.jobs),
        jobs: normalizeJobs(data?.jobs),
      });
    } catch {
      setJobsInfo(null);
    }
  };

  useEffect(() => {
    fetchJobsInfo();
  }, [currentUser?.authUserId, isValid]);

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
            <p className="text-xs uppercase tracking-wide text-theme-muted">Tables in use</p>
            <p className="text-theme-primary font-medium">public.organizations</p>
            <p className="text-theme-primary font-medium">public.users</p>
            <p className="text-theme-primary font-medium">public.shifts</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-theme-muted">Active Organization</p>
            <p className="text-theme-primary font-medium">{activeRestaurantId || 'Not set'}</p>
            <p className="text-theme-primary font-medium">{activeRestaurantCode || 'No Restaurant ID'}</p>
            <p className="text-theme-primary font-medium">Role: {resolvedRole}</p>
            {roleMissing && process.env.NODE_ENV !== 'production' && (
              <p className="text-xs text-red-400 mt-1">Role missing or unknown.</p>
            )}
            <p className="text-xs text-theme-muted mt-1">
              Shifts loaded: {shiftLoadCounts.visible} / {shiftLoadCounts.total} (store: {shifts.length})
            </p>
            <p className="text-xs text-theme-muted mt-1">
              Jobs type: {jobsInfo?.type || 'unknown'} | Jobs: {jobsInfo?.jobs?.join(', ') || 'none'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-theme-muted">Supabase URL</p>
            <p className="text-theme-primary font-medium break-all">{supabaseUrl || 'Not set'}</p>
            <p className="text-xs text-theme-muted mt-1">
              URL valid: {urlValid ? 'yes' : 'no'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-theme-muted">Anon Key (preview)</p>
            <p className="text-theme-primary font-medium">{keyPreview}</p>
            <p className="text-xs text-theme-muted mt-1">
              Key valid: {anonKeyValid ? 'yes' : 'no'}
            </p>
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
            <button
              type="button"
              onClick={handleTableCheck}
              className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
            >
              Check tables
            </button>
            <button
              type="button"
              onClick={handleUserLookup}
              className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
            >
              Check user
            </button>
            <button
              type="button"
              onClick={handleWhoAmI}
              className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
            >
              Who am I?
            </button>
          </div>

          {healthStatus && (
            <p className="text-sm text-theme-secondary">Health: {healthStatus}</p>
          )}

          {sessionStatus && (
            <p className="text-sm text-theme-secondary">Session: {sessionStatus}</p>
          )}
          {tableStatus && (
            <p className="text-sm text-theme-secondary">Tables: {tableStatus}</p>
          )}
          {userLookupStatus && (
            <p className="text-sm text-theme-secondary">User lookup: {userLookupStatus}</p>
          )}
          {whoAmIStatus && (
            <p className="text-sm text-theme-secondary">Who am I: {whoAmIStatus}</p>
          )}
          {whoAmIData && (
            <div className="text-xs text-theme-muted space-y-1">
              <p>Auth ID: {whoAmIData.authUserId || '-'}</p>
              <p>Email: {whoAmIData.email || '-'}</p>
              <p>Organization ID: {whoAmIData.organizationId || '-'}</p>
              <p>Role: {whoAmIData.role || '-'}</p>
              <p>Cookie present: {whoAmIData.cookiePresent ? 'yes' : 'no'}</p>
              {browserSessionExists && !whoAmIData.hasSession && (
                <p className="text-red-400">
                  Browser has a session but the server does not. Check SSR cookies/middleware.
                </p>
              )}
              {!whoAmIData.userRowFound && (
                <p className="text-red-400">
                  Missing users row. Visit /setup or create a profile in /staff.
                </p>
              )}
            </div>
          )}
          <div className="pt-2 border-t border-theme-primary">
            <p className="text-xs uppercase tracking-wide text-theme-muted mb-2">Org lookup</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={orgLookupCode}
                onChange={(e) => setOrgLookupCode(e.target.value.toUpperCase())}
                className="flex-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
                placeholder="RST-K7M2Q9PJ"
              />
              <button
                type="button"
                onClick={handleOrgLookup}
                className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover transition-colors"
              >
                Lookup
              </button>
            </div>
            {orgLookupStatus && (
              <p className="text-sm text-theme-secondary mt-2">{orgLookupStatus}</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
