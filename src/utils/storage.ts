const STORAGE_KEYS = {
  EMPLOYEES: 'shiftflow_employees',
  SHIFTS: 'shiftflow_shifts',
  TIME_OFF_REQUESTS: 'shiftflow_time_off',
  BLOCKED_PERIODS: 'shiftflow_blocked',
  DROP_REQUESTS: 'shiftflow_drop_requests',
  CHAT_MESSAGES: 'shiftflow_chat',
  CURRENT_USER: 'shiftflow_current_user',
  INITIALIZED: 'shiftflow_initialized',
};

export function saveToStorage<T>(key: string, data: T): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(data));
  }
}

export function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  
  const stored = localStorage.getItem(key);
  if (!stored) return defaultValue;
  
  try {
    return JSON.parse(stored) as T;
  } catch {
    return defaultValue;
  }
}

export function clearStorage(): void {
  if (typeof window !== 'undefined') {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  }
}

export { STORAGE_KEYS };
