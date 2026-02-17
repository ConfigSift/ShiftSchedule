-- Time-off cancel upgrades: add canceled_at, normalize status value, and tighten requester update policy.

alter table if exists public.time_off_requests
  add column if not exists canceled_at timestamptz;

update public.time_off_requests
set status = 'CANCELED'
where upper(coalesce(status, '')) = 'CANCELLED';

update public.time_off_requests
set canceled_at = coalesce(canceled_at, updated_at, created_at, now())
where upper(coalesce(status, '')) = 'CANCELED'
  and canceled_at is null;

alter table if exists public.time_off_requests
  drop constraint if exists time_off_requests_status_check;

alter table if exists public.time_off_requests
  add constraint time_off_requests_status_check
  check (upper(coalesce(status, '')) in ('PENDING', 'APPROVED', 'DENIED', 'CANCELED'));

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'time_off_requests_canceled_at_required'
  ) then
    alter table public.time_off_requests
      drop constraint time_off_requests_canceled_at_required;
  end if;

  alter table public.time_off_requests
    add constraint time_off_requests_canceled_at_required
    check (
      upper(coalesce(status, '')) <> 'CANCELED'
      or canceled_at is not null
    );
end $$;

drop policy if exists "Time off updatable by requester" on public.time_off_requests;
create policy "Time off updatable by requester"
  on public.time_off_requests
  for update
  using (
    (
      auth.uid() = requester_auth_user_id
      or auth.uid() = auth_user_id
      or auth.uid() = requester_user_id
      or exists (
        select 1
        from public.users u
        where u.id = time_off_requests.user_id
          and u.auth_user_id = auth.uid()
      )
    )
    and upper(coalesce(status, '')) in ('PENDING', 'APPROVED')
    and start_date > current_date
  )
  with check (
    (
      auth.uid() = requester_auth_user_id
      or auth.uid() = auth_user_id
      or auth.uid() = requester_user_id
      or exists (
        select 1
        from public.users u
        where u.id = time_off_requests.user_id
          and u.auth_user_id = auth.uid()
      )
    )
    and upper(coalesce(status, '')) = 'CANCELED'
    and canceled_at is not null
  );

drop policy if exists "Time off readable by requester or managers" on public.time_off_requests;
create policy "Time off readable by requester or managers"
  on public.time_off_requests
  for select
  using (
    auth.uid() = requester_auth_user_id
    or auth.uid() = auth_user_id
    or auth.uid() = requester_user_id
    or exists (
      select 1
      from public.users u
      where u.id = time_off_requests.user_id
        and u.auth_user_id = auth.uid()
    )
    or public.is_org_manager(time_off_requests.organization_id)
  );

drop policy if exists "Time off updatable by managers" on public.time_off_requests;
create policy "Time off updatable by managers"
  on public.time_off_requests
  for update
  using (public.is_org_manager(time_off_requests.organization_id))
  with check (public.is_org_manager(time_off_requests.organization_id));
