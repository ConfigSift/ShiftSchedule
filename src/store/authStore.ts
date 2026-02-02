'use client';

import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import { UserProfile, UserRole } from '../types';
import { clearStorage, loadFromStorage, saveToStorage, STORAGE_KEYS } from '../utils/storage';
import { getUserRole } from '../utils/role';
import { normalizeUserRow } from '../utils/userMapper';
import { apiFetch } from '../lib/apiClient';

interface PendingInvitation {
  id: string;
  organizationId: string;
  organizationName: string;
  restaurantCode: string;
  email: string;
  role: string;
  status: string;
}

interface AuthState {
  currentUser: UserProfile | null;
  userProfiles: UserProfile[];
  accessibleRestaurants: Array<{ id: string; name: string; restaurantCode: string; role: string }>;
  pendingInvitations: PendingInvitation[];
  isInitialized: boolean;
  activeRestaurantId: string | null;
  activeRestaurantCode: string | null;

  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  setActiveOrganization: (organizationId: string | null, restaurantCode?: string | null) => void;
  clearActiveOrganization: () => void;
  refreshProfile: () => Promise<void>;
  refreshInvitations: () => Promise<void>;
  updateProfile: (data: { fullName: string; phone?: string | null; email?: string | null }) => Promise<{ success: boolean; error?: string }>;
}

/** Fetches pending invitations for the current user */
async function fetchPendingInvitations(): Promise<PendingInvitation[]> {
  const result = await apiFetch('/api/auth/invitations');
  if (!result.ok) return [];
  const rows = Array.isArray(result.data?.invitations) ? result.data.invitations : [];
  return rows.map((invite: Record<string, any>) => ({
    id: String(invite.id),
    organizationId: String(invite.organization_id ?? invite.organizationId ?? ''),
    organizationName: String(invite.organization_name ?? invite.organizationName ?? ''),
    restaurantCode: String(invite.restaurant_code ?? invite.restaurantCode ?? ''),
    email: String(invite.email ?? ''),
    role: String(invite.role ?? 'employee'),
    status: String(invite.status ?? 'pending'),
  }));
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
      hourlyPay: normalized.hourlyPay,
      jobPay: normalized.jobPay,
      employeeNumber: normalized.employeeNumber ?? null,
      realEmail: normalized.realEmail ?? null,
    };
  });

  return profiles;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  userProfiles: [],
  accessibleRestaurants: [],
  pendingInvitations: [],
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
        pendingInvitations: [],
        isInitialized: true,
        activeRestaurantId: null,
        activeRestaurantCode: null,
      });
      return;
    }

    try {
      // Fetch profiles, restaurants, and invitations in parallel
      const [profiles, restaurantsResult, invitations] = await Promise.all([
        fetchUserProfiles(sessionUser.id),
        apiFetch('/api/auth/restaurants'),
        fetchPendingInvitations(),
      ]);

      const restaurantsPayload = restaurantsResult.ok ? restaurantsResult.data : null;
      const restaurants = Array.isArray(restaurantsPayload)
        ? restaurantsPayload
        : restaurantsPayload?.restaurants ?? [];
      const accessibleRestaurants: Array<{ id: string; name: string; restaurantCode: string; role: string }> = restaurants.map(
        (row: any) => ({
          id: row.id,
          name: row.name,
          restaurantCode: row.restaurant_code,
          role: row.role,
        })
      );

      const primaryProfile = profiles[0] ?? null;
      if (!primaryProfile) {
        set({
          currentUser: null,
          userProfiles: [],
          accessibleRestaurants,
          pendingInvitations: invitations,
          isInitialized: true,
          activeRestaurantId: null,
          activeRestaurantCode: null,
        });
        return;
      }

      // Read stored selection from localStorage (already loaded into state at creation)
      const storedActiveId = get().activeRestaurantId;
      let activeRestaurantId: string | null = null;
      let activeRestaurantCode: string | null = null;

      // ROUTING RULES:
      // 1. If memberships == 1: auto-select
      // 2. If memberships == 0: no selection possible
      // 3. If memberships > 1: validate stored selection, keep if valid, else null (DO NOT auto-select)
      if (accessibleRestaurants.length === 1) {
        // Rule 3: Single restaurant - auto-select
        activeRestaurantId = accessibleRestaurants[0].id;
        activeRestaurantCode = accessibleRestaurants[0].restaurantCode;
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[auth:init] single restaurant, auto-selecting:', activeRestaurantId);
        }
      } else if (accessibleRestaurants.length > 1) {
        // Rule 4: Multiple restaurants - validate stored ID, keep if valid
        const storedIsValid = storedActiveId && accessibleRestaurants.some((r) => r.id === storedActiveId);
        if (storedIsValid) {
          activeRestaurantId = storedActiveId;
          activeRestaurantCode = accessibleRestaurants.find((r) => r.id === storedActiveId)?.restaurantCode ?? null;
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.debug('[auth:init] multiple restaurants, stored selection valid:', activeRestaurantId);
          }
        } else {
          // Stored ID is invalid or missing - DO NOT auto-select first
          activeRestaurantId = null;
          activeRestaurantCode = null;
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.debug('[auth:init] multiple restaurants, no valid stored selection, clearing');
          }
        }
      }
      // else: accessibleRestaurants.length === 0, leave null

      const activeProfile =
        profiles.find((profile) => profile.organizationId === activeRestaurantId) ?? primaryProfile;

      set({
        currentUser: activeProfile,
        userProfiles: profiles,
        accessibleRestaurants,
        pendingInvitations: invitations,
        isInitialized: true,
        activeRestaurantId,
        activeRestaurantCode,
      });

      // Persist valid selection to localStorage
      if (activeRestaurantId && activeRestaurantCode) {
        saveToStorage(STORAGE_KEYS.ACTIVE_RESTAURANT, {
          id: activeRestaurantId,
          code: activeRestaurantCode,
        });
      }
    } catch {
      set({
        currentUser: null,
        userProfiles: [],
        accessibleRestaurants: [],
        pendingInvitations: [],
        isInitialized: true,
        activeRestaurantId: null,
        activeRestaurantCode: null,
      });
    }
  },

  refreshProfile: async () => {
    let authUserId = get().currentUser?.authUserId;
    if (!authUserId) {
      const { data } = await supabase.auth.getSession();
      authUserId = data.session?.user?.id;
    }
    if (!authUserId) return;

    // Fetch profiles, restaurants, and invitations in parallel
    const [profiles, restaurantsResult, invitations] = await Promise.all([
      fetchUserProfiles(authUserId),
      apiFetch('/api/auth/restaurants'),
      fetchPendingInvitations(),
    ]);

    const restaurantsPayload = restaurantsResult.ok ? restaurantsResult.data : null;
    const restaurants = Array.isArray(restaurantsPayload)
      ? restaurantsPayload
      : restaurantsPayload?.restaurants ?? [];
    const accessibleRestaurants: Array<{ id: string; name: string; restaurantCode: string; role: string }> = restaurants.map(
      (row: any) => ({
        id: row.id,
        name: row.name,
        restaurantCode: row.restaurant_code,
        role: row.role,
      })
    );

    const primaryProfile = profiles[0] ?? null;
    if (!primaryProfile) return;

    const storedActiveId = get().activeRestaurantId;
    let activeRestaurantId: string | null = null;
    let activeRestaurantCode: string | null = null;

    // Same logic as init(): validate stored selection, don't auto-select for multiple
    if (accessibleRestaurants.length === 1) {
      activeRestaurantId = accessibleRestaurants[0].id;
      activeRestaurantCode = accessibleRestaurants[0].restaurantCode;
    } else if (accessibleRestaurants.length > 1) {
      const storedIsValid = storedActiveId && accessibleRestaurants.some((r) => r.id === storedActiveId);
      if (storedIsValid) {
        activeRestaurantId = storedActiveId;
        activeRestaurantCode = accessibleRestaurants.find((r) => r.id === storedActiveId)?.restaurantCode ?? null;
      }
      // else: leave null, don't auto-select
    }

    const activeProfile =
      profiles.find((profile) => profile.organizationId === activeRestaurantId) ?? primaryProfile;
    set({
      currentUser: activeProfile,
      userProfiles: profiles,
      accessibleRestaurants,
      pendingInvitations: invitations,
      activeRestaurantId,
      activeRestaurantCode,
    });
  },

  refreshInvitations: async () => {
    const invitations = await fetchPendingInvitations();
    set({ pendingInvitations: invitations });
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
      accessibleRestaurants: [],
      pendingInvitations: [],
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
    const result = await apiFetch('/api/me/update-profile', {
      method: 'POST',
      json: {
        fullName: data.fullName,
        phone: data.phone ?? '',
        email: data.email ?? null,
      },
    });
    if (!result.ok) {
      return {
        success: false,
        error: result.error || 'Unable to update profile.',
      };
    }
    await get().refreshProfile();
    return { success: true };
  },
}));
