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
  const eventsSubnav = document.getElementById("events-subnav");
  const avatarBtn = document.getElementById("dash-avatar");
  const avatarImg = document.getElementById("dash-avatar-img");
  const avatarInitials = document.getElementById("dash-avatar-initials");

  const planNames = { gratis: "Gratis", premium: "Premium", pro: "Pro" };
  let currentUser = null;
  let selectedPlan = "gratis";

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
    selectedPlan = planNames[plan] ? plan : "gratis";
    if (selectedPlanLabel) selectedPlanLabel.textContent = planNames[selectedPlan];
    showStep(2);
  }

  function showMap(query) {
    if (!mapBox || !mapFrame || !query) return;
    mapFrame.src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=14&output=embed`;
    mapBox.hidden = false;
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

  document.querySelectorAll(".dash-nav-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".dash-nav-group");
      const open = group?.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
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

  document.getElementById("preview-location")?.addEventListener("click", () => {
    const value = String(locationInput?.value || "").trim();
    if (!value) {
      if (mapBox) mapBox.hidden = true;
      return;
    }
    showMap(value);
  });

  locationInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("preview-location")?.click();
    }
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
    const time = String(fd.get("time") || "").trim();

    if (!title || !date || !time) {
      if (formError) {
        formError.hidden = false;
        formError.textContent = "Udfyld navn, dato og tidspunkt.";
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

    const dateInput = form?.querySelector('input[name="date"]');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
  }

  boot();
})();
