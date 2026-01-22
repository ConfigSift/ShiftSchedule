'use client';

import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import { UserProfile, UserRole } from '../types';
import { clearStorage, loadFromStorage, saveToStorage, STORAGE_KEYS } from '../utils/storage';
import { getUserRole } from '../utils/role';
import { normalizeUserRow } from '../utils/userMapper';

interface AuthState {
  currentUser: UserProfile | null;
  userProfiles: UserProfile[];
  isInitialized: boolean;
  activeRestaurantId: string | null;
  activeRestaurantCode: string | null;

  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  setActiveOrganization: (organizationId: string | null, restaurantCode?: string | null) => void;
  clearActiveOrganization: () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: { fullName: string; phone?: string | null }) => Promise<{ success: boolean; error?: string }>;
}

function resolveActiveRestaurantId(
  profile: UserProfile,
  profiles: UserProfile[],
  current: string | null
): string | null {
  if (current && profiles.some((p) => p.organizationId === current)) {
    return current;
  }

  if (profiles.length === 1) {
    return profiles[0].organizationId;
  }

  if (getUserRole(profile.role) === 'EMPLOYEE') {
    return profiles[0]?.organizationId ?? null;
  }

  return null;
}

async function fetchUserProfiles(authUserId: string) {
  const { data, error } = (await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)) as {
    data: Array<Record<string, any>> | null;
    error: { message: string } | null;
  };

  if (error) {
    throw error;
  }

  const profiles: UserProfile[] = (data || []).map((row) => {
    const normalized = normalizeUserRow(row);
    return {
      id: normalized.id,
      authUserId: normalized.authUserId ?? '',
      organizationId: normalized.organizationId,
      email: normalized.email,
      phone: normalized.phone,
      fullName: normalized.fullName,
      role: normalized.role,
      jobs: normalized.jobs,
    };
  });

  return profiles;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  userProfiles: [],
  isInitialized: false,
  activeRestaurantId: loadFromStorage<{ id: string | null; code: string | null }>(
    STORAGE_KEYS.ACTIVE_RESTAURANT,
    { id: null, code: null }
  ).id,
  activeRestaurantCode: loadFromStorage<{ id: string | null; code: string | null }>(
    STORAGE_KEYS.ACTIVE_RESTAURANT,
    { id: null, code: null }
  ).code,

  init: async () => {
    const { data } = await supabase.auth.getSession();
    const sessionUser = data.session?.user ?? null;
    if (!sessionUser) {
      set({
        currentUser: null,
        userProfiles: [],
        isInitialized: true,
        activeRestaurantId: null,
        activeRestaurantCode: null,
      });
      return;
    }

    try {
      const profiles = await fetchUserProfiles(sessionUser.id);
      const primaryProfile = profiles[0] ?? null;
      if (!primaryProfile) {
        set({
          currentUser: null,
          userProfiles: [],
          isInitialized: true,
          activeRestaurantId: null,
          activeRestaurantCode: null,
        });
        return;
      }
      const activeRestaurantId = resolveActiveRestaurantId(primaryProfile, profiles, get().activeRestaurantId);
      const activeProfile =
        profiles.find((profile) => profile.organizationId === activeRestaurantId) ?? primaryProfile;
      set({
        currentUser: activeProfile,
        userProfiles: profiles,
        isInitialized: true,
        activeRestaurantId,
      });
    } catch {
      set({
        currentUser: null,
        userProfiles: [],
        isInitialized: true,
        activeRestaurantId: null,
        activeRestaurantCode: null,
      });
    }
  },

  refreshProfile: async () => {
    const authUserId = get().currentUser?.authUserId;
    if (!authUserId) return;

    const profiles = await fetchUserProfiles(authUserId);
    const primaryProfile = profiles[0] ?? null;
    if (!primaryProfile) return;
    const activeRestaurantId = resolveActiveRestaurantId(primaryProfile, profiles, get().activeRestaurantId);
    const activeProfile =
      profiles.find((profile) => profile.organizationId === activeRestaurantId) ?? primaryProfile;
    set({ currentUser: activeProfile, userProfiles: profiles, activeRestaurantId });
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error.message };
    }

    await get().init();
    return {};
  },

  signOut: async () => {
    await supabase.auth.signOut();
    clearStorage();
    set({
      currentUser: null,
      userProfiles: [],
      isInitialized: true,
      activeRestaurantId: null,
      activeRestaurantCode: null,
    });
  },

  setActiveOrganization: (organizationId, restaurantCode = null) => {
    saveToStorage(STORAGE_KEYS.ACTIVE_RESTAURANT, {
      id: organizationId,
      code: restaurantCode ?? null,
    });
    set({ activeRestaurantId: organizationId, activeRestaurantCode: restaurantCode ?? null });
  },
  clearActiveOrganization: () => {
    saveToStorage(STORAGE_KEYS.ACTIVE_RESTAURANT, {
      id: null,
      code: null,
    });
    set({ activeRestaurantId: null, activeRestaurantCode: null });
  },
  updateProfile: async (data) => {
    const current = get().currentUser;
    if (!current) return { success: false, error: 'No user session.' };
    const response = await fetch('/api/me/update-profile', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: data.fullName,
        phone: data.phone ?? '',
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      return { success: false, error: payload.error || 'Unable to update profile.' };
    }
    await get().refreshProfile();
    return { success: true };
  },
}));
