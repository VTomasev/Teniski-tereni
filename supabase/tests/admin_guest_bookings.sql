begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  player_id uuid := gen_random_uuid();
  court_id bigint;
  inactive_court bigint;
  guest_booking uuid;
  future_date date := (statement_timestamp() at time zone 'Europe/Zagreb')::date + 10;
  affected integer;
begin
  insert into auth.users (id, email) values
    (admin_id, admin_id::text || '@example.invalid'),
    (player_id, player_id::text || '@example.invalid');
  insert into public.admin_users values (admin_id);
  insert into public.courts (name) values ('Guest court ' || admin_id) returning id into court_id;
  insert into public.courts (name, active) values ('Inactive guest court ' || admin_id, false)
    returning id into inactive_court;

  perform set_config('request.jwt.claim.sub', player_id::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.admin_create_guest_booking(court_id, future_date, 600, 60, 'Guest');
    raise exception 'Regular user can create guest bookings';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
    values (court_id, future_date, 600, 60, null);
    raise exception 'Regular user can insert guest bookings directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.booking_guests;
    raise exception 'Regular user can read guest names';
  exception when insufficient_privilege then null;
  end;
  insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
  values (court_id, future_date, 720, 60, player_id);

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  begin
    perform public.admin_create_guest_booking(court_id, future_date, 600, 60, '   ');
    raise exception 'Empty guest name was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_create_guest_booking(inactive_court, future_date, 600, 60, 'Guest');
    raise exception 'Booking on an inactive court was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_create_guest_booking(court_id, future_date - 20, 600, 60, 'Guest');
    raise exception 'Booking in the past was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_create_guest_booking(court_id, future_date, 690, 60, 'Guest');
    raise exception 'Overlap with registered user was accepted';
  exception when exclusion_violation then null;
  end;
  guest_booking := public.admin_create_guest_booking(court_id, future_date, 600, 60, '  Guest player  ');
  if not exists (
    select 1 from public.admin_bookings_for_week(court_id, future_date, future_date + 6) b
    where b.id = guest_booking and b.guest_name = 'Guest player' and b.user_email is null
  ) then raise exception 'Guest is missing from admin weekly schedule'; end if;
  if not exists (
    select 1 from public.admin_bookings_for_date(future_date) b
    where b.id = guest_booking and b.guest_name = 'Guest player'
  ) then raise exception 'Guest is missing from admin daily schedule'; end if;

  perform set_config('request.jwt.claim.sub', player_id::text, true);
  if not exists (select 1 from public.bookings where id = guest_booking and user_id is null) then
    raise exception 'Guest booking is missing from public availability';
  end if;
  begin
    insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
    values (court_id, future_date, 630, 60, player_id);
    raise exception 'Registered booking overlaps a guest booking';
  exception when exclusion_violation then null;
  end;
  delete from public.bookings where id = guest_booking;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Regular user can cancel guest booking'; end if;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  update public.bookings set start_minute = 840 where id = guest_booking;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Admin cannot move guest booking'; end if;
  delete from public.bookings where id = guest_booking;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Admin cannot cancel guest booking'; end if;
end
$$;

rollback;

select 'Admin guest booking tests passed; all test data rolled back' as result;
