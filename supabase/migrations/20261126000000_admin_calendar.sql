drop function public.admin_bookings_for_date(date);

create function public.admin_bookings_for_date(p_date date)
returns table (
  id uuid,
  court_id bigint,
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
    select b.id, b.court_id, c.name, b.booking_date, b.start_minute, b.duration_minutes, u.email::text
    from public.bookings b
    join public.courts c on c.id = b.court_id
    join auth.users u on u.id = b.user_id
    where b.booking_date = p_date
    order by b.start_minute, b.id;
end;
$$;

revoke all on function public.admin_bookings_for_date(date) from public, anon;
grant execute on function public.admin_bookings_for_date(date) to authenticated;

create policy "Administrators can move bookings"
  on public.bookings for update to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    and booking_date >= current_date
    and exists (select 1 from public.courts c where c.id = court_id and c.active)
  );

revoke update on public.bookings from public, anon, authenticated;
grant update (court_id, booking_date, start_minute, duration_minutes) on public.bookings to authenticated;

revoke insert, update on public.courts from public, anon, authenticated;
grant insert (name, active), update (name, active) on public.courts to authenticated;
