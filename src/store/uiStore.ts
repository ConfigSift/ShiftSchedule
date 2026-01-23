'use client';

import { create } from 'zustand';
import { useScheduleStore } from './scheduleStore';

interface UIState {
  isProfileModalOpen: boolean;
  isTimeOffModalOpen: boolean;
  openProfileModal: () => void;
  closeProfileModal: () => void;
  openTimeOffModal: (payload?: Record<string, any>) => void;
  closeTimeOffModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isProfileModalOpen: false,
  isTimeOffModalOpen: false,
  openProfileModal: () => set({ isProfileModalOpen: true }),
  closeProfileModal: () => set({ isProfileModalOpen: false }),
  openTimeOffModal: (payload = {}) => {
    set({ isTimeOffModalOpen: true });
    useScheduleStore.getState().openModal('timeOffRequest', payload);
  },
  closeTimeOffModal: () => set({ isTimeOffModalOpen: false }),
}));
