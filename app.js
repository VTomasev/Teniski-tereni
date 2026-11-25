    // Supabase Dashboard > Project Settings > API. Use only the public anon/publishable key here.
    const SUPABASE_URL = "YOUR_SUPABASE_URL";
    const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
    const START_MINUTE = 8 * 60;
    const END_MINUTE = 22 * 60;
    const SLOT_MINUTES = 30;
    const SLOT_HEIGHT = 42;
    const setupView = document.getElementById("setupView");
    const authView = document.getElementById("authView");
    const appView = document.getElementById("appView");
    const homeView = document.getElementById("homeView");
    const siteNav = document.getElementById("siteNav");
    const topbarActions = document.getElementById("topbarActions");
    const topbarNote = document.querySelector(".topbar-note");
    let client = null;
    let currentUser = null;
    let currentDate = new Date();
    currentDate.setHours(12, 0, 0, 0);
    let courts = [];
    let bookings = [];
    let selectedCourt = null;
    let selectedStartMinute = null;
    let selectedDuration = 60;
    let activeBooking = null;
    let dataRequest = 0;
    let scheduleReady = false;
    let realtimeChannel = null;
    let authMode = "login";
    let toastTimer = null;

    function showView(view) {
      homeView.classList.toggle("hidden", view !== homeView);
      setupView.classList.toggle("hidden", view !== setupView);
      authView.classList.toggle("hidden", view !== authView);
      appView.classList.toggle("hidden", view !== appView);
      siteNav.classList.toggle("hidden", view !== homeView);
      topbarActions.classList.toggle("hidden", view === appView);
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

    function localDateKey(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

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
    }

    function hasConflict(courtId, startMinute, duration, exceptId = null) {
      const endMinute = startMinute + duration;
      return bookings.some(booking => {
        if (booking.booking_date !== localDateKey(currentDate)) return false;
        if (booking.id === exceptId || Number(booking.court_id) !== Number(courtId)) return false;
        const bookingEnd = booking.start_minute + booking.duration_minutes;
        return startMinute < bookingEnd && endMinute > booking.start_minute;
      });
    }

    function makeWeekStrip() {
      const strip = document.getElementById("weekStrip");
      strip.replaceChildren();
      const start = new Date(currentDate);
      start.setDate(start.getDate() - 3);
      for (let index = 0; index < 7; index++) {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `day-button${localDateKey(date) === localDateKey(currentDate) ? " selected" : ""}`;
        button.setAttribute("aria-pressed", String(localDateKey(date) === localDateKey(currentDate)));
        const weekday = document.createElement("span");
        weekday.textContent = formatDate(date, { weekday: "short" }).replace(".", "");
        const dayNumber = document.createElement("span");
        dayNumber.textContent = String(date.getDate());
        button.append(weekday, dayNumber);
        button.addEventListener("click", () => selectDate(date));
        strip.appendChild(button);
      }
    }

    function renderCalendar() {
      const key = localDateKey(currentDate);
      document.getElementById("dateHeading").textContent =
        formatDate(currentDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      makeWeekStrip();
      const grid = document.getElementById("calendarGrid");
      grid.style.gridTemplateColumns = `70px repeat(${Math.max(courts.length, 1)}, minmax(165px, 1fr))`;
      grid.replaceChildren();

      const timeHeading = document.createElement("div");
      timeHeading.className = "column-heading";
      timeHeading.textContent = "Vrijeme";
      grid.appendChild(timeHeading);
      courts.forEach(court => {
        const heading = document.createElement("div");
        heading.className = "column-heading";
        const dot = document.createElement("span");
        dot.className = "court-dot";
        const name = document.createElement("span");
        name.textContent = court.name;
        heading.append(dot, name);
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

      const pastDate = key < localDateKey(new Date());
      courts.forEach(court => {
        const column = document.createElement("div");
        column.className = "court-column";
        for (let minute = START_MINUTE; minute < END_MINUTE; minute += SLOT_MINUTES) {
          const slot = document.createElement("button");
          slot.type = "button";
          slot.className = "slot";
          slot.textContent = `＋ ${timeLabel(minute)}`;
          slot.disabled = pastDate || !scheduleReady;
          slot.setAttribute("aria-label", `${court.name}, ${timeLabel(minute)} — rezerviraj`);
          slot.addEventListener("click", () => openBooking(court, minute));
          column.appendChild(slot);
        }

        bookings.filter(booking => booking.booking_date === key && Number(booking.court_id) === Number(court.id)).forEach(booking => {
          const block = document.createElement("button");
          block.type = "button";
          block.className = `booking-card${booking.user_id === currentUser?.id ? " own" : ""}`;
          block.style.top = `${((booking.start_minute - START_MINUTE) / SLOT_MINUTES) * SLOT_HEIGHT + 2}px`;
          block.style.height = `${(booking.duration_minutes / SLOT_MINUTES) * SLOT_HEIGHT - 4}px`;
          block.setAttribute("aria-label", `${booking.user_id === currentUser?.id ? "Moja rezervacija" : "Zauzeto"}, ${timeLabel(booking.start_minute)} do ${timeLabel(booking.start_minute + booking.duration_minutes)}`);
          const title = document.createElement("strong");
          title.textContent = booking.user_id === currentUser?.id ? "Moja rezervacija" : "Zauzeto";
          const time = document.createElement("span");
          time.textContent = `${timeLabel(booking.start_minute)} – ${timeLabel(booking.start_minute + booking.duration_minutes)}`;
          block.append(title, time);
          block.addEventListener("click", () => openDetails(booking, court));
          column.appendChild(block);
        });
        grid.appendChild(column);
      });
    }

    async function loadSchedule() {
      const request = ++dataRequest;
      const key = localDateKey(currentDate);
      scheduleReady = false;
      setMessage("Učitavam raspored…");
      renderCalendar();
      try {
        const [courtResult, bookingResult] = await Promise.all([
          client.from("courts").select("id,name").eq("active", true).order("id"),
          client.from("bookings").select("id,court_id,booking_date,start_minute,duration_minutes,user_id").eq("booking_date", key)
        ]);
        if (courtResult.error) throw courtResult.error;
        if (bookingResult.error) throw bookingResult.error;
        if (request !== dataRequest) return;
        courts = courtResult.data;
        bookings = bookingResult.data;
        scheduleReady = true;
        renderCalendar();
        setMessage(courts.length ? "" : "Još nema aktivnih terena. Dodaj ih u tablicu courts u Supabaseu.");
        await subscribeToDate(key);
      } catch (error) {
        if (request !== dataRequest) return;
        setMessage(`Raspored nije moguće učitati: ${error.message}`, "error");
      }
    }

    async function subscribeToDate(key) {
      if (realtimeChannel) await client.removeChannel(realtimeChannel);
      realtimeChannel = client.channel(`reservations-${key}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "bookings"
        }, () => loadSchedule())
        .subscribe(status => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setMessage("Raspored se sinkronizira pri osvježavanju, ali trenutačne obavijesti uživo nisu dostupne.", "error");
          }
        });
    }

    function selectDate(date) {
      currentDate = new Date(date);
      currentDate.setHours(12, 0, 0, 0);
      scheduleReady = false;
      renderCalendar();
      loadSchedule();
    }

    function openBooking(court, minute) {
      if (!scheduleReady) return;
      selectedCourt = court;
      selectedStartMinute = minute;
      document.getElementById("bookingError").textContent = "";
      const subtitle = `${court.name} · ${timeLabel(minute)} · ${formatDate(currentDate, { day: "numeric", month: "long" })}`;
      document.getElementById("bookingSubtitle").textContent = subtitle;
      let firstAvailable = null;
      document.querySelectorAll(".duration-button").forEach(button => {
        const duration = Number(button.dataset.duration);
        const unavailable = minute + duration > END_MINUTE || hasConflict(court.id, minute, duration);
        button.disabled = unavailable;
        button.classList.remove("active");
        if (!unavailable && firstAvailable === null) firstAvailable = button;
      });
      if (!firstAvailable) {
        showToast("Od ovog početka nema slobodnog termina dovoljne duljine.");
        return;
      }
      firstAvailable.classList.add("active");
      selectedDuration = Number(firstAvailable.dataset.duration);
      document.getElementById("bookingModal").classList.remove("hidden");
    }

    function closeModal(id) {
      document.getElementById(id).classList.add("hidden");
    }

    function openDetails(booking, court) {
      activeBooking = booking;
      document.getElementById("detailsSubtitle").textContent =
        `${court.name} · ${timeLabel(booking.start_minute)} – ${timeLabel(booking.start_minute + booking.duration_minutes)} · ${formatDate(currentDate, { day: "numeric", month: "long" })}`;
      const isOwner = booking.user_id === currentUser?.id;
      document.getElementById("detailsNote").textContent = isOwner
        ? "Ova rezervacija je povezana s tvojim računom."
        : "Ovaj termin je zauzeo drugi korisnik.";
      document.getElementById("detailsError").textContent = "";
      document.getElementById("cancelBooking").classList.toggle("hidden", !isOwner);
      document.getElementById("detailsModal").classList.remove("hidden");
    }

    document.getElementById("durationOptions").addEventListener("click", event => {
      const button = event.target.closest(".duration-button");
      if (!button || button.disabled) return;
      document.querySelectorAll(".duration-button").forEach(option => option.classList.remove("active"));
      button.classList.add("active");
      selectedDuration = Number(button.dataset.duration);
    });

    document.getElementById("confirmBooking").addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      document.getElementById("bookingError").textContent = "";
      try {
        if (hasConflict(selectedCourt.id, selectedStartMinute, selectedDuration) ||
            selectedStartMinute + selectedDuration > END_MINUTE) {
          throw new Error("Termin više nije slobodan. Odaberi drugi početak.");
        }
        const { error } = await client.from("bookings").insert({
          court_id: selectedCourt.id,
          booking_date: localDateKey(currentDate),
          start_minute: selectedStartMinute,
          duration_minutes: selectedDuration,
          user_id: currentUser.id
        });
        if (error) {
          if (error.code === "23P01") throw new Error("Netko je upravo rezervirao ovaj termin. Odaberi drugi.");
          throw error;
        }
        closeModal("bookingModal");
        showToast("Termin je uspješno rezerviran.");
        await loadSchedule();
      } catch (error) {
        document.getElementById("bookingError").textContent = error.message || "Rezervaciju nije moguće spremiti.";
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById("cancelBooking").addEventListener("click", async event => {
      if (!activeBooking) return;
      const button = event.currentTarget;
      button.disabled = true;
      document.getElementById("detailsError").textContent = "";
      try {
        const { error } = await client.from("bookings").delete().eq("id", activeBooking.id);
        if (error) throw error;
        closeModal("detailsModal");
        showToast("Rezervacija je otkazana.");
        await loadSchedule();
      } catch (error) {
        document.getElementById("detailsError").textContent = error.message || "Rezervaciju nije moguće otkazati.";
      } finally {
        button.disabled = false;
      }
    });

    function setAuthMode(mode) {
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
      showAuthError("");
    }

    document.getElementById("authSwitch").addEventListener("click", () => {
      setAuthMode(authMode === "login" ? "signup" : "login");
    });

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
        if (authMode === "signup" && !result.data.session) {
          showAuthError("Račun je izrađen. Provjeri e-mail i potvrdi adresu prije prijave.");
          return;
        }
        if (authMode === "signup") showToast("Račun je uspješno izrađen.");
      } catch (error) {
        showAuthError(error.message || "Prijava trenutačno nije moguća.");
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById("signOut").addEventListener("click", async () => {
      const { error } = await client.auth.signOut();
      if (error) setMessage(`Odjava nije uspjela: ${error.message}`, "error");
    });
    document.getElementById("currentYear").textContent = String(new Date().getFullYear());
    document.getElementById("brandHome").addEventListener("click", event => {
      event.preventDefault();
      showView(currentUser ? appView : homeView);
    });
    document.getElementById("headerLogin").addEventListener("click", openAuthView);
    document.getElementById("headerBook").addEventListener("click", openBookingFlow);
    document.querySelectorAll(".booking-entry").forEach(button => {
      button.addEventListener("click", openBookingFlow);
    });
    document.getElementById("authBack").addEventListener("click", () => showView(homeView));
    document.getElementById("setupBack").addEventListener("click", () => showView(homeView));
    document.getElementById("prevDay").addEventListener("click", () => {
      const date = new Date(currentDate);
      date.setDate(date.getDate() - 1);
      selectDate(date);
    });
    document.getElementById("nextDay").addEventListener("click", () => {
      const date = new Date(currentDate);
      date.setDate(date.getDate() + 1);
      selectDate(date);
    });
    document.getElementById("todayButton").addEventListener("click", () => selectDate(new Date()));
    document.getElementById("closeBooking").addEventListener("click", () => closeModal("bookingModal"));
    document.getElementById("closeDetails").addEventListener("click", () => closeModal("detailsModal"));
    ["bookingModal", "detailsModal"].forEach(id => {
      document.getElementById(id).addEventListener("click", event => {
        if (event.target.id === id) closeModal(id);
      });
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeModal("bookingModal");
        closeModal("detailsModal");
      }
    });

    if (SUPABASE_URL === "YOUR_SUPABASE_URL" || SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY") {
      showView(homeView);
    } else if (!window.supabase) {
      setupView.querySelector("p").textContent = "Supabase biblioteka se nije učitala. Provjeri internetsku vezu i ponovno učitaj stranicu.";
      showView(homeView);
    } else {
      try {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        client.auth.onAuthStateChange((_event, session) => {
          currentUser = session?.user ?? null;
          if (currentUser) {
            document.getElementById("accountEmail").textContent = currentUser.email || "";
            showView(appView);
            queueMicrotask(() => loadSchedule());
          } else {
            courts = [];
            bookings = [];
            if (realtimeChannel) {
              client.removeChannel(realtimeChannel);
              realtimeChannel = null;
            }
            showView(homeView);
          }
        });
      } catch (error) {
        setupView.querySelector("p").textContent = `Supabase konfiguracija nije ispravna: ${error.message}`;
        showView(homeView);
      }
    }
