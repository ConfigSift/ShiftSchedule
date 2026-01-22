'use client';

import { create } from 'zustand';
import { Employee } from '../types';
import { verifyPin } from '../utils/timeUtils';
import { STORAGE_KEYS, saveToStorage, loadFromStorage } from '../utils/storage';

interface AuthState {
  currentUser: Employee | null;
  isManager: boolean;
  isInitialized: boolean;
  
  // Actions
  login: (employees: Employee[], pin: string) => Promise<Employee | null>;
  loginById: (employees: Employee[], employeeId: string, pin: string) => Promise<boolean>;
  logout: () => void;
  setCurrentUser: (user: Employee | null) => void;
  checkSession: (employees: Employee[]) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isManager: false,
  isInitialized: false,
  
  login: async (employees, pin) => {
    // Try to find any employee with this PIN
    for (const emp of employees) {
      if (!emp.isActive) continue;
      const valid = await verifyPin(pin, emp.pinHash);
      if (valid) {
        set({ 
          currentUser: emp, 
          isManager: emp.userRole === 'manager',
          isInitialized: true,
        });
        saveToStorage(STORAGE_KEYS.CURRENT_USER, emp.id);
        return emp;
      }
    }
    return null;
  },
  
  loginById: async (employees, employeeId, pin) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp || !emp.isActive) return false;
    
    const valid = await verifyPin(pin, emp.pinHash);
    if (valid) {
      set({ 
        currentUser: emp, 
        isManager: emp.userRole === 'manager',
        isInitialized: true,
      });
      saveToStorage(STORAGE_KEYS.CURRENT_USER, emp.id);
      return true;
    }
    return false;
  },
  
  logout: () => {
    set({ currentUser: null, isManager: false });
    saveToStorage(STORAGE_KEYS.CURRENT_USER, null);
  },
  
  setCurrentUser: (user) => {
    set({ 
      currentUser: user, 
      isManager: user?.userRole === 'manager' || false,
      isInitialized: true,
    });
    if (user) {
      saveToStorage(STORAGE_KEYS.CURRENT_USER, user.id);
    }
  },
  
  checkSession: (employees) => {
    const storedUserId = loadFromStorage<string | null>(STORAGE_KEYS.CURRENT_USER, null);
    if (storedUserId) {
      const user = employees.find(e => e.id === storedUserId && e.isActive);
      if (user) {
        set({ 
          currentUser: user, 
          isManager: user.userRole === 'manager',
          isInitialized: true,
        });
        return;
      }
    }
    set({ isInitialized: true });
  },
}));
