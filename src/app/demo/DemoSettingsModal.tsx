'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { useScheduleStore } from '../../store/scheduleStore';
import { useAuthStore } from '../../store/authStore';

type DemoSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const WEEK_START_OPTIONS = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
] as const;

const HOUR_MODE_OPTIONS = [
  { value: 'business', label: 'Business Hours' },
  { value: 'full24', label: 'Full 24 Hours' },
  { value: 'custom', label: 'Custom Range' },
] as const;

function normalizeTime(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.length === 5) return `${trimmed}:00`;
  return trimmed;
}

export function DemoSettingsModal({ isOpen, onClose }: DemoSettingsModalProps) {
  const { activeRestaurantId } = useAuthStore();
  const {
    scheduleViewSettings,
    businessHours,
    coreHours,
    setScheduleViewSettings,
    showToast,
  } = useScheduleStore();

  const [weekStartDay, setWeekStartDay] = useState<'sunday' | 'monday'>('monday');
  const [hourMode, setHourMode] = useState<'business' | 'full24' | 'custom'>('business');
  const [customStartHour, setCustomStartHour] = useState(9);
  const [customEndHour, setCustomEndHour] = useState(24);
  const [businessOpenTime, setBusinessOpenTime] = useState('10:00');
  const [businessCloseTime, setBusinessCloseTime] = useState('23:00');
  const [coreOpenTime, setCoreOpenTime] = useState('11:00');
  const [coreCloseTime, setCoreCloseTime] = useState('22:00');

  const restaurantId = activeRestaurantId ?? scheduleViewSettings?.organizationId ?? 'demo-org-001';

  const businessSeed = useMemo(
    () => businessHours.find((item) => item.enabled && item.openTime && item.closeTime) ?? businessHours[0],
    [businessHours],
  );
  const coreSeed = useMemo(
    () => coreHours.find((item) => item.enabled && item.openTime && item.closeTime) ?? coreHours[0],
    [coreHours],
  );

  useEffect(() => {
    if (!isOpen) return;
    setWeekStartDay(scheduleViewSettings?.weekStartDay ?? 'monday');
    setHourMode(scheduleViewSettings?.hourMode ?? 'business');
    setCustomStartHour(scheduleViewSettings?.customStartHour ?? 9);
    setCustomEndHour(scheduleViewSettings?.customEndHour ?? 24);
    setBusinessOpenTime((businessSeed?.openTime ?? '10:00:00').slice(0, 5));
    setBusinessCloseTime((businessSeed?.closeTime ?? '23:00:00').slice(0, 5));
    setCoreOpenTime((coreSeed?.openTime ?? '11:00:00').slice(0, 5));
    setCoreCloseTime((coreSeed?.closeTime ?? '22:00:00').slice(0, 5));
  }, [businessSeed, coreSeed, isOpen, scheduleViewSettings]);

  const applySettings = () => {
    const baseId = scheduleViewSettings?.id ?? 'demo-svs-001';
    const nextSettings = {
      id: baseId,
      organizationId: restaurantId,
      hourMode,
      customStartHour,
      customEndHour,
      weekStartDay,
    } as const;
    setScheduleViewSettings(nextSettings);

    const openBusiness = normalizeTime(businessOpenTime, '10:00:00');
    const closeBusiness = normalizeTime(businessCloseTime, '23:00:00');
    const openCore = normalizeTime(coreOpenTime, '11:00:00');
    const closeCore = normalizeTime(coreCloseTime, '22:00:00');

    useScheduleStore.setState((state) => {
      const nextBusiness =
        state.businessHours.length > 0
          ? state.businessHours.map((row) => ({
              ...row,
              organizationId: restaurantId,
              openTime: openBusiness,
              closeTime: closeBusiness,
              enabled: true,
            }))
          : Array.from({ length: 7 }, (_, dayOfWeek) => ({
              id: `demo-bh-${dayOfWeek}`,
              organizationId: restaurantId,
              dayOfWeek,
              openTime: openBusiness,
              closeTime: closeBusiness,
              enabled: true,
              sortOrder: dayOfWeek,
            }));

      const nextCore =
        state.coreHours.length > 0
          ? state.coreHours.map((row) => ({
              ...row,
              organizationId: restaurantId,
              openTime: openCore,
              closeTime: closeCore,
              enabled: true,
            }))
          : Array.from({ length: 7 }, (_, dayOfWeek) => ({
              id: `demo-ch-${dayOfWeek}`,
              organizationId: restaurantId,
              dayOfWeek,
              openTime: openCore,
              closeTime: closeCore,
              enabled: true,
              sortOrder: dayOfWeek,
            }));

      return {
        businessHours: nextBusiness,
        coreHours: nextCore,
      };
    });

    showToast('Demo schedule settings saved.', 'success');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Demo Schedule Settings" size="md">
      <div className="space-y-4">
        <p className="text-xs text-theme-tertiary">
          These settings are demo-only and saved for this tab session.
        </p>

        <div className="grid gap-2">
          <label className="text-sm font-medium text-theme-secondary">Week Starts On</label>
          <select
            value={weekStartDay}
            onChange={(e) => setWeekStartDay(e.target.value as 'sunday' | 'monday')}
            className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          >
            {WEEK_START_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium text-theme-secondary">Hour Display Mode</label>
          <select
            value={hourMode}
            onChange={(e) => setHourMode(e.target.value as 'business' | 'full24' | 'custom')}
            className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          >
            {HOUR_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {hourMode === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-theme-secondary">Custom Start Hour</label>
              <input
                type="number"
                min={0}
                max={23}
                value={customStartHour}
                onChange={(e) => setCustomStartHour(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-theme-secondary">Custom End Hour</label>
              <input
                type="number"
                min={1}
                max={24}
                value={customEndHour}
                onChange={(e) => setCustomEndHour(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-theme-secondary">Business Open</label>
            <input
              type="time"
              value={businessOpenTime}
              onChange={(e) => setBusinessOpenTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-theme-secondary">Business Close</label>
            <input
              type="time"
              value={businessCloseTime}
              onChange={(e) => setBusinessCloseTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-theme-secondary">Core Open</label>
            <input
              type="time"
              value={coreOpenTime}
              onChange={(e) => setCoreOpenTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-theme-secondary">Core Close</label>
            <input
              type="time"
              value={coreCloseTime}
              onChange={(e) => setCoreCloseTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-theme-tertiary border border-theme-primary text-theme-primary focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={applySettings}
            className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors text-sm font-semibold"
          >
            Save Settings
          </button>
        </div>
      </div>
    </Modal>
  );
}
