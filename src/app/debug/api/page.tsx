'use client';

import { useMemo, useState } from 'react';

type TryResult = {
  status: number;
  ok: boolean;
  body: string;
};

export default function DebugApiPage() {
  const isDev = process.env.NODE_ENV !== 'production';
  const [userId, setUserId] = useState('00000000-0000-0000-0000-000000000000');
  const [organizationId, setOrganizationId] = useState('');
  const [pinCode, setPinCode] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);

  const payloadPreview = useMemo(
    () => ({
      userId: userId || 'YOUR_USER_ID',
      organizationId: organizationId || undefined,
      pinCode: pinCode || '123456',
    }),
    [userId, organizationId, pinCode]
  );

  const handleTry = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/admin/set-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadPreview),
      });
      const text = await response.text();
      setResult({
        status: response.status,
        ok: response.ok,
        body: text || '(empty)',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResult({ status: 0, ok: false, body: message });
    } finally {
      setLoading(false);
    }
  };

  if (!isDev) {
    return (
      <div className="min-h-screen bg-theme-primary p-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6">
            <h1 className="text-xl font-semibold text-theme-primary">API Debug</h1>
            <p className="text-theme-tertiary mt-2">
              This page is only available in non-production environments.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-theme-primary">API Debug</h1>
          <p className="text-theme-tertiary mt-1">
            Quick reference for PIN reset endpoints and test payloads.
          </p>
        </header>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-theme-primary">PIN Endpoints</h2>
            <ul className="mt-2 space-y-1 text-sm text-theme-secondary">
              <li>
                <span className="text-theme-muted">POST</span> /api/admin/set-passcode (primary)
              </li>
              <li>
                <span className="text-theme-muted">POST</span> /api/users/update-pin (compat)
              </li>
              <li>
                <span className="text-theme-muted">POST</span> /api/staff/pin (compat)
              </li>
              <li>
                <span className="text-theme-muted">GET</span> /api/users/pin (legacy; returns 410 Gone)
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-theme-primary">Example Payload</h2>
            <pre className="mt-2 text-xs text-theme-secondary bg-theme-primary border border-theme-primary rounded-lg p-3 overflow-x-auto">
{JSON.stringify(payloadPreview, null, 2)}
            </pre>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-theme-secondary">User ID</label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
              />
            </div>
            <div>
              <label className="text-sm text-theme-secondary">Organization ID (optional)</label>
              <input
                type="text"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
              />
            </div>
            <div>
              <label className="text-sm text-theme-secondary">PIN Code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full mt-1 px-3 py-2 bg-theme-tertiary border border-theme-primary rounded-lg text-theme-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTry}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-zinc-900 font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Try request'}
            </button>
            <span className="text-xs text-theme-muted">
              Sends POST to /api/admin/set-passcode
            </span>
          </div>

          {result && (
            <div className="border-t border-theme-primary pt-4 space-y-2">
              <p className="text-sm text-theme-secondary">
                Response: <span className={result.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {result.status}
                </span>
              </p>
              <pre className="text-xs text-theme-secondary bg-theme-primary border border-theme-primary rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
{result.body}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
