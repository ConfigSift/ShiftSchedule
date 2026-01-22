'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { getUserRole, isManagerRole } from '../../utils/role';
import { apiFetch } from '../../lib/apiClient';

type HourRow = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  enabled: boolean;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function BusinessHoursPage() {
  const router = useRouter();
  const { businessHours, loadRestaurantData, showToast } = useScheduleStore();
  const { currentUser, isInitialized, activeRestaurantId, init } = useAuthStore();

  const [rows, setRows] = useState<HourRow[]>([]);
  const [saving, setSaving] = useState(false);

  const isManager = isManagerRole(getUserRole(currentUser?.role));

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isInitialized && activeRestaurantId) {
      loadRestaurantData(activeRestaurantId);
    }
  }, [isInitialized, activeRestaurantId, loadRestaurantData]);

  useEffect(() => {
    if (isInitialized && (!currentUser || !isManager)) {
      router.push('/dashboard?notice=forbidden');
    }
  }, [isInitialized, currentUser, isManager, router]);

  useEffect(() => {
    const defaults: HourRow[] = Array.from({ length: 7 }, (_, day) => ({
      dayOfWeek: day,
      openTime: '09:00',
      closeTime: '17:00',
      enabled: true,
    }));
    if (businessHours.length === 0) {
      setRows(defaults);
      return;
    }
    const mapped = defaults.map((row) => {
      const existing = businessHours.find((h) => h.dayOfWeek === row.dayOfWeek);
      return {
        dayOfWeek: row.dayOfWeek,
        openTime: existing?.openTime?.slice(0, 5) ?? row.openTime,
        closeTime: existing?.closeTime?.slice(0, 5) ?? row.closeTime,
        enabled: existing?.enabled ?? row.enabled,
      };
    });
    setRows(mapped);
  }, [businessHours]);

  const handleChange = (dayOfWeek: number, field: keyof HourRow, value: string | boolean) => {
    setRows((prev) =>
      prev.map((row) =>
        row.dayOfWeek === dayOfWeek ? { ...row, [field]: value } : row
      )
    );
  };

  const handleSave = async () => {
    if (!activeRestaurantId) return;
    setSaving(true);
    const result = await apiFetch('/api/business-hours/save', {
      method: 'POST',
      json: {
        organizationId: activeRestaurantId,
        hours: rows.map((row) => ({
          dayOfWeek: row.dayOfWeek,
          openTime: row.enabled ? row.openTime : null,
          closeTime: row.enabled ? row.closeTime : null,
          enabled: row.enabled,
        })),
      },
    });

    if (!result.ok) {
      showToast(result.error || 'Unable to save business hours', 'error');
      setSaving(false);
      return;
    }

    await loadRestaurantData(activeRestaurantId);
    showToast('Business hours updated', 'success');
    setSaving(false);
  };

  if (!isInitialized || !currentUser || !isManager) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <p className="text-theme-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-theme-primary">Business Hours</h1>
          <p className="text-theme-tertiary mt-1">
            Configure open hours for each day of the week.
          </p>
        </header>

        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5 space-y-4">
          {rows.map((row) => (
            <div
              key={row.dayOfWeek}
              className="flex flex-col sm:flex-row sm:items-center gap-3 bg-theme-tertiary border border-theme-primary rounded-lg p-3"
            >
              <div className="w-28 text-sm text-theme-primary font-medium">
                {DAYS[row.dayOfWeek]}
              </div>
              <label className="flex items-center gap-2 text-xs text-theme-secondary">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => handleChange(row.dayOfWeek, 'enabled', e.target.checked)}
                  className="accent-amber-500"
                />
                Open
              </label>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={row.openTime}
                  onChange={(e) => handleChange(row.dayOfWeek, 'openTime', e.target.value)}
                  disabled={!row.enabled}
                  className="px-2 py-1 bg-theme-secondary border border-theme-primary rounded text-theme-primary disabled:opacity-60"
                />
                <span className="text-xs text-theme-muted">to</span>
                <input
                  type="time"
                  value={row.closeTime}
                  onChange={(e) => handleChange(row.dayOfWeek, 'closeTime', e.target.value)}
                  disabled={!row.enabled}
                  className="px-2 py-1 bg-theme-secondary border border-theme-primary rounded text-theme-primary disabled:opacity-60"
                />
              </div>
            </div>
          ))}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Hours'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
