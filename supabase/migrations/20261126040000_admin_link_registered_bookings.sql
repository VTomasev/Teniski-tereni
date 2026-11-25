create or replace function public.admin_create_guest_booking(
  p_court_id bigint, p_date date, p_start_minute integer, p_duration_minutes integer, p_guest_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_id uuid;
  matched_user_id uuid;
  matching_users integer;
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

  select count(*) into matching_users from auth.users u
  where lower(u.email) = lower(btrim(p_guest_name));
  if matching_users > 1 then
    raise exception 'Multiple accounts match this email' using errcode = '22023';
  elsif matching_users = 1 then
    select u.id into matched_user_id from auth.users u
    where lower(u.email) = lower(btrim(p_guest_name));
  end if;

  insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
  values (p_court_id, p_date, p_start_minute, p_duration_minutes, matched_user_id)
  returning id into booking_id;
  if matched_user_id is null then
    insert into public.booking_guests (booking_id, guest_name) values (booking_id, btrim(p_guest_name));
  end if;
  return booking_id;
end;
$$;
