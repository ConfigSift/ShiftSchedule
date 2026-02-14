const STORAGE_KEYS = {
  EMPLOYEES: 'crewshyft_employees',
  SHIFTS: 'crewshyft_shifts',
  TIME_OFF_REQUESTS: 'crewshyft_time_off',
  BLOCKED_PERIODS: 'crewshyft_blocked',
  DROP_REQUESTS: 'crewshyft_drop_requests',
  CHAT_MESSAGES: 'crewshyft_chat',
  CURRENT_USER: 'crewshyft_current_user',
  ACTIVE_RESTAURANT: 'crewshyft_active_restaurant',
  PERSONA: 'crewshyft_persona',
  RESTAURANTS: 'crewshyft_restaurants',
  INITIALIZED: 'crewshyft_initialized',
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
