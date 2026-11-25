alter table public.bookings alter column user_id drop not null;

create table public.booking_guests (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  guest_name text not null check (char_length(btrim(guest_name)) between 1 and 120)
);

alter table public.booking_guests enable row level security;
revoke all on public.booking_guests from public, anon, authenticated;

create function public.admin_create_guest_booking(
  p_court_id bigint, p_date date, p_start_minute integer, p_duration_minutes integer, p_guest_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_guest_name is null or char_length(btrim(p_guest_name)) not between 1 and 120
     or p_court_id is null or p_date is null or p_start_minute is null or p_duration_minutes is null then
    raise exception 'Booking details and a guest name are required' using errcode = '22023';
  end if;
  if (p_date + p_start_minute * interval '1 minute') at time zone 'Europe/Zagreb' <= statement_timestamp() then
    raise exception 'Booking must start in the future' using errcode = '42501';
  end if;
  perform 1 from public.courts where id = p_court_id and active for share;
  if not found then
    raise exception 'Court is not active' using errcode = '42501';
  end if;

  insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
  values (p_court_id, p_date, p_start_minute, p_duration_minutes, null)
  returning id into booking_id;
  insert into public.booking_guests (booking_id, guest_name) values (booking_id, btrim(p_guest_name));
  return booking_id;
end;
$$;

revoke all on function public.admin_create_guest_booking(bigint, date, integer, integer, text) from public, anon;
grant execute on function public.admin_create_guest_booking(bigint, date, integer, integer, text) to authenticated;

drop function public.admin_bookings_for_week(bigint, date, date);
create function public.admin_bookings_for_week(p_court_id bigint, p_start date, p_end date)
returns table (
  id uuid, court_id bigint, court_name text, booking_date date, start_minute integer,
  duration_minutes integer, user_email text, guest_name text
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
    select b.id, b.court_id, c.name, b.booking_date, b.start_minute, b.duration_minutes,
           u.email::text, g.guest_name
    from public.bookings b
    join public.courts c on c.id = b.court_id
    left join auth.users u on u.id = b.user_id
    left join public.booking_guests g on g.booking_id = b.id
    where b.court_id = p_court_id and b.booking_date between p_start and p_end
    order by b.booking_date, b.start_minute, b.id;
end;
$$;
revoke all on function public.admin_bookings_for_week(bigint, date, date) from public, anon;
grant execute on function public.admin_bookings_for_week(bigint, date, date) to authenticated;

drop function public.admin_bookings_for_date(date);
create function public.admin_bookings_for_date(p_date date)
returns table (
  id uuid, court_id bigint, court_name text, booking_date date, start_minute integer,
  duration_minutes integer, user_email text, guest_name text
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
    select b.id, b.court_id, c.name, b.booking_date, b.start_minute, b.duration_minutes,
           u.email::text, g.guest_name
    from public.bookings b
    join public.courts c on c.id = b.court_id
    left join auth.users u on u.id = b.user_id
    left join public.booking_guests g on g.booking_id = b.id
    where b.booking_date = p_date
    order by b.start_minute, b.id;
end;
$$;
revoke all on function public.admin_bookings_for_date(date) from public, anon;
grant execute on function public.admin_bookings_for_date(date) to authenticated;
