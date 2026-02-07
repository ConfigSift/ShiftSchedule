-- Ensure shifts_unique_weekly includes schedule_state so draft/published can coexist.
do $$
declare
  constraint_def text;
  cols text;
  indexdef text;
begin
  select pg_get_constraintdef(c.oid)
    into constraint_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'shifts'
    and c.conname = 'shifts_unique_weekly';

  if constraint_def is not null then
    execute 'alter table public.shifts drop constraint shifts_unique_weekly';
    cols := regexp_replace(constraint_def, '^UNIQUE \\((.*)\\)$', '\\1');
    execute format(
      'create unique index if not exists shifts_unique_weekly on public.shifts (%s, schedule_state)',
      cols
    );
    return;
  end if;

  select indexdef
    into indexdef
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'shifts_unique_weekly';

  if indexdef is not null then
    execute 'drop index if exists public.shifts_unique_weekly';
    indexdef := regexp_replace(indexdef, '\\)$', ', schedule_state)');
    execute indexdef;
  else
    execute 'create unique index if not exists shifts_unique_weekly on public.shifts (organization_id, user_id, shift_date, start_time, end_time, schedule_state)';
  end if;
end $$;
