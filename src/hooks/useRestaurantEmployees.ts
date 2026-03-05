'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { type Employee } from '@/types';
import { normalizeUserRow } from '@/utils/userMapper';

export type RestaurantEmployee = Employee & {
  full_name: string;
};

export function useRestaurantEmployees(restaurantId: string | null | undefined) {
  const scopedRestaurantId = String(restaurantId ?? '').trim();

  return useQuery<RestaurantEmployee[]>({
    queryKey: ['restaurantEmployees', scopedRestaurantId],
    enabled: scopedRestaurantId.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const usersRes = await supabase
        .from('users')
        .select('*')
        .eq('organization_id', scopedRestaurantId)
        .order('email', { ascending: true });

      if (usersRes.error) {
        console.error('Employee query error:', JSON.stringify(usersRes.error, null, 2));
        throw usersRes.error;
      }

      const employees = ((usersRes.data ?? []) as Array<Record<string, unknown>>)
        .map((row) => {
          const normalized = normalizeUserRow(row);
          const userRole: Employee['userRole'] = normalized.role;
          const section: Employee['section'] =
            userRole === 'ADMIN' || userRole === 'MANAGER' ? 'management' : 'front';
          const fullName = String(normalized.fullName ?? '').trim() || 'Unknown';

          return {
            id: normalized.id,
            full_name: fullName,
            name: fullName,
            section,
            userRole,
            restaurantId: scopedRestaurantId,
            profile: {
              email: normalized.email ?? undefined,
              phone: normalized.phone ?? undefined,
            },
            isActive: true,
            jobs: normalized.jobs ?? [],
            hourlyPay: normalized.hourlyPay,
            jobPay: normalized.jobPay,
            employeeNumber: normalized.employeeNumber ?? null,
            email: '',
            phone: normalized.phone ?? undefined,
            realEmail: normalized.realEmail ?? undefined,
          } satisfies RestaurantEmployee;
        })
        .filter((employee) => employee.id.length > 0);

      return employees.sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });
}
