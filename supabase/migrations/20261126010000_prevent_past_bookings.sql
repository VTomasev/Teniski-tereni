drop policy "Users can create their own future bookings on active courts" on public.bookings;
create policy "Users can create their own future bookings on active courts"
  on public.bookings for insert to authenticated
  with check (
    auth.uid() = user_id
    and (booking_date + start_minute * interval '1 minute') at time zone 'Europe/Zagreb' > statement_timestamp()
    and exists (select 1 from public.courts c where c.id = court_id and c.active)
  );

drop policy "Administrators can move bookings" on public.bookings;
create policy "Administrators can move bookings"
  on public.bookings for update to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    and (booking_date + start_minute * interval '1 minute') at time zone 'Europe/Zagreb' > statement_timestamp()
    and exists (select 1 from public.courts c where c.id = court_id and c.active)
  );
