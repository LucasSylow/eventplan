(() => {
  const cfg = window.EVENTPLAN_CONFIG;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !window.supabase) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const app = document.getElementById("dash-app");
  const menuBtn = document.getElementById("dash-menu-btn");
  const stepPlan = document.getElementById("step-plan");
  const stepDetails = document.getElementById("step-details");
  const crumbStep = document.getElementById("create-crumb-step");
  const selectedPlanLabel = document.getElementById("selected-plan-label");
  const form = document.getElementById("event-details-form");
  const formError = document.getElementById("create-form-error");
  const mapBox = document.getElementById("map-box");
  const mapFrame = document.getElementById("map-frame");
  const locationInput = document.getElementById("location-input");
  const suggestionsEl = document.getElementById("location-suggestions");
  const eventsSubnav = document.getElementById("events-subnav");
  const avatarBtn = document.getElementById("dash-avatar");
  const avatarImg = document.getElementById("dash-avatar-img");
  const avatarInitials = document.getElementById("dash-avatar-initials");

  const planNames = {
    standard: "Standard",
    gratis: "Standard",
    premium: "Premium",
    pro: "Pro",
  };
  let currentUser = null;
  let selectedPlan = "standard";
  let suggestTimer = null;
  let mapTimer = null;
  let activeSuggest = -1;
  let suggestItems = [];
  let openCalendar = null;

  const calendars = {
    start: {
      valueEl: document.getElementById("start-date-value"),
      labelEl: document.getElementById("start-date-label"),
      trigger: document.getElementById("start-date-trigger"),
      pop: document.getElementById("start-date-pop"),
      field: document.querySelector('[data-date-field="start"]'),
      cursor: new Date(),
      selected: null,
      required: true,
      placeholder: "Vælg dato",
    },
    end: {
      valueEl: document.getElementById("end-date-value"),
      labelEl: document.getElementById("end-date-label"),
      trigger: document.getElementById("end-date-trigger"),
      pop: document.getElementById("end-date-pop"),
      field: document.querySelector('[data-date-field="end"]'),
      clearBtn: document.getElementById("end-date-clear"),
      cursor: new Date(),
      selected: null,
      required: false,
      placeholder: "Tilføj slutdato",
    },
  };

  function setTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("eventlink-theme", next);
    document.querySelectorAll("[data-theme-set]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.themeSet === next);
    });
  }

  function isMobileNav() {
    return window.matchMedia("(max-width: 920px)").matches;
  }

  function showStep(step) {
    const isDetails = step === 2;
    if (stepPlan) {
      stepPlan.hidden = isDetails;
      stepPlan.classList.toggle("is-active", !isDetails);
    }
    if (stepDetails) {
      stepDetails.hidden = !isDetails;
      stepDetails.classList.toggle("is-active", isDetails);
    }
    document.querySelectorAll("[data-step-indicator]").forEach((el) => {
      el.classList.toggle("is-active", Number(el.dataset.stepIndicator) === step);
    });
    if (crumbStep) crumbStep.textContent = isDetails ? "Eventdetaljer" : "Vælg pakke";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectPlan(plan) {
    selectedPlan = planNames[plan] ? (plan === "gratis" ? "standard" : plan) : "standard";
    if (selectedPlanLabel) selectedPlanLabel.textContent = planNames[selectedPlan];
    showStep(2);
  }

  function showMap(query) {
    const q = String(query || "").trim();
    if (!mapBox || !mapFrame) return;
    if (!q) {
      mapBox.hidden = true;
      mapFrame.removeAttribute("src");
      return;
    }
    mapFrame.src = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`;
    mapBox.hidden = false;
  }

  function scheduleMapPreview(query) {
    window.clearTimeout(mapTimer);
    mapTimer = window.setTimeout(() => showMap(query), 450);
  }

  function hideSuggestions() {
    if (!suggestionsEl) return;
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = "";
    suggestItems = [];
    activeSuggest = -1;
  }

  function renderSuggestions(items) {
    if (!suggestionsEl) return;
    suggestItems = items || [];
    activeSuggest = -1;
    if (!suggestItems.length) {
      hideSuggestions();
      return;
    }
    suggestionsEl.innerHTML = "";
    suggestItems.forEach((item, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "location-suggestion";
      btn.innerHTML = `<span></span><small></small>`;
      btn.querySelector("span").textContent = item.label;
      btn.querySelector("small").textContent = item.sub || "Adresse";
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        chooseSuggestion(index);
      });
      suggestionsEl.appendChild(btn);
    });
    suggestionsEl.hidden = false;
  }

  function chooseSuggestion(index) {
    const item = suggestItems[index];
    if (!item || !locationInput) return;
    locationInput.value = item.label;
    hideSuggestions();
    showMap(item.label);
  }

  async function fetchAddressSuggestions(query) {
    const q = String(query || "").trim();
    if (q.length < 2) {
      hideSuggestions();
      return;
    }
    try {
      const url = `https://api.dataforsyningen.dk/autocomplete?q=${encodeURIComponent(q)}&type=adresse&per_side=6`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("autocomplete failed");
      const data = await res.json();
      const items = (Array.isArray(data) ? data : [])
        .map((row) => {
          const forslag = row?.forslagstekst || row?.tekst || "";
          const label = String(forslag || "").trim();
          if (!label) return null;
          return {
            label,
            sub: row?.data?.supplerendebynavn || row?.type || "Adresse",
          };
        })
        .filter(Boolean);
      renderSuggestions(items);
    } catch {
      hideSuggestions();
    }
  }

  function formatPrettyDate(date) {
    return date.toLocaleDateString("da-DK", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function toIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function monthLabel(date) {
    const label = date.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function setDateValue(key, date) {
    const cal = calendars[key];
    if (!cal) return;
    cal.selected = date;
    cal.cursor = new Date(date.getFullYear(), date.getMonth(), 1);
    if (cal.valueEl) cal.valueEl.value = toIsoDate(date);
    if (cal.labelEl) {
      cal.labelEl.textContent = formatPrettyDate(date);
      cal.labelEl.classList.remove("is-placeholder");
    }
    if (cal.clearBtn) cal.clearBtn.hidden = false;
    closeCalendar();
  }

  function clearEndDate() {
    const cal = calendars.end;
    cal.selected = null;
    if (cal.valueEl) cal.valueEl.value = "";
    if (cal.labelEl) {
      cal.labelEl.textContent = cal.placeholder;
      cal.labelEl.classList.add("is-placeholder");
    }
    if (cal.clearBtn) cal.clearBtn.hidden = true;
    closeCalendar();
  }

  function closeCalendar() {
    Object.values(calendars).forEach((cal) => {
      if (cal.pop) cal.pop.hidden = true;
      cal.field?.classList.remove("is-open");
    });
    openCalendar = null;
  }

  function renderCalendar(key) {
    const cal = calendars[key];
    if (!cal?.pop) return;
    const year = cal.cursor.getFullYear();
    const month = cal.cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();
    const today = new Date();

    const weekdays = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"]
      .map((d) => `<span>${d}</span>`)
      .join("");

    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) {
      cells.push(
        `<button type="button" class="date-day is-muted" data-muted="1">${
          prevDays - startWeekday + i + 1
        }</button>`
      );
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const selected =
        cal.selected &&
        cal.selected.getFullYear() === year &&
        cal.selected.getMonth() === month &&
        cal.selected.getDate() === day;
      const isToday =
        today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      const classes = ["date-day"];
      if (isToday) classes.push("is-today");
      if (selected) classes.push("is-selected");
      cells.push(
        `<button type="button" class="${classes.join(" ")}" data-day="${day}">${day}</button>`
      );
    }

    cal.pop.innerHTML = `
      <div class="date-pop-head">
        <button type="button" data-cal-prev aria-label="Forrige måned">‹</button>
        <p>${monthLabel(cal.cursor)}</p>
        <button type="button" data-cal-next aria-label="Næste måned">›</button>
      </div>
      <div class="date-weekdays">${weekdays}</div>
      <div class="date-days">${cells.join("")}</div>`;

    cal.pop.querySelector("[data-cal-prev]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      cal.cursor = new Date(year, month - 1, 1);
      renderCalendar(key);
    });
    cal.pop.querySelector("[data-cal-next]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      cal.cursor = new Date(year, month + 1, 1);
      renderCalendar(key);
    });
    cal.pop.querySelectorAll("[data-day]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const day = Number(btn.dataset.day);
        setDateValue(key, new Date(year, month, day));
      });
    });
  }

  function openCalendarFor(key) {
    const cal = calendars[key];
    if (!cal?.pop) return;
    if (openCalendar === key) {
      closeCalendar();
      return;
    }
    closeCalendar();
    openCalendar = key;
    cal.field?.classList.add("is-open");
    cal.pop.hidden = false;
    renderCalendar(key);
  }

  function renderSidebarEvents(events) {
    if (!eventsSubnav) return;
    eventsSubnav.innerHTML = "";
    if (!events?.length) {
      eventsSubnav.innerHTML = `<p class="dash-sub-empty">Du har ingen events</p>`;
      return;
    }
    events.forEach((event) => {
      const link = document.createElement("a");
      link.className = "dash-sublink";
      link.href = `event.html?id=${encodeURIComponent(event.id)}`;
      link.innerHTML = `<span></span><span class="dash-sub-arrow" aria-hidden="true">›</span>`;
      link.querySelector("span").textContent = event.title || "Event";
      eventsSubnav.appendChild(link);
    });
  }

  async function loadSidebar(userId) {
    const { data } = await client
      .from("events")
      .select("id, title")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    renderSidebarEvents(data || []);
  }

  function applyAvatar(user) {
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || user.email || "EP";
    const first = meta.given_name || name.split(" ")[0] || "E";
    const last = meta.family_name || name.split(" ")[1] || "";
    const initials = `${first.charAt(0)}${last.charAt(0) || ""}`.toUpperCase() || "EP";
    if (avatarInitials) avatarInitials.textContent = initials;
    const url = meta.avatar_url || meta.picture || "";
    if (!avatarImg || !url) return;
    avatarImg.referrerPolicy = "no-referrer";
    avatarImg.onload = () => {
      avatarImg.hidden = false;
      avatarBtn?.classList.add("has-photo");
    };
    avatarImg.src = url;
  }

  document.querySelectorAll("[data-theme-set]").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.dataset.themeSet));
  });

  function toggleNavGroup(trigger) {
    const group = trigger.closest(".dash-nav-group");
    if (!group) return;
    const open = group.classList.toggle("is-open");
    group.querySelectorAll(".dash-nav-toggle").forEach((btn) => {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    group.querySelectorAll("[data-nav-caret]").forEach((btn) => {
      btn.setAttribute("aria-label", open ? "Skjul events" : "Vis events");
    });
  }

  document.querySelectorAll(".dash-nav-toggle, [data-nav-caret]").forEach((btn) => {
    btn.addEventListener("click", () => toggleNavGroup(btn));
  });

  menuBtn?.addEventListener("click", () => {
    if (isMobileNav()) {
      app?.classList.toggle("is-sidebar-open");
      return;
    }
    app?.classList.toggle("is-sidebar-collapsed");
  });

  document.querySelectorAll("[data-select-plan]").forEach((btn) => {
    btn.addEventListener("click", () => selectPlan(btn.dataset.selectPlan));
  });

  document.getElementById("back-to-plans")?.addEventListener("click", () => showStep(1));
  document.getElementById("map-clear")?.addEventListener("click", () => {
    if (mapBox) mapBox.hidden = true;
  });

  locationInput?.addEventListener("input", () => {
    const value = locationInput.value;
    window.clearTimeout(suggestTimer);
    suggestTimer = window.setTimeout(() => fetchAddressSuggestions(value), 220);
    scheduleMapPreview(value);
  });

  locationInput?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && suggestItems.length) {
      e.preventDefault();
      activeSuggest = (activeSuggest + 1) % suggestItems.length;
      [...suggestionsEl.querySelectorAll(".location-suggestion")].forEach((el, i) => {
        el.classList.toggle("is-active", i === activeSuggest);
      });
      return;
    }
    if (e.key === "ArrowUp" && suggestItems.length) {
      e.preventDefault();
      activeSuggest = (activeSuggest - 1 + suggestItems.length) % suggestItems.length;
      [...suggestionsEl.querySelectorAll(".location-suggestion")].forEach((el, i) => {
        el.classList.toggle("is-active", i === activeSuggest);
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeSuggest >= 0) chooseSuggestion(activeSuggest);
      else {
        hideSuggestions();
        showMap(locationInput.value);
      }
    }
    if (e.key === "Escape") hideSuggestions();
  });

  locationInput?.addEventListener("blur", () => {
    window.setTimeout(() => hideSuggestions(), 140);
  });

  calendars.start.trigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    openCalendarFor("start");
  });
  calendars.end.trigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    openCalendarFor("end");
  });
  calendars.end.clearBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearEndDate();
  });

  document.addEventListener("click", (e) => {
    if (openCalendar && !e.target.closest(".date-field")) closeCalendar();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    if (formError) {
      formError.hidden = true;
      formError.textContent = "";
    }

    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim();
    const description = String(fd.get("description") || "").trim();
    const location = String(fd.get("location") || "").trim();
    const date = String(fd.get("date") || "").trim();
    const endDate = String(fd.get("end_date") || "").trim();
    const time = String(fd.get("time") || "").trim();

    if (!title || !date || !time) {
      if (formError) {
        formError.hidden = false;
        formError.textContent = "Udfyld navn, startdato og tidspunkt.";
      }
      return;
    }

    const startsAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startsAt.getTime())) {
      if (formError) {
        formError.hidden = false;
        formError.textContent = "Dato eller tidspunkt er ugyldigt.";
      }
      return;
    }

    let endsAt = null;
    if (endDate) {
      endsAt = new Date(`${endDate}T23:59:00`);
      if (Number.isNaN(endsAt.getTime()) || endsAt < startsAt) {
        if (formError) {
          formError.hidden = false;
          formError.textContent = "Slutdato skal være på eller efter startdato.";
        }
        return;
      }
    }

    const submitBtn = document.getElementById("create-submit");
    if (submitBtn) submitBtn.disabled = true;

    const { data: created, error } = await client
      .from("events")
      .insert({
        owner_id: currentUser.id,
        title,
        description: description || null,
        location: location || null,
        plan: selectedPlan,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt ? endsAt.toISOString() : null,
        starts_time: time,
        status: "active",
      })
      .select("id, title")
      .single();

    if (error) {
      if (formError) {
        formError.hidden = false;
        formError.textContent = error.message || "Kunne ikke oprette event.";
      }
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    await client.from("event_activity").insert({
      owner_id: currentUser.id,
      event_id: created.id,
      kind: "created",
      message: `Du oprettede “${created.title}” (${planNames[selectedPlan]})`,
    });

    window.location.href = `event.html?id=${encodeURIComponent(created.id)}`;
  });

  async function boot() {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      window.location.href = "auth.html?mode=login";
      return;
    }
    currentUser = sessionData.session.user;
    applyAvatar(currentUser);
    await loadSidebar(currentUser.id);
    setTheme(document.documentElement.getAttribute("data-theme") || "light");

    const today = new Date();
    calendars.start.selected = today;
    calendars.start.cursor = new Date(today.getFullYear(), today.getMonth(), 1);
    if (calendars.start.valueEl) calendars.start.valueEl.value = toIsoDate(today);
    if (calendars.start.labelEl) {
      calendars.start.labelEl.textContent = formatPrettyDate(today);
      calendars.start.labelEl.classList.remove("is-placeholder");
    }
    if (calendars.end.labelEl) {
      calendars.end.labelEl.textContent = calendars.end.placeholder;
      calendars.end.labelEl.classList.add("is-placeholder");
    }
  }

  boot();
})();
