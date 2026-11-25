create function public.admin_bookings_for_week(p_court_id bigint, p_start date, p_end date)
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
  if p_court_id is null or p_start is null or p_end is null or p_end <> p_start + 6 then
    raise exception 'A court and a seven-day period are required' using errcode = '22023';
  end if;

  return query
    select b.id, b.court_id, c.name, b.booking_date, b.start_minute, b.duration_minutes, u.email::text
    from public.bookings b
    join public.courts c on c.id = b.court_id
    join auth.users u on u.id = b.user_id
    where b.court_id = p_court_id and b.booking_date between p_start and p_end
    order by b.booking_date, b.start_minute, b.id;
end;
$$;

revoke all on function public.admin_bookings_for_week(bigint, date, date) from public, anon;
grant execute on function public.admin_bookings_for_week(bigint, date, date) to authenticated;
