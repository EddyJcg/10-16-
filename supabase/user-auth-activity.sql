-- Supabase Dashboard > SQL Editor에서 실행하세요.
create extension if not exists pg_cron;

create table if not exists public.user_auth_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null check (char_length(email) <= 254),
  event_type text not null check (event_type in ('login','logout')),
  occurred_at timestamptz not null default now()
);

create index if not exists user_auth_activity_time_idx
  on public.user_auth_activity (occurred_at desc);
create index if not exists user_auth_activity_email_time_idx
  on public.user_auth_activity (email, occurred_at desc);

alter table public.user_auth_activity enable row level security;
revoke all on public.user_auth_activity from public, anon, authenticated;
grant select, insert, delete on public.user_auth_activity to service_role;

delete from public.user_auth_activity
where occurred_at < now() - interval '1 year';

do $$
declare existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'purge-expired-user-auth-activity'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
  perform cron.schedule(
    'purge-expired-user-auth-activity',
    '17 3 * * *',
    $job$delete from public.user_auth_activity where occurred_at < now() - interval '1 year'$job$
  );
end;
$$;
