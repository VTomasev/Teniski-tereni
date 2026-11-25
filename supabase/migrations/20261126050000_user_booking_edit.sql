create policy "Users can move their own future bookings"
  on public.bookings for update to authenticated
  using (
    auth.uid() = user_id
    and (booking_date + start_minute * interval '1 minute') at time zone 'Europe/Zagreb' > statement_timestamp()
  )
  with check (
    auth.uid() = user_id
    and (booking_date + start_minute * interval '1 minute') at time zone 'Europe/Zagreb' > statement_timestamp()
    and exists (select 1 from public.courts c where c.id = court_id and c.active)
  );
