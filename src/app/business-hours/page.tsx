'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';
import { getUserRole, isManagerRole } from '../../utils/role';
import { apiFetch } from '../../lib/apiClient';
import { ScheduleHourMode } from '../../types';

type HourRow = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  enabled: boolean;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function BusinessHoursPage() {
  const router = useRouter();
  const { businessHours, scheduleViewSettings, loadRestaurantData, showToast, setScheduleViewSettings } = useScheduleStore();
  const { currentUser, isInitialized, activeRestaurantId, init } = useAuthStore();

  const [rows, setRows] = useState<HourRow[]>([]);
  const [saving, setSaving] = useState(false);

  // Schedule View Settings state
  const [hourMode, setHourMode] = useState<ScheduleHourMode>('full24');
  const [customStartHour, setCustomStartHour] = useState(6);
  const [customEndHour, setCustomEndHour] = useState(22);
  const [savingSettings, setSavingSettings] = useState(false);

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

  // Load schedule view settings
  useEffect(() => {
    if (scheduleViewSettings) {
      setHourMode(scheduleViewSettings.hourMode);
      setCustomStartHour(scheduleViewSettings.customStartHour);
      setCustomEndHour(scheduleViewSettings.customEndHour);
    } else {
      // Default values
      setHourMode('full24');
      setCustomStartHour(6);
      setCustomEndHour(22);
    }
  }, [scheduleViewSettings]);

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

  const handleSaveSettings = async () => {
    if (!activeRestaurantId) return;

    // Validate custom hours
    if (hourMode === 'custom' && customEndHour <= customStartHour) {
      showToast('End hour must be greater than start hour', 'error');
      return;
    }

    setSavingSettings(true);
    const result = await apiFetch<{ settings: Record<string, any> }>('/api/schedule-view-settings/save', {
      method: 'POST',
      json: {
        organizationId: activeRestaurantId,
        hourMode,
        customStartHour,
        customEndHour,
      },
    });

    if (!result.ok) {
      showToast(result.error || 'Unable to save schedule view settings', 'error');
      setSavingSettings(false);
      return;
    }

    // Update the store with new settings
    if (result.data?.settings) {
      const s = result.data.settings;
      setScheduleViewSettings({
        id: s.id,
        organizationId: s.organization_id,
        hourMode: s.hour_mode as ScheduleHourMode,
        customStartHour: Number(s.custom_start_hour ?? 0),
        customEndHour: Number(s.custom_end_hour ?? 24),
      });
    }

    showToast('Schedule view settings updated', 'success');
    setSavingSettings(false);
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
      <div className="max-w-3xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-theme-primary">Schedule Settings</h1>
          <p className="text-theme-tertiary mt-1">
            Configure business hours and schedule view preferences.
          </p>
        </header>

        {/* Schedule View Hours Section */}
        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-theme-primary">Schedule View Hours</h2>
            <p className="text-sm text-theme-tertiary mt-1">
              Choose which hours to display on the schedule timeline.
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 bg-theme-tertiary border border-theme-primary rounded-lg cursor-pointer hover:bg-theme-hover transition-colors">
              <input
                type="radio"
                name="hourMode"
                value="full24"
                checked={hourMode === 'full24'}
                onChange={() => setHourMode('full24')}
                className="accent-amber-500 mt-1"
              />
              <div>
                <span className="text-sm font-medium text-theme-primary">Full 24 Hours</span>
                <p className="text-xs text-theme-muted">Display the entire day from 12am to 12am (00:00–24:00)</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 bg-theme-tertiary border border-theme-primary rounded-lg cursor-pointer hover:bg-theme-hover transition-colors">
              <input
                type="radio"
                name="hourMode"
                value="business"
                checked={hourMode === 'business'}
                onChange={() => setHourMode('business')}
                className="accent-amber-500 mt-1"
              />
              <div>
                <span className="text-sm font-medium text-theme-primary">Business Hours</span>
                <p className="text-xs text-theme-muted">Display hours based on your configured business hours below (with 1 hour padding)</p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 bg-theme-tertiary border border-theme-primary rounded-lg cursor-pointer hover:bg-theme-hover transition-colors">
              <input
                type="radio"
                name="hourMode"
                value="custom"
                checked={hourMode === 'custom'}
                onChange={() => setHourMode('custom')}
                className="accent-amber-500 mt-1"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-theme-primary">Custom Range</span>
                <p className="text-xs text-theme-muted mb-2">Specify a custom hour range</p>
                {hourMode === 'custom' && (
                  <div className="flex items-center gap-2 mt-2">
                    <select
                      value={customStartHour}
                      onChange={(e) => setCustomStartHour(Number(e.target.value))}
                      className="px-2 py-1 bg-theme-secondary border border-theme-primary rounded text-theme-primary text-sm"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {i === 0 ? '12am' : i < 12 ? `${i}am` : i === 12 ? '12pm' : `${i - 12}pm`}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-theme-muted">to</span>
                    <select
                      value={customEndHour}
                      onChange={(e) => setCustomEndHour(Number(e.target.value))}
                      className="px-2 py-1 bg-theme-secondary border border-theme-primary rounded text-theme-primary text-sm"
                    >
                      {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>
                          {h === 24 ? '12am (next day)' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : 'Save View Settings'}
            </button>
          </div>
        </div>

        {/* Business Hours Section */}
        <div className="bg-theme-secondary border border-theme-primary rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-theme-primary">Business Hours</h2>
            <p className="text-sm text-theme-tertiary mt-1">
              Configure open hours for each day of the week.
            </p>
          </div>

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
              {saving ? 'Saving...' : 'Save Business Hours'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
