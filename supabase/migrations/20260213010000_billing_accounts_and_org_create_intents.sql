-- Customer-level billing account (one Stripe subscription per auth user)
create table if not exists public.billing_accounts (
  auth_user_id uuid primary key,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  stripe_subscription_item_id text,
  stripe_price_id text,
  status text not null default 'none',
  quantity int not null default 0,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_accounts_status_idx
  on public.billing_accounts (status);
create index if not exists billing_accounts_sub_idx
  on public.billing_accounts (stripe_subscription_id);

alter table if exists public.billing_accounts enable row level security;

do $$ begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_accounts'
      and policyname = 'billing_accounts_own_select'
  ) then
    create policy billing_accounts_own_select
      on public.billing_accounts
      for select
      using (auth_user_id = auth.uid());
  end if;
end $$;

-- Pending restaurant creation payloads (org row is created only on commit)
create table if not exists public.organization_create_intents (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  restaurant_name text not null,
  location_name text,
  timezone text,
  address text,
  city text,
  state text,
  zip text,
  status text not null default 'pending',
  organization_id uuid references public.organizations(id) on delete set null,
  desired_quantity int not null default 1,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_create_intents_status_check
    check (status in ('pending', 'completed', 'canceled', 'failed')),
  constraint organization_create_intents_desired_quantity_check
    check (desired_quantity >= 1)
);

create index if not exists organization_create_intents_auth_user_idx
  on public.organization_create_intents (auth_user_id);
create index if not exists organization_create_intents_created_idx
  on public.organization_create_intents (created_at desc);
create index if not exists organization_create_intents_status_idx
  on public.organization_create_intents (status);

alter table if exists public.organization_create_intents enable row level security;

do $$ begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'organization_create_intents'
      and policyname = 'organization_create_intents_own_select'
  ) then
    create policy organization_create_intents_own_select
      on public.organization_create_intents
      for select
      using (auth_user_id = auth.uid());
  end if;
end $$;
