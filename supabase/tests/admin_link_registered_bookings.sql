begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  player_id uuid := gen_random_uuid();
  player_email text := player_id::text || '@example.invalid';
  court_id bigint;
  linked_booking uuid;
  guest_booking uuid;
  future_date date := (statement_timestamp() at time zone 'Europe/Zagreb')::date + 10;
  affected integer;
begin
  insert into auth.users (id, email) values
    (admin_id, admin_id::text || '@example.invalid'),
    (player_id, player_email);
  insert into public.admin_users values (admin_id);
  insert into public.courts (name) values ('Linked court ' || admin_id) returning id into court_id;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('role', 'authenticated', true);

  linked_booking := public.admin_create_guest_booking(court_id, future_date, 600, 60, '  ' || upper(player_email) || '  ');
  guest_booking := public.admin_create_guest_booking(court_id, future_date, 720, 60, 'unknown@example.invalid');
  if not exists (
    select 1 from public.admin_bookings_for_week(court_id, future_date, future_date + 6) b
    where b.id = linked_booking and b.user_email = player_email and b.guest_name is null
  ) then raise exception 'Registered email was not linked to the account'; end if;
  if not exists (
    select 1 from public.admin_bookings_for_week(court_id, future_date, future_date + 6) b
    where b.id = guest_booking and b.user_email is null and b.guest_name = 'unknown@example.invalid'
  ) then raise exception 'Unknown email was not stored as a guest'; end if;

  perform set_config('request.jwt.claim.sub', player_id::text, true);
  if not exists (select 1 from public.bookings where id = linked_booking and user_id = player_id) then
    raise exception 'Linked booking is not visible as the player own reservation';
  end if;
  delete from public.bookings where id = linked_booking;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Player cannot cancel linked booking'; end if;
  delete from public.bookings where id = guest_booking;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Player can cancel an unlinked guest booking'; end if;
end
$$;

rollback;

select 'Admin account linking tests passed; all test data rolled back' as result;
