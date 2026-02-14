'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Dashboard } from '@/components/Dashboard';
import { useAuthStore } from '@/store/authStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { getWeekStart } from '@/utils/timeUtils';
import { getUserRole, isManagerRole } from '@/utils/role';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseWeekParam(value: string | null) {
  if (!value || !DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export default function BuilderClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, activeRestaurantId, isInitialized } = useAuthStore();
  const {
    scheduleMode,
    setScheduleMode,
    setSelectedDate,
    setViewMode,
    applyRestaurantScope,
    loadRestaurantData,
    scheduleViewSettings,
    getEmployeesForRestaurant,
    selectAllEmployeesForRestaurant,
    selectedEmployeeIds,
  } = useScheduleStore();
  const autoSelectedRef = useRef<string | null>(null);

  const isManager = useMemo(
    () => isManagerRole(getUserRole(currentUser?.role)),
    [currentUser?.role]
  );

  useEffect(() => {
    if (!isInitialized) return;
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!isManager) {
      router.push('/dashboard');
    }
  }, [currentUser, isInitialized, isManager, router]);

  useEffect(() => {
    if (!isManager) {
      setScheduleMode('published');
      return;
    }
    const previousViewMode = useScheduleStore.getState().viewMode;
    setViewMode('week');
    setScheduleMode('draft');
    return () => {
      setScheduleMode('published');
      setViewMode(previousViewMode);
    };
  }, [isManager, setScheduleMode, setViewMode]);

  useEffect(() => {
    const weekParam = searchParams.get('week');
    const parsed = parseWeekParam(weekParam);
    const weekStartDay = scheduleViewSettings?.weekStartDay ?? 'sunday';
    const targetDate = parsed ?? getWeekStart(new Date(), weekStartDay);
    setSelectedDate(targetDate);
  }, [scheduleViewSettings?.weekStartDay, searchParams, setSelectedDate]);

  useEffect(() => {
    if (!isManager || !activeRestaurantId || scheduleMode !== 'draft') return;
    applyRestaurantScope(activeRestaurantId);
    loadRestaurantData(activeRestaurantId);
  }, [activeRestaurantId, applyRestaurantScope, isManager, loadRestaurantData, scheduleMode]);

  useEffect(() => {
    if (!isManager || !activeRestaurantId) return;
    if (selectedEmployeeIds.length > 0) return;
    const scopedEmployees = getEmployeesForRestaurant(activeRestaurantId);
    if (scopedEmployees.length === 0) return;
    if (autoSelectedRef.current === activeRestaurantId) return;
    selectAllEmployeesForRestaurant(activeRestaurantId);
    autoSelectedRef.current = activeRestaurantId;
  }, [
    activeRestaurantId,
    getEmployeesForRestaurant,
    isManager,
    selectAllEmployeesForRestaurant,
    selectedEmployeeIds.length,
  ]);

  return <Dashboard autoLoad={false} />;
}
