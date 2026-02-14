'use client';

import { create } from 'zustand';
import { Restaurant } from '../types';
import { supabase } from '../lib/supabase/client';

const CODE_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_PREFIX = 'RST-';

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

export function generateRestaurantCode(length = 8): string {
  const body = Array.from({ length }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  return `${CODE_PREFIX}${body}`;
}

interface RestaurantState {
  restaurants: Restaurant[];
  isHydrated: boolean;

  hydrate: (restaurantIds?: string[]) => Promise<void>;
  addRestaurant: (restaurant: Omit<Restaurant, 'id' | 'createdAt'>) => Promise<Restaurant>;
  getRestaurantByCode: (code: string) => Promise<Restaurant | null>;
  getRestaurantsByIds: (ids: string[]) => Restaurant[];
}

export const useRestaurantStore = create<RestaurantState>((set, get) => ({
  restaurants: [],
  isHydrated: false,

  hydrate: async (restaurantIds) => {
    if (!restaurantIds || restaurantIds.length === 0) {
      set({ restaurants: [], isHydrated: true });
      return;
    }

    const { data, error } = (await supabase
      .from('organizations')
      .select('id,name,restaurant_code,created_at')
      .in('id', restaurantIds)) as {
      data: Array<Record<string, unknown>> | null;
      error: { message: string } | null;
    };

    if (error) {
      set({ restaurants: [], isHydrated: true });
      return;
    }

    const restaurants: Restaurant[] = (data || []).map((row) => ({
      id: toStringValue(row.id),
      name: toStringValue(row.name),
      restaurantCode: toStringValue(row.restaurant_code),
      createdAt: toStringValue(row.created_at),
      createdByUserId: '',
    }));

    set({ restaurants, isHydrated: true });
  },

  addRestaurant: async (restaurant) => {
    const { data, error } = (await supabase
      .from('organizations')
      .insert({
        name: restaurant.name,
        restaurant_code: normalizeCode(restaurant.restaurantCode),
      })
      .select('id,name,restaurant_code,created_at')
      .single()) as {
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      throw error ?? new Error('Failed to create restaurant');
    }

    const newRestaurant: Restaurant = {
      id: toStringValue(data.id),
      name: toStringValue(data.name),
      restaurantCode: toStringValue(data.restaurant_code),
      createdAt: toStringValue(data.created_at),
      createdByUserId: restaurant.createdByUserId,
    };

    set((state) => ({ restaurants: [...state.restaurants, newRestaurant] }));
    return newRestaurant;
  },

  getRestaurantByCode: async (code) => {
    const { data, error } = (await supabase
      .from('organizations')
      .select('id,name,restaurant_code,created_at')
      .eq('restaurant_code', normalizeCode(code))
      .single()) as {
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      return null;
    }

    return {
      id: toStringValue(data.id),
      name: toStringValue(data.name),
      restaurantCode: toStringValue(data.restaurant_code),
      createdAt: toStringValue(data.created_at),
      createdByUserId: '',
    };
  },

  getRestaurantsByIds: (ids) => {
    const lookup = new Set(ids);
    return get().restaurants.filter((r) => lookup.has(r.id));
  },
}));

