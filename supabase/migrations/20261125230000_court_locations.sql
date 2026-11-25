do $$
begin
  lock table public.courts, public.bookings in share row exclusive mode;

  if exists (
    select 1
    from public.bookings b
    join public.courts c on c.id = b.court_id
    where c.name in ('Teren 1 — Zemlja', 'Teren 2 — Zemlja', 'Padel 1')
  ) then
    raise exception 'Demo courts already have bookings; review them before changing the court locations.';
  end if;

  if (select count(*) from public.courts
      where name in ('Teren 1 — Zemlja', 'Teren 2 — Zemlja', 'Padel 1')) <> 3 then
    raise exception 'Expected demo courts were not found; review the court data before applying this migration.';
  end if;

  update public.courts set name = 'Teren — Bijelo Brdo' where name = 'Teren 1 — Zemlja';
  update public.courts set name = 'Teren — Dalj' where name = 'Teren 2 — Zemlja';
  update public.courts set active = false where name = 'Padel 1';
end
$$;
