create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create function public.admin_bookings_for_date(p_date date)
returns table (
  id uuid,
  court_name text,
  booking_date date,
  start_minute integer,
  duration_minutes integer,
  user_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
    select b.id, c.name, b.booking_date, b.start_minute, b.duration_minutes, u.email::text
    from public.bookings b
    join public.courts c on c.id = b.court_id
    join auth.users u on u.id = b.user_id
    where b.booking_date = p_date
    order by b.start_minute, b.id;
end;
$$;

revoke all on function public.admin_bookings_for_date(date) from public, anon;
grant execute on function public.admin_bookings_for_date(date) to authenticated;

drop policy "Authenticated users can view active courts" on public.courts;
create policy "Users can view available and booked courts"
  on public.courts for select to authenticated
  using (
    active
    or public.is_admin()
    or exists (
      select 1 from public.bookings b
      where b.court_id = courts.id and b.user_id = auth.uid()
    )
  );

create policy "Administrators can add courts"
  on public.courts for insert to authenticated
  with check (public.is_admin());

create policy "Administrators can edit courts"
  on public.courts for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant insert (name, active), update (name, active) on public.courts to authenticated;
grant usage on sequence public.courts_id_seq to authenticated;

drop policy "Users can create their own future bookings" on public.bookings;
create policy "Users can create their own future bookings on active courts"
  on public.bookings for insert to authenticated
  with check (
    auth.uid() = user_id
    and booking_date >= current_date
    and exists (select 1 from public.courts c where c.id = court_id and c.active)
  );

create policy "Administrators can cancel bookings"
  on public.bookings for delete to authenticated
  using (public.is_admin());
