begin;

do $$
declare
  player_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  court_one bigint;
  court_two bigint;
  inactive_court bigint;
  booking_id uuid;
  past_booking uuid;
  future_date date := (statement_timestamp() at time zone 'Europe/Zagreb')::date + 10;
  affected integer;
begin
  insert into auth.users (id, email) values
    (player_id, player_id::text || '@example.invalid'),
    (other_id, other_id::text || '@example.invalid');
  insert into public.courts (name) values ('Player edit one ' || player_id) returning id into court_one;
  insert into public.courts (name) values ('Player edit two ' || player_id) returning id into court_two;
  insert into public.courts (name, active) values ('Player edit inactive ' || player_id, false)
    returning id into inactive_court;
  insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
  values (court_one, future_date, 600, 60, player_id) returning id into booking_id;
  insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
  values (court_two, future_date, 720, 60, other_id);
  insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
  values (court_one, future_date - 20, 600, 60, player_id) returning id into past_booking;

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  perform set_config('role', 'authenticated', true);
  update public.bookings set start_minute = 840 where id = booking_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Another user can edit the booking'; end if;

  perform set_config('request.jwt.claim.sub', player_id::text, true);
  begin
    update public.bookings set court_id = court_two, start_minute = 690 where id = booking_id;
    raise exception 'Overlapping move was accepted';
  exception when exclusion_violation then null;
  end;
  begin
    update public.bookings set court_id = inactive_court where id = booking_id;
    raise exception 'Move to inactive court was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.bookings set booking_date = future_date - 20 where id = booking_id;
    raise exception 'Move to past was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.bookings set user_id = other_id where id = booking_id;
    raise exception 'Owner can transfer the booking';
  exception when insufficient_privilege then null;
  end;
  update public.bookings set booking_date = future_date, start_minute = 840 where id = past_booking;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Past booking can be moved'; end if;
  update public.bookings set court_id = court_two, booking_date = future_date + 1,
    start_minute = 840, duration_minutes = 90 where id = booking_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Valid own edit failed'; end if;
  if not exists (select 1 from public.bookings where id = booking_id and user_id = player_id
                 and court_id = court_two and booking_date = future_date + 1
                 and start_minute = 840 and duration_minutes = 90) then
    raise exception 'Edited booking has incorrect details';
  end if;
  delete from public.bookings where id = booking_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner cannot cancel booking'; end if;
end
$$;

rollback;

select 'User booking edit tests passed; all test data rolled back' as result;
