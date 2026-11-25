begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  player_id uuid := gen_random_uuid();
  court_id bigint;
  booking_id uuid;
  zagreb_now timestamp := statement_timestamp() at time zone 'Europe/Zagreb';
  today date := zagreb_now::date;
  affected integer;
begin
  insert into auth.users (id, email) values
    (admin_id, admin_id::text || '@example.invalid'),
    (player_id, player_id::text || '@example.invalid');
  insert into public.admin_users values (admin_id);
  insert into public.courts (name) values ('Time test ' || admin_id) returning id into court_id;

  perform set_config('request.jwt.claim.sub', player_id::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
    values (court_id, today - 1, 480, 60, player_id);
    raise exception 'Past date was accepted';
  exception when insufficient_privilege then null;
  end;
  if zagreb_now::time >= time '08:00' then
    begin
      insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
      values (court_id, today, 480, 60, player_id);
      raise exception 'Past time today was accepted';
    exception when insufficient_privilege then null;
    end;
  end if;
  if zagreb_now::time < time '21:00' then
    insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
    values (court_id, today, 1260, 60, player_id);
  end if;
  insert into public.bookings (court_id, booking_date, start_minute, duration_minutes, user_id)
  values (court_id, today + 1, 480, 60, player_id) returning id into booking_id;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  begin
    update public.bookings set booking_date = today - 1 where id = booking_id;
    raise exception 'Admin move to past date was accepted';
  exception when insufficient_privilege then null;
  end;
  if zagreb_now::time >= time '08:00' then
    begin
      update public.bookings set booking_date = today where id = booking_id;
      raise exception 'Admin move to past time today was accepted';
    exception when insufficient_privilege then null;
    end;
  end if;
  update public.bookings set start_minute = 600 where id = booking_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Future admin move failed'; end if;
end
$$;

rollback;

select 'Past booking tests passed; all test data rolled back' as result;
