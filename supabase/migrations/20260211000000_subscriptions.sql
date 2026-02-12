-- Stripe customer mapping (one per auth_user who is an admin/owner)
create table if not exists public.stripe_customers (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid not null unique,
  stripe_customer_id text not null unique,
  created_at       timestamptz not null default now()
);

create index if not exists stripe_customers_auth_idx
  on public.stripe_customers (auth_user_id);
create index if not exists stripe_customers_stripe_idx
  on public.stripe_customers (stripe_customer_id);

alter table public.stripe_customers enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stripe_customers' and policyname = 'stripe_customers_own_select'
  ) then
    create policy stripe_customers_own_select on public.stripe_customers
      for select
      using (auth_user_id = auth.uid());
  end if;
end $$;

-- Subscription per organization
create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null unique references public.organizations(id) on delete cascade,
  stripe_subscription_id  text not null unique,
  stripe_customer_id      text not null,
  stripe_price_id         text not null,
  status                  text not null default 'incomplete',
  quantity                int not null default 1,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists subscriptions_org_idx
  on public.subscriptions (organization_id);
create index if not exists subscriptions_stripe_sub_idx
  on public.subscriptions (stripe_subscription_id);
create index if not exists subscriptions_stripe_cust_idx
  on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'subscriptions_select'
  ) then
    create policy subscriptions_select on public.subscriptions
      for select
      using (public.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'subscriptions_admin'
  ) then
    create policy subscriptions_admin on public.subscriptions
      for all
      using (public.is_org_manager(organization_id))
      with check (public.is_org_manager(organization_id));
  end if;
end $$;
