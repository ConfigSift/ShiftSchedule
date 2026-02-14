'use client';

import { create } from 'zustand';
import { useScheduleStore } from './scheduleStore';

interface UIState {
  isProfileModalOpen: boolean;
  isTimeOffModalOpen: boolean;
  isSidebarOpen: boolean;
  isSubscriptionBlocked: boolean;
  uiLockedForOnboarding: boolean;
  openProfileModal: () => void;
  closeProfileModal: () => void;
  openTimeOffModal: (payload?: Record<string, any>) => void;
  closeTimeOffModal: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  setSubscriptionBlocked: (blocked: boolean) => void;
  setUiLockedForOnboarding: (locked: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isProfileModalOpen: false,
  isTimeOffModalOpen: false,
  isSidebarOpen: false,
  isSubscriptionBlocked: false,
  uiLockedForOnboarding: false,
  openProfileModal: () => set({ isProfileModalOpen: true }),
  closeProfileModal: () => set({ isProfileModalOpen: false }),
  openTimeOffModal: (payload = {}) => {
    set({ isTimeOffModalOpen: true });
    useScheduleStore.getState().openModal('timeOffRequest', payload);
  },
  closeTimeOffModal: () => set({ isTimeOffModalOpen: false }),
  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSubscriptionBlocked: (blocked) => set({ isSubscriptionBlocked: blocked }),
  setUiLockedForOnboarding: (locked) => set({ uiLockedForOnboarding: locked }),
}));
