    // Supabase Dashboard > Project Settings > API. Use only the public anon/publishable key here.
    const NEXT_PUBLIC_SUPABASE_URL = "https://mjclablyjchcosbthdvw.supabase.co";
    const NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nG103ys7Lx_J7Js0KdsZkw__Xokzmiz";
    const START_MINUTE = 8 * 60;
    const END_MINUTE = 22 * 60;
    const SLOT_MINUTES = 30;
    const SLOT_HEIGHT = 42;
    const courtClockFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zagreb",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
    const setupView = document.getElementById("setupView");
    const authView = document.getElementById("authView");
    const resetRequestView = document.getElementById("resetRequestView");
    const resetPasswordView = document.getElementById("resetPasswordView");
    const appView = document.getElementById("appView");
    const adminView = document.getElementById("adminView");
    const homeView = document.getElementById("homeView");
    const siteNav = document.getElementById("siteNav");
    const topbarActions = document.getElementById("topbarActions");
    const topbarNote = document.querySelector(".topbar-note");
    const mobileCalendar = window.matchMedia("(max-width: 700px)");
    let client = null;
    let currentUser = null;
    let currentDate = dateFromKey(courtNow().dateKey);
    let courts = [];
    let bookings = [];
    let selectedCourt = null;
    let editingBooking = null;
    let bookingBusy = false;
    let activeBooking = null;
    let bookingAnchor = null;
    let dataRequest = 0;
    let courtsRequest = 0;
    let myBookingsRequest = 0;
    let scheduleReady = false;
    let realtimeChannel = null;
    let isAdmin = false;
    let adminAccessRequest = 0;
    let adminBookingsRequest = 0;
    let adminCourtsRequest = 0;
    let adminBookings = [];
    let adminCourts = [];
    let adminSelectedCourt = null;
    let adminWeekDate = dateFromKey(courtNow().dateKey);
    let adminBookingsLoaded = false;
    let adminCourtsLoaded = false;
    let adminEditingBooking = null;
    let adminBookingBusy = false;
    let adminNewBooking = null;
    let adminCreateAnchor = null;
    let adminCreateBusy = false;
    let authMode = "login";
    let toastTimer = null;
    let recoveryPending = new URLSearchParams(window.location.search).get("recovery") === "1";
    const recoveryLinkError = recoveryPending && (
      new URLSearchParams(window.location.hash.slice(1)).has("error") ||
      new URLSearchParams(window.location.search).has("error")
    );

    function showView(view) {
      homeView.classList.toggle("hidden", view !== homeView);
      setupView.classList.toggle("hidden", view !== setupView);
      authView.classList.toggle("hidden", view !== authView);
      resetRequestView.classList.toggle("hidden", view !== resetRequestView);
      resetPasswordView.classList.toggle("hidden", view !== resetPasswordView);
      appView.classList.toggle("hidden", view !== appView);
      adminView.classList.toggle("hidden", view !== adminView);
      siteNav.classList.toggle("hidden", view !== homeView);
      topbarActions.classList.toggle("hidden", view === appView || view === adminView || view === resetPasswordView);
      topbarNote.classList.toggle("hidden", view !== homeView);
    }

    function openAuthView() {
      if (!client) {
        showView(setupView);
        return;
      }
      setAuthMode("login");
      showView(authView);
    }

    function openBookingFlow() {
      openAuthView();
    }

    function openApp() {
      document.getElementById("accountEmail").textContent = currentUser?.email || "";
      showView(appView);
      queueMicrotask(() => {
        if (!currentUser) return;
        loadUserCourts();
        loadMyBookings();
        refreshAdminAccess();
        ensureRealtime();
      });
    }

    async function refreshAdminAccess() {
      const request = ++adminAccessRequest;
      const userId = currentUser?.id;
      const button = document.getElementById("openAdmin");
      const status = document.getElementById("adminAccessError");
      isAdmin = false;
      button.classList.add("hidden");
      status.textContent = "";
      try {
        const { data, error } = await client.rpc("is_admin");
        if (error) throw error;
        if (request !== adminAccessRequest || currentUser?.id !== userId) return;
        isAdmin = data === true;
        button.classList.toggle("hidden", !isAdmin);
      } catch (error) {
        if (request !== adminAccessRequest || currentUser?.id !== userId) return;
        status.textContent = `Provjera administratorskog pristupa nije uspjela: ${error.message || "pokušaj ponovno."}`;
      }
    }

    function setAdminStatus(id, message, error = false) {
      const status = document.getElementById(id);
      status.textContent = message;
      status.className = `admin-status${error ? " error" : ""}`;
    }

    function renderCourtOptions(id, availableCourts, selected, onSelect) {
      const container = document.getElementById(id);
      container.replaceChildren();
      availableCourts.forEach(court => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "court-option";
        button.setAttribute("aria-pressed", String(Number(selected?.id) === Number(court.id)));
        const name = document.createElement("strong");
        name.textContent = court.name;
        button.appendChild(name);
        if (court.active === false) {
          const note = document.createElement("span");
          note.textContent = "Neaktivan teren";
          button.appendChild(note);
        }
        button.addEventListener("click", () => onSelect(court));
        container.appendChild(button);
      });
    }

    async function loadUserCourts() {
      const request = ++courtsRequest;
      const userId = currentUser?.id;
      const status = document.getElementById("courtPickerStatus");
      status.className = "admin-status";
      status.textContent = "Učitavam terene…";
      try {
        const { data, error } = await client.from("courts").select("id,name").eq("active", true).order("id");
        if (error) throw error;
        if (request !== courtsRequest || currentUser?.id !== userId) return;
        courts = data;
        selectedCourt = courts.find(court => Number(court.id) === Number(selectedCourt?.id)) || null;
        if (!selectedCourt) {
          dataRequest++;
          scheduleReady = false;
          bookings = [];
        }
        renderCourtOptions("courtOptions", courts, selectedCourt, selectCourt);
        document.getElementById("scheduleSection").classList.toggle("hidden", !selectedCourt);
        status.textContent = courts.length ? "" : "Trenutačno nema aktivnih terena.";
        if (selectedCourt) loadSchedule();
      } catch (error) {
        if (request !== courtsRequest || currentUser?.id !== userId) return;
        dataRequest++;
        selectedCourt = null;
        courts = [];
        document.getElementById("courtOptions").replaceChildren();
        document.getElementById("scheduleSection").classList.add("hidden");
        status.className = "admin-status error";
        status.textContent = `Terene nije moguće učitati: ${error.message || "pokušaj ponovno."}`;
      }
    }

    function selectCourt(court) {
      selectedCourt = court;
      renderCourtOptions("courtOptions", courts, selectedCourt, selectCourt);
      document.getElementById("scheduleSection").classList.remove("hidden");
      loadSchedule();
    }

    async function loadAdminBookings() {
      const request = ++adminBookingsRequest;
      adminBookings = [];
      adminBookingsLoaded = false;
      renderAdminCalendar();
      if (!adminSelectedCourt) return;
      const { start, end } = weekRange(adminWeekDate);
      const courtId = adminSelectedCourt.id;
      setAdminStatus("adminBookingsStatus", "Učitavam rezervacije…");
      try {
        const records = [];
        const pageSize = 100;
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await client.rpc("admin_bookings_for_week", {
            p_court_id: courtId, p_start: localDateKey(start), p_end: localDateKey(end)
          })
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          if (request !== adminBookingsRequest || !currentUser || !isAdmin) return;
          records.push(...data);
          if (data.length < pageSize) break;
        }
        adminBookings = records;
        adminBookingsLoaded = true;
        renderAdminCalendar();
        setAdminStatus("adminBookingsStatus", records.length ? "" : "Nema rezervacija za odabrani tjedan.");
      } catch (error) {
        if (request !== adminBookingsRequest || !currentUser || !isAdmin) return;
        setAdminStatus("adminBookingsStatus", `Rezervacije nije moguće učitati: ${error.message || "pokušaj ponovno."}`, true);
      }
    }

    async function saveAdminCourt(id, changes, button) {
      button.disabled = true;
      setAdminStatus("adminCourtsStatus", "");
      try {
        const { data, error } = await client.from("courts").update(changes).eq("id", id).select("id");
        if (error) throw error;
        if (data.length !== 1) throw new Error("Teren više ne postoji ili nemaš dopuštenje za uređivanje.");
        showToast("Teren je spremljen.");
        await loadAdminCourts();
      } catch (error) {
        setAdminStatus("adminCourtsStatus", `Teren nije moguće spremiti: ${error.message || "pokušaj ponovno."}`, true);
      } finally {
        button.disabled = false;
      }
    }

    async function loadAdminCourts() {
      const request = ++adminCourtsRequest;
      const list = document.getElementById("adminCourtsList");
      list.replaceChildren();
      adminCourtsLoaded = false;
      renderAdminCalendar();
      setAdminStatus("adminCourtsStatus", "Učitavam terene…");
      try {
        const { data, error } = await client.from("courts").select("id,name,active").order("name");
        if (error) throw error;
        if (request !== adminCourtsRequest || !currentUser || !isAdmin) return;
        adminCourts = data;
        adminCourtsLoaded = true;
        adminSelectedCourt = adminCourts.find(court => Number(court.id) === Number(adminSelectedCourt?.id)) || null;
        if (!adminSelectedCourt) {
          adminBookingsRequest++;
          adminBookings = [];
          adminBookingsLoaded = false;
        }
        renderCourtOptions("adminCourtOptions", adminCourts, adminSelectedCourt, selectAdminCourt);
        document.getElementById("adminScheduleSection").classList.toggle("hidden", !adminSelectedCourt);
        renderAdminCalendar();
        data.forEach(court => {
          const row = document.createElement("div");
          row.className = "admin-row";
          const form = document.createElement("form");
          form.className = "admin-court-form";
          const field = document.createElement("div");
          field.className = "field";
          const label = document.createElement("label");
          label.htmlFor = `adminCourt-${court.id}`;
          label.textContent = court.active ? "Aktivan teren" : "Neaktivan teren";
          const input = document.createElement("input");
          input.id = label.htmlFor;
          input.value = court.name;
          input.required = true;
          input.minLength = 2;
          input.maxLength = 80;
          field.append(label, input);
          const save = document.createElement("button");
          save.type = "submit";
          save.className = "button";
          save.textContent = "Spremi naziv";
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "button";
          toggle.textContent = court.active ? "Deaktiviraj" : "Aktiviraj";
          form.addEventListener("submit", event => {
            event.preventDefault();
            const name = input.value.trim();
            if (name.length < 2) {
              setAdminStatus("adminCourtsStatus", "Naziv terena mora imati najmanje 2 znaka.", true);
              return;
            }
            saveAdminCourt(court.id, { name }, save);
          });
          toggle.addEventListener("click", () => {
            if (court.active && !window.confirm(`Deaktivirati teren ${court.name}? Postojeće rezervacije ostaju sačuvane.`)) return;
            saveAdminCourt(court.id, { active: !court.active }, toggle);
          });
          form.append(field, save, toggle);
          row.appendChild(form);
          list.appendChild(row);
        });
        setAdminStatus("adminCourtsStatus", data.length ? "" : "Još nema terena.");
      } catch (error) {
        if (request !== adminCourtsRequest || !currentUser || !isAdmin) return;
        adminBookingsRequest++;
        adminSelectedCourt = null;
        adminCourts = [];
        adminBookings = [];
        adminBookingsLoaded = false;
        document.getElementById("adminCourtOptions").replaceChildren();
        document.getElementById("adminScheduleSection").classList.add("hidden");
        setAdminStatus("adminCourtsStatus", `Terene nije moguće učitati: ${error.message || "pokušaj ponovno."}`, true);
      }
    }

    function selectAdminCourt(court) {
      adminSelectedCourt = court;
      renderCourtOptions("adminCourtOptions", adminCourts, adminSelectedCourt, selectAdminCourt);
      document.getElementById("adminScheduleSection").classList.remove("hidden");
      loadAdminBookings();
    }

    function openAdminNewBooking(day, minute, anchor) {
      if (!currentUser || !isAdmin || !adminBookingsLoaded || !adminCourtsLoaded ||
          !adminSelectedCourt?.active || !isFutureStart(day.key, minute)) return;
      adminNewBooking = { courtId: adminSelectedCourt.id, date: day.key, minute };
      adminCreateAnchor = anchor;
      populateBookingFields("adminCreate", adminCourts.filter(court => court.active),
        adminSelectedCourt.id, day.key, minute, 60);
      document.getElementById("adminGuestName").value = "";
      document.getElementById("adminCreateError").textContent = "";
      document.getElementById("adminCreateModal").classList.remove("hidden");
      positionAnchoredModal("adminCreateModal", adminCreateAnchor);
      document.getElementById("adminGuestName").focus();
    }

    function closeAdminCreate(force = false) {
      if (adminCreateBusy && !force) return;
      closeModal("adminCreateModal");
      if (adminCreateAnchor?.isConnected) adminCreateAnchor.focus();
      adminCreateAnchor = null;
      adminNewBooking = null;
    }

    document.getElementById("adminCreateForm").addEventListener("submit", async event => {
      event.preventDefault();
      if (!adminNewBooking || !currentUser || !isAdmin || adminCreateBusy) return;
      const userId = currentUser.id;
      const status = document.getElementById("adminCreateError");
      const guestName = document.getElementById("adminGuestName").value.trim();
      const courtId = Number(document.getElementById("adminCreateCourt").value);
      const date = document.getElementById("adminCreateDate").value;
      const minute = Number(document.getElementById("adminCreateTime").value);
      const duration = Number(document.getElementById("adminCreateDuration").value);
      status.textContent = "";
      if (!guestName) {
        status.textContent = "Upiši ime ili e-mail osobe.";
        return;
      }
      if (!isFutureStart(date, minute)) {
        status.textContent = "Odaberi termin koji još nije počeo.";
        return;
      }
      if (minute + duration > END_MINUTE) {
        status.textContent = "Rezervacija mora završiti najkasnije u 22:00.";
        return;
      }
      adminCreateBusy = true;
      document.getElementById("adminCreateSave").disabled = true;
      document.getElementById("adminCreateClose").disabled = true;
      try {
        const { error } = await client.rpc("admin_create_guest_booking", {
          p_court_id: courtId,
          p_date: date,
          p_start_minute: minute,
          p_duration_minutes: duration,
          p_guest_name: guestName
        });
        if (error?.code === "23P01") throw new Error("Odabrani termin je zauzet. Odaberi drugo vrijeme.");
        if (error?.code === "42501") throw new Error("Termin je prošao, teren nije aktivan ili nemaš dopuštenje za rezervaciju.");
        if (error?.code === "22023") throw new Error("Provjeri unesene podatke; moguće je da e-mail pripada većem broju računa.");
        if (error) throw error;
        if (currentUser?.id !== userId || !isAdmin) return;
        closeAdminCreate(true);
        adminWeekDate = dateFromKey(date);
        adminSelectedCourt = adminCourts.find(court => Number(court.id) === courtId) || null;
        renderCourtOptions("adminCourtOptions", adminCourts, adminSelectedCourt, selectAdminCourt);
        showToast("Rezervacija je dodana.");
        await loadAdminBookings();
      } catch (error) {
        if (currentUser?.id !== userId || !isAdmin) return;
        status.textContent = `Rezervaciju nije moguće dodati: ${error.message || "pokušaj ponovno."}`;
      } finally {
        adminCreateBusy = false;
        document.getElementById("adminCreateSave").disabled = false;
        document.getElementById("adminCreateClose").disabled = false;
      }
    });
    document.getElementById("adminCreateClose").addEventListener("click", () => closeAdminCreate());
    document.getElementById("adminCreateDate").addEventListener("change", () => updateTimeOptions("adminCreate"));
    document.getElementById("adminCreateModal").addEventListener("click", event => {
      if (event.target.id === "adminCreateModal") closeAdminCreate();
    });

    function openAdminBooking(booking, court) {
      if (!currentUser || !isAdmin) return;
      adminEditingBooking = booking;
      document.getElementById("adminBookingSubtitle").textContent =
        `${court.name} · ${timeLabel(booking.start_minute)} · ${booking.guest_name || booking.user_email || "Podaci nisu dostupni"}`;
      populateBookingFields("adminEdit", adminCourts.filter(item => item.active),
        booking.court_id, booking.booking_date, booking.start_minute, booking.duration_minutes);
      document.getElementById("adminBookingError").textContent = "";
      document.getElementById("adminBookingModal").classList.remove("hidden");
    }

    function closeAdminBooking(force = false) {
      if (adminBookingBusy && !force) return;
      adminEditingBooking = null;
      closeModal("adminBookingModal");
    }

    function setAdminBookingBusy(busy) {
      adminBookingBusy = busy;
      ["adminSaveBooking", "adminCancelBooking", "adminCloseBooking"].forEach(id => {
        document.getElementById(id).disabled = busy;
      });
    }

    function matchOriginalBooking(query, booking) {
      return query.eq("id", booking.id)
        .eq("court_id", booking.court_id)
        .eq("booking_date", booking.booking_date)
        .eq("start_minute", booking.start_minute)
        .eq("duration_minutes", booking.duration_minutes);
    }

    document.getElementById("adminBookingForm").addEventListener("submit", async event => {
      event.preventDefault();
      const booking = adminEditingBooking;
      if (!booking || !currentUser || !isAdmin || adminBookingBusy) return;
      const status = document.getElementById("adminBookingError");
      const date = document.getElementById("adminEditDate").value;
      const start = Number(document.getElementById("adminEditTime").value);
      const duration = Number(document.getElementById("adminEditDuration").value);
      const courtId = Number(document.getElementById("adminEditCourt").value);
      status.textContent = "";
      if (!isFutureStart(date, start)) {
        status.textContent = "Odaberi termin koji još nije počeo.";
        updateAdminTimeOptions();
        return;
      }
      if (start + duration > END_MINUTE) {
        status.textContent = "Rezervacija mora završiti najkasnije u 22:00.";
        return;
      }
      setAdminBookingBusy(true);
      try {
        const { data, error } = await matchOriginalBooking(client.from("bookings").update({
          court_id: courtId,
          booking_date: date,
          start_minute: start,
          duration_minutes: duration
        }), booking).select("id");
        if (error?.code === "23P01") throw new Error("Odabrani termin je zauzet. Odaberi drugo vrijeme ili teren.");
        if (error?.code === "42501") throw new Error("Termin je prošao, teren nije aktivan ili nemaš dopuštenje za promjenu.");
        if (error) throw error;
        if (data.length !== 1) throw new Error("Rezervacija je u međuvremenu promijenjena ili otkazana. Osvježi kalendar.");
        closeAdminBooking(true);
        adminWeekDate = dateFromKey(date);
        adminSelectedCourt = adminCourts.find(court => Number(court.id) === courtId) || null;
        renderCourtOptions("adminCourtOptions", adminCourts, adminSelectedCourt, selectAdminCourt);
        showToast("Rezervacija je premještena.");
        await loadAdminBookings();
      } catch (error) {
        status.textContent = `Promjenu nije moguće spremiti: ${error.message || "pokušaj ponovno."}`;
      } finally {
        setAdminBookingBusy(false);
      }
    });

    document.getElementById("adminCancelBooking").addEventListener("click", async event => {
      const booking = adminEditingBooking;
      if (!booking || !currentUser || !isAdmin || adminBookingBusy) return;
      if (!window.confirm(`Otkazati rezervaciju za ${booking.court_name} u ${timeLabel(booking.start_minute)}?`)) return;
      setAdminBookingBusy(true);
      document.getElementById("adminBookingError").textContent = "";
      try {
        const { data, error } = await matchOriginalBooking(client.from("bookings").delete(), booking).select("id");
        if (error) throw error;
        if (data.length !== 1) throw new Error("Rezervacija je u međuvremenu promijenjena ili otkazana. Osvježi kalendar.");
        closeAdminBooking(true);
        showToast("Rezervacija je otkazana.");
        await loadAdminBookings();
      } catch (error) {
        document.getElementById("adminBookingError").textContent =
          `Rezervaciju nije moguće otkazati: ${error.message || "pokušaj ponovno."}`;
      } finally {
        setAdminBookingBusy(false);
      }
    });
    document.getElementById("adminCloseBooking").addEventListener("click", () => closeAdminBooking());
    document.getElementById("adminEditDate").addEventListener("change", updateAdminTimeOptions);

    document.getElementById("openAdmin").addEventListener("click", () => {
      if (!currentUser || !isAdmin) return;
      adminWeekDate = dateFromKey(courtNow().dateKey);
      showView(adminView);
      loadAdminCourts();
      if (adminSelectedCourt) loadAdminBookings();
    });
    document.getElementById("adminBack").addEventListener("click", openApp);
    document.getElementById("prevAdminWeek").addEventListener("click", () => selectAdminWeek(addDays(adminWeekDate, mobileCalendar.matches ? -1 : -7)));
    document.getElementById("nextAdminWeek").addEventListener("click", () => selectAdminWeek(addDays(adminWeekDate, mobileCalendar.matches ? 1 : 7)));
    document.getElementById("adminTodayButton").addEventListener("click", () => selectAdminWeek(dateFromKey(courtNow().dateKey)));
    document.getElementById("refreshAdminBookings").addEventListener("click", loadAdminBookings);
    document.getElementById("addCourtForm").addEventListener("submit", async event => {
      event.preventDefault();
      const nameInput = document.getElementById("newCourtName");
      const name = nameInput.value.trim();
      if (name.length < 2) {
        setAdminStatus("adminCourtsStatus", "Naziv terena mora imati najmanje 2 znaka.", true);
        return;
      }
      const button = event.currentTarget.querySelector("button");
      button.disabled = true;
      setAdminStatus("adminCourtsStatus", "");
      try {
        const { error } = await client.from("courts").insert({ name, active: true });
        if (error) throw error;
        nameInput.value = "";
        showToast("Teren je dodan.");
        await loadAdminCourts();
      } catch (error) {
        setAdminStatus("adminCourtsStatus", `Teren nije moguće dodati: ${error.message || "pokušaj ponovno."}`, true);
      } finally {
        button.disabled = false;
      }
    });

    function localDateKey(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function dateFromKey(key) {
      const [year, month, day] = key.split("-").map(Number);
      return new Date(year, month - 1, day, 12);
    }

    function addDays(date, count) {
      const result = new Date(date);
      result.setDate(result.getDate() + count);
      return result;
    }

    function weekRange(date) {
      const start = addDays(date, -((date.getDay() + 6) % 7));
      return { start, end: addDays(start, 6) };
    }

    function weekDays(date) {
      const { start } = weekRange(date);
      return Array.from({ length: 7 }, (_, index) => {
        const day = addDays(start, index);
        return {
          key: localDateKey(day),
          name: formatDate(day, { weekday: "short", day: "numeric", month: "numeric" }),
          fullName: formatDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
        };
      });
    }

    function weekLabel(date) {
      const { start, end } = weekRange(date);
      return `${formatDate(start, { day: "numeric", month: "long" })} – ${formatDate(end, { day: "numeric", month: "long", year: "numeric" })}`;
    }

    function courtNow(at = new Date()) {
      const parts = Object.fromEntries(courtClockFormatter.formatToParts(at).map(part => [part.type, part.value]));
      return {
        dateKey: `${parts.year}-${parts.month}-${parts.day}`,
        seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)
      };
    }

    function isFutureStart(dateKey, startMinute, now = courtNow()) {
      return dateKey > now.dateKey || (dateKey === now.dateKey && startMinute * 60 > now.seconds);
    }

    function updateTimeOptions(prefix) {
      const dateInput = document.getElementById(`${prefix}Date`);
      const timeSelect = document.getElementById(`${prefix}Time`);
      const now = courtNow();
      dateInput.min = now.dateKey;
      for (const option of timeSelect.options) {
        option.disabled = !isFutureStart(dateInput.value, Number(option.value), now);
      }
    }

    function updateAdminTimeOptions() {
      updateTimeOptions("adminEdit");
    }

    function populateBookingFields(prefix, availableCourts, courtId, date, minute, duration) {
      const courtSelect = document.getElementById(`${prefix}Court`);
      courtSelect.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Odaberi aktivan teren";
      courtSelect.appendChild(placeholder);
      availableCourts.forEach(court => {
        const option = document.createElement("option");
        option.value = String(court.id);
        option.textContent = court.name;
        courtSelect.appendChild(option);
      });
      courtSelect.value = availableCourts.some(court => Number(court.id) === Number(courtId))
        ? String(courtId) : "";
      const dateInput = document.getElementById(`${prefix}Date`);
      dateInput.value = date;
      const timeSelect = document.getElementById(`${prefix}Time`);
      timeSelect.replaceChildren();
      for (let start = START_MINUTE; start < END_MINUTE; start += SLOT_MINUTES) {
        const option = document.createElement("option");
        option.value = String(start);
        option.textContent = timeLabel(start);
        timeSelect.appendChild(option);
      }
      timeSelect.value = String(minute);
      document.getElementById(`${prefix}Duration`).value = String(duration);
      updateTimeOptions(prefix);
    }

    function refreshTimeSensitiveUi() {
      if (!currentUser) return;
      if (!appView.classList.contains("hidden")) {
        renderCalendar();
        loadMyBookings();
      }
      if (!document.getElementById("adminBookingModal").classList.contains("hidden")) {
        updateAdminTimeOptions();
      }
      if (!document.getElementById("bookingModal").classList.contains("hidden")) updateTimeOptions("booking");
      if (!document.getElementById("adminCreateModal").classList.contains("hidden")) updateTimeOptions("adminCreate");
    }

    function scheduleTimeRefresh() {
      const interval = SLOT_MINUTES * 60 * 1000;
      const delay = interval - Date.now() % interval + 50;
      setTimeout(() => {
        refreshTimeSensitiveUi();
        scheduleTimeRefresh();
      }, delay);
    }

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshTimeSensitiveUi();
    });
    scheduleTimeRefresh();

    function formatDate(date, options) {
      return date.toLocaleDateString("hr-HR", options);
    }

    function timeLabel(minutes) {
      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    }

    function setMessage(message, type = "") {
      const element = document.getElementById("scheduleMessage");
      element.textContent = message;
      element.className = `message${type ? ` ${type}` : ""}`;
    }

    function showToast(message) {
      const toast = document.getElementById("toast");
      toast.textContent = message;
      toast.classList.remove("hidden");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
    }

    function showAuthError(message) {
      document.getElementById("authError").textContent = message;
      document.getElementById("authError").classList.remove("form-success");
    }

    function renderCalendarGrid(grid, days, visibleBookings, options) {
      grid.style.gridTemplateColumns = `70px repeat(${days.length}, minmax(120px, 1fr))`;
      grid.replaceChildren();

      const timeHeading = document.createElement("div");
      timeHeading.className = "column-heading";
      timeHeading.textContent = "Vrijeme";
      grid.appendChild(timeHeading);
      days.forEach(day => {
        const heading = document.createElement("div");
        heading.className = `column-heading${day.key === courtNow().dateKey ? " today" : ""}`;
        heading.textContent = day.name;
        grid.appendChild(heading);
      });

      const timeColumn = document.createElement("div");
      timeColumn.className = "time-column";
      for (let minute = START_MINUTE; minute < END_MINUTE; minute += SLOT_MINUTES) {
        const label = document.createElement("div");
        label.className = "time-label";
        label.textContent = minute % 60 === 0 ? timeLabel(minute) : "";
        timeColumn.appendChild(label);
      }
      grid.appendChild(timeColumn);

      days.forEach(day => {
        const column = document.createElement("div");
        column.className = "court-column";
        for (let minute = START_MINUTE; minute < END_MINUTE; minute += SLOT_MINUTES) {
          const slot = document.createElement("button");
          slot.type = "button";
          slot.className = "slot";
          slot.textContent = options.onSlot ? `＋ ${timeLabel(minute)}` : "";
          slot.disabled = !options.onSlot || options.slotsDisabled || options.isSlotDisabled?.(day, minute);
          slot.setAttribute("aria-label", `${day.fullName}, ${timeLabel(minute)}${options.onSlot ? " — rezerviraj" : ""}`);
          if (options.onSlot) slot.addEventListener("click", () => options.onSlot(day, minute, slot));
          column.appendChild(slot);
        }

        visibleBookings.filter(booking => booking.booking_date === day.key).forEach(booking => {
          const block = document.createElement("button");
          block.type = "button";
          block.className = `booking-card${options.isOwn?.(booking) ? " own" : ""}`;
          block.style.top = `${((booking.start_minute - START_MINUTE) / SLOT_MINUTES) * SLOT_HEIGHT + 2}px`;
          block.style.height = `${(booking.duration_minutes / SLOT_MINUTES) * SLOT_HEIGHT - 4}px`;
          const label = options.bookingLabel(booking);
          block.setAttribute("aria-label", `${label}, ${day.fullName}, ${timeLabel(booking.start_minute)} do ${timeLabel(booking.start_minute + booking.duration_minutes)}`);
          const title = document.createElement("strong");
          title.textContent = label;
          const time = document.createElement("span");
          time.textContent = `${timeLabel(booking.start_minute)} – ${timeLabel(booking.start_minute + booking.duration_minutes)}`;
          block.append(title, time);
          block.addEventListener("click", () => options.onBooking(booking));
          column.appendChild(block);
        });
        grid.appendChild(column);
      });
    }

    function renderCalendar() {
      if (!selectedCourt) return;
      const now = courtNow();
      const days = weekDays(currentDate);
      const visibleDays = mobileCalendar.matches ? days.filter(day => day.key === localDateKey(currentDate)) : days;
      document.getElementById("dateHeading").textContent =
        `${selectedCourt.name} · ${mobileCalendar.matches ? visibleDays[0].fullName : weekLabel(currentDate)}`;
      updateCalendarNavigation(false);
      renderCalendarGrid(
        document.getElementById("calendarGrid"),
        visibleDays,
        bookings,
        {
          slotsDisabled: !scheduleReady,
          isSlotDisabled: (day, minute) => !isFutureStart(day.key, minute, now),
          onSlot: (day, minute, slot) => openBooking(selectedCourt, day.key, minute, slot),
          isOwn: booking => booking.user_id === currentUser?.id,
          bookingLabel: booking => booking.user_id === currentUser?.id ? "Moja rezervacija" : "Zauzeto",
          onBooking: booking => openDetails(booking, selectedCourt)
        }
      );
    }

    function renderAdminCalendar() {
      const grid = document.getElementById("adminCalendarGrid");
      const ready = adminSelectedCourt && adminBookingsLoaded && adminCourtsLoaded;
      grid.classList.toggle("hidden", !ready);
      if (!ready) {
        grid.replaceChildren();
        return;
      }
      const days = weekDays(adminWeekDate);
      const visibleDays = mobileCalendar.matches ? days.filter(day => day.key === localDateKey(adminWeekDate)) : days;
      document.getElementById("adminDateHeading").textContent =
        `${adminSelectedCourt.name} · ${mobileCalendar.matches ? visibleDays[0].fullName : weekLabel(adminWeekDate)}`;
      updateCalendarNavigation(true);
      renderCalendarGrid(grid, visibleDays, adminBookings, {
        slotsDisabled: !adminSelectedCourt.active,
        isSlotDisabled: (day, minute) => !isFutureStart(day.key, minute),
        onSlot: (day, minute, slot) => openAdminNewBooking(day, minute, slot),
        bookingLabel: booking => booking.guest_name || booking.user_email || "Podaci nisu dostupni",
        onBooking: booking => openAdminBooking(booking, adminSelectedCourt)
      });
    }

    function updateCalendarNavigation(admin) {
      const previous = document.getElementById(admin ? "prevAdminWeek" : "prevWeek");
      const next = document.getElementById(admin ? "nextAdminWeek" : "nextWeek");
      const today = document.getElementById(admin ? "adminTodayButton" : "todayButton");
      previous.setAttribute("aria-label", mobileCalendar.matches ? "Prethodni dan" : "Prethodni tjedan");
      next.setAttribute("aria-label", mobileCalendar.matches ? "Sljedeći dan" : "Sljedeći tjedan");
      today.textContent = mobileCalendar.matches ? "Danas" : "Ovaj tjedan";
      const grid = document.getElementById(admin ? "adminCalendarGrid" : "calendarGrid");
      const viewName = mobileCalendar.matches ? "Dnevni raspored" : "Tjedni raspored";
      grid.setAttribute("aria-label", admin ? `Administratorski ${viewName.toLowerCase()}` : `${viewName} odabranog terena`);
      grid.parentElement.setAttribute("aria-label", `Pomični ${admin ? "administratorski " : ""}${viewName.toLowerCase()}`);
    }

    mobileCalendar.addEventListener("change", () => {
      renderCalendar();
      renderAdminCalendar();
    });
    async function loadSchedule() {
      const request = ++dataRequest;
      if (!selectedCourt) return;
      const { start, end } = weekRange(currentDate);
      const courtId = selectedCourt.id;
      scheduleReady = false;
      bookings = [];
      setMessage("Učitavam raspored…");
      renderCalendar();
      try {
        const { data, error } = await client.from("bookings")
          .select("id,court_id,booking_date,start_minute,duration_minutes,user_id")
          .eq("court_id", courtId)
          .gte("booking_date", localDateKey(start))
          .lte("booking_date", localDateKey(end));
        if (error) throw error;
        if (request !== dataRequest) return;
        bookings = data;
        scheduleReady = true;
        renderCalendar();
        setMessage("");
      } catch (error) {
        if (request !== dataRequest) return;
        setMessage(`Raspored nije moguće učitati: ${error.message}`, "error");
      }
    }

    async function loadMyBookings() {
      if (!currentUser) return;
      const request = ++myBookingsRequest;
      const userId = currentUser.id;
      const status = document.getElementById("myBookingsStatus");
      const list = document.getElementById("myBookingsList");
      status.className = "my-bookings-status";
      status.textContent = "Učitavam rezervacije…";
      try {
        const { data, error } = await client.from("bookings")
          .select("id,court_id,booking_date,start_minute,duration_minutes,user_id,courts(name)")
          .eq("user_id", userId)
          .gte("booking_date", courtNow().dateKey)
          .order("booking_date")
          .order("start_minute")
          .limit(100);
        if (error) throw error;
        if (request !== myBookingsRequest || currentUser?.id !== userId) return;

        const now = courtNow();
        const upcoming = data.filter(booking => isFutureStart(booking.booking_date, booking.start_minute, now));
        list.replaceChildren();
        upcoming.forEach(booking => {
          const court = { id: booking.court_id, name: booking.courts?.name || "Neaktivan teren" };
          const item = document.createElement("button");
          item.type = "button";
          item.className = "my-booking";
          const details = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = court.name;
          const time = document.createElement("span");
          time.textContent = `${formatDate(dateFromKey(booking.booking_date), { day: "numeric", month: "long", year: "numeric" })} · ${timeLabel(booking.start_minute)} – ${timeLabel(booking.start_minute + booking.duration_minutes)}`;
          const action = document.createElement("span");
          action.className = "my-booking-action";
          action.textContent = "Detalji →";
          details.append(title, time);
          item.append(details, action);
          item.addEventListener("click", () => openDetails(booking, court));
          list.appendChild(item);
        });
        status.textContent = data.length === 100
          ? "Prikazano je do 100 najbližih rezervacija."
          : upcoming.length ? "" : "Nemaš predstojećih rezervacija.";
      } catch (error) {
        if (request !== myBookingsRequest || currentUser?.id !== userId) return;
        list.replaceChildren();
        status.className = "my-bookings-status error";
        status.textContent = `Rezervacije nije moguće učitati: ${error.message}`;
      }
    }

    function ensureRealtime() {
      if (realtimeChannel) return;
      realtimeChannel = client.channel("reservations")
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "bookings"
        }, () => {
          if (selectedCourt) loadSchedule();
          loadMyBookings();
          if (isAdmin && adminSelectedCourt && !adminView.classList.contains("hidden")) loadAdminBookings();
        })
        .subscribe(status => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setMessage("Raspored se sinkronizira pri osvježavanju, ali trenutačne obavijesti uživo nisu dostupne.", "error");
          }
        });
    }

    function selectWeek(date) {
      currentDate = new Date(date);
      currentDate.setHours(12, 0, 0, 0);
      scheduleReady = false;
      renderCalendar();
      loadSchedule();
    }

    function selectAdminWeek(date) {
      adminWeekDate = new Date(date);
      adminWeekDate.setHours(12, 0, 0, 0);
      loadAdminBookings();
    }

    function positionAnchoredModal(id, anchorElement) {
      const backdrop = document.getElementById(id);
      const modal = backdrop.querySelector(".modal");
      const anchored = window.innerWidth >= 700 && anchorElement?.isConnected;
      backdrop.classList.toggle("anchored", Boolean(anchored));
      modal.style.left = "";
      modal.style.top = "";
      if (!anchored) return;
      const anchor = anchorElement.getBoundingClientRect();
      const width = modal.offsetWidth;
      const height = modal.offsetHeight;
      const left = anchor.right + 12 + width <= window.innerWidth - 18
        ? anchor.right + 12 : anchor.left - width - 12;
      modal.style.left = `${Math.max(18, Math.min(left, window.innerWidth - width - 18))}px`;
      modal.style.top = `${Math.max(18, Math.min(anchor.top, window.innerHeight - height - 18))}px`;
    }

    function openBooking(court, dateKey, minute, anchor, booking = null) {
      if (!booking && !scheduleReady) return;
      if (!currentUser || (booking && booking.user_id !== currentUser.id)) return;
      if (!isFutureStart(dateKey, minute)) {
        renderCalendar();
        showToast("Taj termin je već počeo. Odaberi budući termin.");
        return;
      }
      editingBooking = booking;
      populateBookingFields("booking", courts, court.id, dateKey, minute, booking?.duration_minutes || 60);
      document.getElementById("bookingTitle").textContent = booking ? "Uredi rezervaciju" : "Rezerviraj termin";
      document.getElementById("confirmBooking").textContent = booking ? "Spremi promjene" : "Potvrdi rezervaciju";
      document.getElementById("bookingError").textContent = "";
      bookingAnchor = anchor;
      document.getElementById("bookingModal").classList.remove("hidden");
      positionAnchoredModal("bookingModal", bookingAnchor);
      document.getElementById("bookingCourt").focus();
    }

    function closeModal(id, force = false) {
      if (id === "bookingModal" && bookingBusy && !force) return;
      document.getElementById(id).classList.add("hidden");
      if (id === "bookingModal") {
        if (bookingAnchor?.isConnected) bookingAnchor.focus();
        bookingAnchor = null;
        editingBooking = null;
      }
    }
    window.addEventListener("resize", () => {
      if (!document.getElementById("bookingModal").classList.contains("hidden")) positionAnchoredModal("bookingModal", bookingAnchor);
      if (!document.getElementById("adminCreateModal").classList.contains("hidden")) positionAnchoredModal("adminCreateModal", adminCreateAnchor);
    });

    function openDetails(booking, court) {
      activeBooking = booking;
      document.getElementById("detailsSubtitle").textContent =
        `${court.name} · ${timeLabel(booking.start_minute)} – ${timeLabel(booking.start_minute + booking.duration_minutes)} · ${formatDate(dateFromKey(booking.booking_date), { day: "numeric", month: "long", year: "numeric" })}`;
      const isOwner = booking.user_id === currentUser?.id;
      document.getElementById("detailsNote").textContent = isOwner
        ? "Ova rezervacija je povezana s tvojim računom."
        : "Ovaj termin je zauzeo drugi korisnik.";
      document.getElementById("detailsError").textContent = "";
      document.getElementById("cancelBooking").classList.toggle("hidden", !isOwner);
      document.getElementById("editBooking").classList.toggle("hidden", !isOwner || !isFutureStart(booking.booking_date, booking.start_minute));
      document.getElementById("detailsModal").classList.remove("hidden");
    }

    document.getElementById("editBooking").addEventListener("click", () => {
      const booking = activeBooking;
      if (!booking || booking.user_id !== currentUser?.id) return;
      closeModal("detailsModal");
      openBooking({ id: booking.court_id }, booking.booking_date, booking.start_minute, null, booking);
    });
    document.getElementById("bookingDate").addEventListener("change", () => updateTimeOptions("booking"));

    document.getElementById("bookingForm").addEventListener("submit", async event => {
      event.preventDefault();
      if (!currentUser || bookingBusy) return;
      const userId = currentUser.id;
      const original = editingBooking;
      const courtId = Number(document.getElementById("bookingCourt").value);
      const date = document.getElementById("bookingDate").value;
      const minute = Number(document.getElementById("bookingTime").value);
      const duration = Number(document.getElementById("bookingDuration").value);
      const button = document.getElementById("confirmBooking");
      bookingBusy = true;
      button.disabled = true;
      document.getElementById("closeBooking").disabled = true;
      document.getElementById("bookingError").textContent = "";
      try {
        if (!isFutureStart(date, minute)) {
          renderCalendar();
          throw new Error("Taj termin je već počeo. Odaberi budući termin.");
        }
        if (minute + duration > END_MINUTE) {
          throw new Error("Rezervacija mora završiti najkasnije u 22:00.");
        }
        const changes = { court_id: courtId, booking_date: date, start_minute: minute, duration_minutes: duration };
        const result = original
          ? await matchOriginalBooking(client.from("bookings").update(changes), original).select("id")
          : await client.from("bookings").insert({ ...changes, user_id: userId });
        const { error } = result;
        if (error) {
          if (error.code === "23P01") throw new Error("Odabrani termin je zauzet. Odaberi drugo vrijeme ili teren.");
          if (error.code === "42501") throw new Error("Termin je prošao, teren nije aktivan ili nemaš dopuštenje za rezervaciju.");
          throw error;
        }
        if (original && result.data.length !== 1) throw new Error("Rezervacija je u međuvremenu promijenjena ili otkazana. Osvježi raspored.");
        if (currentUser?.id !== userId) return;
        closeModal("bookingModal", true);
        currentDate = dateFromKey(date);
        selectedCourt = courts.find(court => Number(court.id) === courtId) || null;
        renderCourtOptions("courtOptions", courts, selectedCourt, selectCourt);
        document.getElementById("scheduleSection").classList.toggle("hidden", !selectedCourt);
        showToast(original ? "Rezervacija je promijenjena." : "Termin je uspješno rezerviran.");
        await Promise.all([loadSchedule(), loadMyBookings()]);
      } catch (error) {
        if (currentUser?.id === userId) document.getElementById("bookingError").textContent = error.message || "Rezervaciju nije moguće spremiti.";
      } finally {
        bookingBusy = false;
        button.disabled = false;
        document.getElementById("closeBooking").disabled = false;
      }
    });

    document.getElementById("cancelBooking").addEventListener("click", async event => {
      const booking = activeBooking;
      if (!booking || !currentUser || booking.user_id !== currentUser.id) return;
      const userId = currentUser.id;
      const button = event.currentTarget;
      button.disabled = true;
      document.getElementById("detailsError").textContent = "";
      try {
        const { data, error } = await matchOriginalBooking(client.from("bookings").delete(), booking).select("id");
        if (error) throw error;
        if (data.length !== 1) throw new Error("Rezervacija je u međuvremenu promijenjena ili otkazana. Osvježi raspored.");
        if (currentUser?.id !== userId) return;
        closeModal("detailsModal");
        showToast("Rezervacija je otkazana.");
        await Promise.all([loadSchedule(), loadMyBookings()]);
      } catch (error) {
        if (currentUser?.id === userId) document.getElementById("detailsError").textContent = error.message || "Rezervaciju nije moguće otkazati.";
      } finally {
        button.disabled = false;
      }
    });

    function setPasswordVisibility(inputId, toggleId, visible) {
      const passwordInput = document.getElementById(inputId);
      const toggle = document.getElementById(toggleId);
      passwordInput.type = visible ? "text" : "password";
      toggle.textContent = visible ? "Sakrij" : "Prikaži";
      toggle.setAttribute("aria-label", visible ? "Sakrij lozinku" : "Prikaži lozinku");
    }

    function clearPassword() {
      document.getElementById("authPassword").value = "";
      setPasswordVisibility("authPassword", "togglePassword", false);
    }

    function clearNewPassword() {
      document.getElementById("newPassword").value = "";
      setPasswordVisibility("newPassword", "toggleNewPassword", false);
    }

    function clearRecoveryState() {
      recoveryPending = false;
      const url = new URL(window.location.href);
      url.searchParams.delete("recovery");
      url.searchParams.delete("error");
      url.searchParams.delete("error_code");
      url.searchParams.delete("error_description");
      window.history.replaceState(null, "", url.pathname + url.search);
    }

    document.getElementById("togglePassword").addEventListener("click", () => {
      setPasswordVisibility("authPassword", "togglePassword", document.getElementById("authPassword").type === "password");
    });
    document.getElementById("toggleNewPassword").addEventListener("click", () => {
      setPasswordVisibility("newPassword", "toggleNewPassword", document.getElementById("newPassword").type === "password");
    });

    function setAuthMode(mode) {
      if (authMode !== mode) clearPassword();
      authMode = mode;
      const signup = authMode === "signup";
      document.getElementById("authTitle").textContent = signup ? "Izradi račun" : "Prijavi se";
      document.getElementById("authDescription").textContent = signup
        ? "Registriraj se kako bi mogao/la rezervirati svoje termine."
        : "Prijavi se za pregled rasporeda i rezervaciju terena.";
      document.getElementById("authSubmit").textContent = signup ? "Registriraj se" : "Prijavi se";
      document.getElementById("authSwitchText").textContent = signup ? "Već imaš račun?" : "Nemaš račun?";
      document.getElementById("authSwitch").textContent = signup ? "Prijavi se" : "Registriraj se";
      document.getElementById("authPassword").autocomplete = signup ? "new-password" : "current-password";
      document.getElementById("forgotPassword").classList.toggle("hidden", signup);
      showAuthError("");
    }

    document.getElementById("authSwitch").addEventListener("click", () => {
      setAuthMode(authMode === "login" ? "signup" : "login");
    });

    document.getElementById("authForm").addEventListener("invalid", clearPassword, true);

    document.getElementById("authForm").addEventListener("submit", async event => {
      event.preventDefault();
      const button = document.getElementById("authSubmit");
      button.disabled = true;
      showAuthError("");
      const email = document.getElementById("authEmail").value.trim();
      const password = document.getElementById("authPassword").value;
      try {
        const result = authMode === "signup"
          ? await client.auth.signUp({ email, password })
          : await client.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        clearPassword();
        if (authMode === "signup" && !result.data.session) {
          const status = document.getElementById("authError");
          status.classList.add("form-success");
          status.textContent = "Ako je registracija uspješna, provjeri e-mail i potvrdi adresu prije prijave.";
          return;
        }
        if (authMode === "signup") showToast("Račun je uspješno izrađen.");
      } catch (error) {
        clearPassword();
        showAuthError(authMode === "signup" && error.status === 429
          ? "Dosegnuto je ograničenje slanja e-mailova. Pokušaj ponovno kasnije."
          : error.message || "Prijava trenutačno nije moguća.");
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById("forgotPassword").addEventListener("click", () => {
      document.getElementById("resetEmail").value = document.getElementById("authEmail").value;
      document.getElementById("resetRequestError").textContent = "";
      document.getElementById("resetRequestError").classList.remove("form-success");
      clearPassword();
      showView(resetRequestView);
    });
    document.getElementById("resetBack").addEventListener("click", () => {
      clearRecoveryState();
      document.getElementById("resetRequestError").textContent = "";
      setAuthMode("login");
      if (currentUser) openApp();
      else showView(authView);
    });
    document.getElementById("resetRequestForm").addEventListener("submit", async event => {
      event.preventDefault();
      const button = document.getElementById("resetRequestSubmit");
      const status = document.getElementById("resetRequestError");
      const email = document.getElementById("resetEmail").value.trim();
      button.disabled = true;
      status.textContent = "";
      status.classList.remove("form-success");
      try {
        const redirect = new URL(window.location.pathname, window.location.origin);
        redirect.searchParams.set("recovery", "1");
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirect.toString() });
        if (error) throw error;
        status.classList.add("form-success");
        status.textContent = "Ako račun postoji, provjeri e-mail za poveznicu za promjenu lozinke.";
      } catch (error) {
        status.textContent = error.status === 429
          ? "Dosegnuto je ograničenje slanja e-mailova. Pokušaj ponovno kasnije."
          : `Poveznicu nije moguće poslati: ${error.message || "pokušaj ponovno kasnije."}`;
      } finally {
        button.disabled = false;
      }
    });
    document.getElementById("resetPasswordForm").addEventListener("invalid", clearNewPassword, true);
    document.getElementById("resetPasswordForm").addEventListener("submit", async event => {
      event.preventDefault();
      const button = document.getElementById("resetPasswordSubmit");
      const status = document.getElementById("resetPasswordError");
      const password = document.getElementById("newPassword").value;
      button.disabled = true;
      status.textContent = "";
      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        clearNewPassword();
        clearRecoveryState();
        showToast("Lozinka je uspješno promijenjena.");
        openApp();
      } catch (error) {
        clearNewPassword();
        status.textContent = `Lozinku nije moguće promijeniti: ${error.message || "pokušaj ponovno."}`;
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById("signOut").addEventListener("click", async () => {
      const { error } = await client.auth.signOut();
      if (error) document.getElementById("adminAccessError").textContent = `Odjava nije uspjela: ${error.message}`;
    });
    document.getElementById("currentYear").textContent = String(new Date().getFullYear());
    document.getElementById("brandHome").addEventListener("click", event => {
      event.preventDefault();
      if (recoveryPending) showView(currentUser && !recoveryLinkError ? resetPasswordView : resetRequestView);
      else if (currentUser) openApp();
      else showView(homeView);
    });
    document.getElementById("headerLogin").addEventListener("click", openAuthView);
    document.getElementById("headerBook").addEventListener("click", openBookingFlow);
    document.querySelectorAll(".booking-entry").forEach(button => {
      button.addEventListener("click", openBookingFlow);
    });
    document.getElementById("authBack").addEventListener("click", () => showView(homeView));
    document.getElementById("setupBack").addEventListener("click", () => showView(homeView));
    document.getElementById("prevWeek").addEventListener("click", () => selectWeek(addDays(currentDate, mobileCalendar.matches ? -1 : -7)));
    document.getElementById("nextWeek").addEventListener("click", () => selectWeek(addDays(currentDate, mobileCalendar.matches ? 1 : 7)));
    document.getElementById("todayButton").addEventListener("click", () => selectWeek(dateFromKey(courtNow().dateKey)));
    document.getElementById("closeBooking").addEventListener("click", () => closeModal("bookingModal"));
    document.getElementById("closeDetails").addEventListener("click", () => closeModal("detailsModal"));
    ["bookingModal", "detailsModal"].forEach(id => {
      document.getElementById(id).addEventListener("click", event => {
        if (event.target.id === id) closeModal(id);
      });
    });
    document.getElementById("adminBookingModal").addEventListener("click", event => {
      if (event.target.id === "adminBookingModal") closeAdminBooking();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeModal("bookingModal", true);
        closeModal("detailsModal");
        closeAdminBooking();
        closeAdminCreate();
      }
    });

    if (!NEXT_PUBLIC_SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL === "YOUR_SUPABASE_URL" ||
        !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("YOUR_")) {
      showView(homeView);
    } else if (!window.supabase) {
      setupView.querySelector("p").textContent = "Supabase biblioteka se nije učitala. Provjeri internetsku vezu i ponovno učitaj stranicu.";
      showView(homeView);
    } else {
      try {
        client = window.supabase.createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
        client.auth.onAuthStateChange((event, session) => {
          const previousUserId = currentUser?.id;
          currentUser = session?.user ?? null;
          if (event === "PASSWORD_RECOVERY") recoveryPending = true;
          if (recoveryPending && (currentUser || recoveryLinkError)) {
            if (recoveryLinkError) {
              document.getElementById("resetRequestError").textContent =
                "Poveznica nije valjana ili je istekla. Zatraži novu poveznicu.";
              const url = new URL(window.location.href);
              url.searchParams.delete("error");
              url.searchParams.delete("error_code");
              url.searchParams.delete("error_description");
              window.history.replaceState(null, "", url.pathname + url.search);
              showView(resetRequestView);
            } else {
              showView(resetPasswordView);
            }
            return;
          }
          if (currentUser) {
            if (event !== "TOKEN_REFRESHED" || previousUserId !== currentUser.id || adminView.classList.contains("hidden")) {
              openApp();
            }
          } else {
            isAdmin = false;
            adminAccessRequest++;
            adminBookingsRequest++;
            adminCourtsRequest++;
            adminBookings = [];
            adminCourts = [];
            adminSelectedCourt = null;
            adminBookingsLoaded = false;
            adminCourtsLoaded = false;
            closeAdminBooking(true);
            closeAdminCreate(true);
            closeModal("bookingModal");
            closeModal("detailsModal");
            document.getElementById("openAdmin").classList.add("hidden");
            document.getElementById("adminCalendarGrid").replaceChildren();
            document.getElementById("adminCourtOptions").replaceChildren();
            document.getElementById("adminCourtsList").replaceChildren();
            document.getElementById("adminScheduleSection").classList.add("hidden");
            dataRequest++;
            courtsRequest++;
            myBookingsRequest++;
            courts = [];
            bookings = [];
            selectedCourt = null;
            activeBooking = null;
            scheduleReady = false;
            currentDate = dateFromKey(courtNow().dateKey);
            adminWeekDate = dateFromKey(courtNow().dateKey);
            document.getElementById("courtOptions").replaceChildren();
            document.getElementById("scheduleSection").classList.add("hidden");
            document.getElementById("myBookingsList").replaceChildren();
            if (realtimeChannel) {
              client.removeChannel(realtimeChannel);
              realtimeChannel = null;
            }
            if (recoveryPending) {
              document.getElementById("resetRequestError").textContent =
                "Poveznica nije valjana ili je istekla. Zatraži novu poveznicu.";
              showView(resetRequestView);
            } else {
              showView(homeView);
            }
          }
        });
      } catch (error) {
        setupView.querySelector("p").textContent = `Supabase konfiguracija nije ispravna: ${error.message}`;
        showView(homeView);
      }
    }
