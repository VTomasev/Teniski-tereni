begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  player_id uuid := gen_random_uuid();
  court_one bigint;
  court_two bigint;
  start_date date := (statement_timestamp() at time zone 'Europe/Zagreb')::date + 10;
  total integer;
begin
  insert into auth.users (id, email) values
    (admin_id, admin_id::text || '@example.invalid'),
    (player_id, player_id::text || '@example.invalid');
  insert into public.admin_users values (admin_id);
  insert into public.courts (name) values ('Weekly one ' || admin_id) returning id into court_one;
  insert into public.courts (name) values ('Weekly two ' || admin_id) returning id into court_two;
  insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
  values
    (court_one, start_date, 600, 60, player_id),
    (court_one, start_date + 6, 600, 60, player_id),
    (court_one, start_date + 7, 600, 60, player_id),
    (court_two, start_date, 600, 60, player_id);

  perform set_config('request.jwt.claim.sub', player_id::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.admin_bookings_for_week(court_one, start_date, start_date + 6);
    raise exception 'Regular user can view admin weekly details';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  select count(*) into total from public.admin_bookings_for_week(court_one, start_date, start_date + 6)
  where user_email = player_id::text || '@example.invalid';
  if total <> 2 then raise exception 'Incorrect court or week boundaries'; end if;
  select count(*) into total from public.admin_bookings_for_week(court_two, start_date, start_date + 6);
  if total <> 1 then raise exception 'Incorrect second court results'; end if;
  begin
    perform public.admin_bookings_for_week(court_one, start_date, start_date + 7);
    raise exception 'Invalid week range was accepted';
  exception when invalid_parameter_value then null;
  end;
end
$$;

rollback;

select 'Admin weekly schedule tests passed; all test data rolled back' as result;
