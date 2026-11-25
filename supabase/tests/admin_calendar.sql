begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  player_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  court_one bigint;
  court_two bigint;
  first_booking uuid;
  affected integer;
begin
  insert into auth.users (id, email) values
    (admin_id, admin_id::text || '@example.invalid'),
    (player_id, player_id::text || '@example.invalid'),
    (other_id, other_id::text || '@example.invalid');
  insert into public.admin_users values (admin_id);
  insert into public.courts (name) values ('Calendar one ' || admin_id) returning id into court_one;
  insert into public.courts (name) values ('Calendar two ' || admin_id) returning id into court_two;
  insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
  values (court_one, current_date + 10, 600, 60, player_id) returning id into first_booking;
  insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
  values (court_two, current_date + 10, 630, 60, player_id);

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  perform set_config('role', 'authenticated', true);
  update public.bookings set start_minute = 720 where id = first_booking;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Another user can move bookings'; end if;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  if not exists (select 1 from public.admin_bookings_for_date(current_date + 10) b
                 where b.id = first_booking and b.court_id = court_one) then
    raise exception 'Admin calendar lacks court identifier';
  end if;
  begin
    update public.bookings set court_id = court_two, start_minute = 600 where id = first_booking;
    raise exception 'Conflicting move was accepted';
  exception when exclusion_violation then null;
  end;
  begin
    update public.bookings set booking_date = current_date - 1 where id = first_booking;
    raise exception 'Move to past date was accepted';
  exception when insufficient_privilege then null;
  end;
  update public.courts set active = false where id = court_two;
  begin
    update public.bookings set court_id = court_two, start_minute = 720 where id = first_booking;
    raise exception 'Move to inactive court was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.bookings set user_id = admin_id where id = first_booking;
    raise exception 'Administrator can change booking owner';
  exception when insufficient_privilege then null;
  end;
  update public.courts set active = true where id = court_two;
  update public.bookings set court_id = court_two, start_minute = 720 where id = first_booking;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Valid move failed'; end if;
  if not exists (select 1 from public.bookings where id = first_booking and user_id = player_id
                 and court_id = court_two and start_minute = 720) then
    raise exception 'Booking owner or moved time is incorrect';
  end if;
end
$$;

rollback;

select 'Admin calendar tests passed; all test data rolled back' as result;
