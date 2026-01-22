-- Chat rooms/messages
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_rooms_org_idx on public.chat_rooms (organization_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  organization_id uuid not null,
  author_auth_user_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages (room_id);
create index if not exists chat_messages_org_idx on public.chat_messages (organization_id);

-- Blocked day requests
create table if not exists public.blocked_day_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid,
  scope text not null default 'EMPLOYEE',
  start_date date not null,
  end_date date not null,
  reason text not null,
  status text not null default 'PENDING',
  manager_note text,
  requested_by_auth_user_id uuid not null,
  reviewed_by_auth_user_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blocked_day_org_idx on public.blocked_day_requests (organization_id);
create index if not exists blocked_day_user_idx on public.blocked_day_requests (user_id);

-- Business hours
create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  day_of_week int not null,
  open_time time,
  close_time time,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists business_hours_org_idx on public.business_hours (organization_id);

-- Users hourly pay
alter table if exists public.users
  add column if not exists hourly_pay numeric not null default 0;

-- RLS policies
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.blocked_day_requests enable row level security;
alter table public.business_hours enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_rooms' and policyname = 'chat_rooms_select') then
    create policy chat_rooms_select on public.chat_rooms for select
      using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.organization_id = chat_rooms.organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_rooms' and policyname = 'chat_rooms_insert') then
    create policy chat_rooms_insert on public.chat_rooms for insert
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = chat_rooms.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'chat_messages_select') then
    create policy chat_messages_select on public.chat_messages for select
      using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.organization_id = chat_messages.organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'chat_messages_insert') then
    create policy chat_messages_insert on public.chat_messages for insert
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = chat_messages.organization_id
        )
        and exists (
          select 1 from public.chat_rooms r
          where r.id = chat_messages.room_id
            and r.organization_id = chat_messages.organization_id
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blocked_day_requests' and policyname = 'blocked_day_select') then
    create policy blocked_day_select on public.blocked_day_requests for select
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = blocked_day_requests.organization_id
            and (
              lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
              or blocked_day_requests.requested_by_auth_user_id = auth.uid()
            )
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blocked_day_requests' and policyname = 'blocked_day_insert') then
    create policy blocked_day_insert on public.blocked_day_requests for insert
      with check (
        blocked_day_requests.requested_by_auth_user_id = auth.uid()
        and exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = blocked_day_requests.organization_id
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blocked_day_requests' and policyname = 'blocked_day_update') then
    create policy blocked_day_update on public.blocked_day_requests for update
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = blocked_day_requests.organization_id
            and (
              lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
              or blocked_day_requests.requested_by_auth_user_id = auth.uid()
            )
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_hours' and policyname = 'business_hours_select') then
    create policy business_hours_select on public.business_hours for select
      using (exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.organization_id = business_hours.organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_hours' and policyname = 'business_hours_write') then
    create policy business_hours_write on public.business_hours for all
      using (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = business_hours.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      )
      with check (
        exists (
          select 1 from public.users u
          where u.auth_user_id = auth.uid()
            and u.organization_id = business_hours.organization_id
            and lower(coalesce(u.account_type, u.role, '')) in ('admin','manager')
        )
      );
  end if;
end $$;
