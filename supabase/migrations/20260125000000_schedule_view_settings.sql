-- Schedule view settings (configurable timeline hour range)
create table if not exists public.schedule_view_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique,
  hour_mode text not null default 'full24', -- 'business', 'full24', 'custom'
  custom_start_hour int not null default 0,  -- 0-23
  custom_end_hour int not null default 24,   -- 1-24
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists schedule_view_settings_org_idx on public.schedule_view_settings (organization_id);

-- RLS policies
alter table public.schedule_view_settings enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_view_settings' and policyname = 'schedule_view_settings_select') then
    create policy schedule_view_settings_select on public.schedule_view_settings for select
      using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.organization_id = schedule_view_settings.organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'schedule_view_settings' and policyname = 'schedule_view_settings_write') then
    create policy schedule_view_settings_write on public.schedule_view_settings for all
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = schedule_view_settings.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      )
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = schedule_view_settings.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      );
  end if;
end $$;
