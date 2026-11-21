(() => {
  const cfg = window.EVENTPLAN_CONFIG;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !window.supabase) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const app = document.getElementById("dash-app");
  const menuBtn = document.getElementById("dash-menu-btn");
  const eventsSubnav = document.getElementById("events-subnav");
  const avatarBtn = document.getElementById("dash-avatar");
  const avatarImg = document.getElementById("dash-avatar-img");
  const avatarInitials = document.getElementById("dash-avatar-initials");
  const titleEl = document.getElementById("event-title");
  const subEl = document.getElementById("event-sub");
  const planEl = document.getElementById("event-plan");
  const dateEl = document.getElementById("event-date");
  const timeEl = document.getElementById("event-time");
  const locationEl = document.getElementById("event-location");
  const mapBox = document.getElementById("event-map");
  const mapFrame = document.getElementById("event-map-frame");

  const planNames = {
    standard: "Standard",
    gratis: "Standard",
    premium: "Premium",
    pro: "Pro",
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

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("da-DK", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function renderSidebarEvents(events, activeId) {
    if (!eventsSubnav) return;
    eventsSubnav.innerHTML = "";
    if (!events?.length) {
      eventsSubnav.innerHTML = `<p class="dash-sub-empty">Du har ingen events</p>`;
      return;
    }
    events.forEach((event) => {
      const link = document.createElement("a");
      link.className = `dash-sublink${event.id === activeId ? " is-active" : ""}`;
      link.href = `event.html?id=${encodeURIComponent(event.id)}`;
      link.innerHTML = `<span></span><span class="dash-sub-arrow" aria-hidden="true">›</span>`;
      link.querySelector("span").textContent = event.title || "Event";
      eventsSubnav.appendChild(link);
    });
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

  async function boot() {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("id");
    if (!eventId) {
      window.location.href = "account.html";
      return;
    }

    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      window.location.href = "auth.html?mode=login";
      return;
    }

    const user = sessionData.session.user;
    applyAvatar(user);
    setTheme(document.documentElement.getAttribute("data-theme") || "light");

    const [{ data: event, error }, { data: events }] = await Promise.all([
      client
        .from("events")
        .select("id, title, description, location, plan, starts_at, ends_at, starts_time")
        .eq("id", eventId)
        .eq("owner_id", user.id)
        .maybeSingle(),
      client
        .from("events")
        .select("id, title")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    renderSidebarEvents(events || [], eventId);

    if (error || !event) {
      if (titleEl) titleEl.textContent = "Event ikke fundet";
      if (subEl) subEl.textContent = "Gå tilbage til oversigten og prøv igen.";
      return;
    }

    document.title = `${event.title} — Eventplan`;
    if (titleEl) titleEl.textContent = event.title;
    if (subEl) {
      subEl.textContent = event.description?.trim()
        ? event.description.trim()
        : "Event-dashboardet er klar til næste features.";
    }
    if (planEl) planEl.textContent = planNames[event.plan] || event.plan || "Standard";
    if (dateEl) dateEl.textContent = formatDate(event.starts_at);
    const endDateEl = document.getElementById("event-end-date");
    if (endDateEl) {
      endDateEl.textContent = event.ends_at ? formatDate(event.ends_at) : "Ikke sat";
    }
    if (timeEl) {
      timeEl.textContent =
        event.starts_time ||
        (event.starts_at
          ? new Date(event.starts_at).toLocaleTimeString("da-DK", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—");
    }
    if (locationEl) locationEl.textContent = event.location?.trim() || "Ikke sat endnu";

    if (event.location?.trim() && mapBox && mapFrame) {
      mapFrame.src = `https://maps.google.com/maps?q=${encodeURIComponent(event.location)}&z=14&output=embed`;
      mapBox.hidden = false;
    }
  }

  boot();
})();
