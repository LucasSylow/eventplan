(() => {
  const cfg = window.EVENTPLAN_CONFIG;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !window.supabase) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const title = document.getElementById("dash-title");
  const sub = document.getElementById("dash-sub");
  const logoutBtn = document.getElementById("logout-btn");
  const avatarBtn = document.getElementById("dash-avatar");
  const avatarImg = document.getElementById("dash-avatar-img");
  const avatarInitials = document.getElementById("dash-avatar-initials");
  const menuAvatarImg = document.getElementById("dash-menu-avatar-img");
  const menuInitials = document.getElementById("dash-menu-initials");
  const profileMenu = document.getElementById("dash-profile-menu");
  const profileName = document.getElementById("dash-profile-name");
  const profileEmail = document.getElementById("dash-profile-email");
  const app = document.getElementById("dash-app") || document.querySelector(".dash-app");
  const menuBtn = document.getElementById("dash-menu-btn");
  const backdrop = document.getElementById("dash-backdrop");
  const setupScreen = document.getElementById("setup-screen");
  const setupName = document.getElementById("setup-name");
  const setupStatus = document.getElementById("setup-status");
  const eventsSubnav = document.getElementById("events-subnav");
  const overviewEvents = document.getElementById("overview-events");
  const overviewCollab = document.getElementById("overview-collab");
  const overviewActivity = document.getElementById("overview-activity");
  const eventsCount = document.getElementById("events-count");
  const calLabel = document.getElementById("cal-label");
  const calMonth = document.getElementById("cal-month");
  const calTrack = document.getElementById("cal-track");
  const createModal = document.getElementById("create-event-modal");
  const createForm = document.getElementById("create-event-form");
  const createError = document.getElementById("create-event-error");

  let menuOpen = false;
  let menuCloseTimer = null;
  let setupRunning = false;
  let hydratedOnce = false;
  let currentUserId = null;
  let cachedEvents = [];
  let calCursor = new Date();
  calCursor.setDate(1);

  function pickName(profile, user) {
    const meta = user?.user_metadata || {};
    const first =
      profile?.first_name ||
      meta.first_name ||
      meta.given_name ||
      (meta.full_name || meta.name || "").split(" ")[0] ||
      "";
    const last =
      profile?.last_name ||
      meta.last_name ||
      meta.family_name ||
      "";
    return { first, last };
  }

  function initials(first, last, email) {
    const a = (first || "").trim().charAt(0);
    const b = (last || "").trim().charAt(0);
    if (a && b) return `${a}${b}`.toUpperCase();
    if (a) return a.toUpperCase();
    return (email || "EP").slice(0, 2).toUpperCase();
  }

  function pickAvatarUrl(user) {
    const meta = user?.user_metadata || {};
    const fromMeta =
      meta.avatar_url ||
      meta.picture ||
      meta.avatar ||
      meta.image ||
      "";
    if (fromMeta) return fromMeta;

    const identity = (user?.identities || []).find((item) => item?.identity_data);
    const data = identity?.identity_data || {};
    return data.avatar_url || data.picture || data.avatar || "";
  }

  function applyAvatar(url, name) {
    const targets = [
      { img: avatarImg, host: avatarBtn },
      { img: menuAvatarImg, host: menuAvatarImg?.closest(".dash-avatar") },
    ];

    targets.forEach(({ img, host }) => {
      if (!img) return;
      if (!url) {
        img.hidden = true;
        img.removeAttribute("src");
        host?.classList.remove("has-photo");
        return;
      }

      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.alt = name || "";
      img.onload = () => {
        img.hidden = false;
        host?.classList.add("has-photo");
      };
      img.onerror = () => {
        img.hidden = true;
        img.removeAttribute("src");
        host?.classList.remove("has-photo");
      };
      if (img.src !== url) img.src = url;
      else if (img.complete && img.naturalWidth) {
        img.hidden = false;
        host?.classList.add("has-photo");
      }
    });
  }

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

  function closeSidebar() {
    app?.classList.remove("is-sidebar-open");
    if (backdrop) backdrop.hidden = true;
  }

  function openSidebar() {
    app?.classList.add("is-sidebar-open");
    if (backdrop) backdrop.hidden = false;
  }

  function toggleSidebar() {
    if (isMobileNav()) {
      if (app?.classList.contains("is-sidebar-open")) closeSidebar();
      else openSidebar();
      return;
    }
    app?.classList.toggle("is-sidebar-collapsed");
    const collapsed = app?.classList.contains("is-sidebar-collapsed");
    if (menuBtn) {
      menuBtn.setAttribute("aria-label", collapsed ? "Vis navigation" : "Skjul navigation");
      menuBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
    localStorage.setItem("eventplan-sidebar", collapsed ? "collapsed" : "open");
  }

  function openProfileMenu() {
    if (!profileMenu) return;
    window.clearTimeout(menuCloseTimer);
    profileMenu.hidden = false;
    // force reflow so transition plays
    void profileMenu.offsetWidth;
    profileMenu.classList.add("is-open");
    avatarBtn?.classList.add("is-open");
    avatarBtn?.setAttribute("aria-expanded", "true");
    menuOpen = true;
  }

  function closeProfileMenu() {
    if (!profileMenu || !menuOpen) {
      if (profileMenu) {
        profileMenu.classList.remove("is-open");
        profileMenu.hidden = true;
      }
      avatarBtn?.classList.remove("is-open");
      avatarBtn?.setAttribute("aria-expanded", "false");
      menuOpen = false;
      return;
    }
    profileMenu.classList.remove("is-open");
    avatarBtn?.classList.remove("is-open");
    avatarBtn?.setAttribute("aria-expanded", "false");
    menuOpen = false;
    menuCloseTimer = window.setTimeout(() => {
      if (!menuOpen) profileMenu.hidden = true;
    }, 220);
  }

  function toggleProfileMenu() {
    if (menuOpen) closeProfileMenu();
    else openProfileMenu();
  }

  function formatDate(value) {
    if (!value) return "Ingen dato";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Ingen dato";
    return d.toLocaleDateString("da-DK", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function formatRelative(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const diff = Date.now() - d.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "nu";
    if (mins < 60) return `${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} t`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} d`;
    return formatDate(value);
  }

  function monthLabel(date) {
    const label = date.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function eventDayKeys(events) {
    const keys = new Set();
    (events || []).forEach((event) => {
      const raw = event.starts_at || event.created_at;
      if (!raw) return;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return;
      keys.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return keys;
  }

  function renderSidebarEvents(events) {
    if (!eventsSubnav) return;
    eventsSubnav.innerHTML = "";

    if (!events?.length) {
      const empty = document.createElement("p");
      empty.className = "dash-sub-empty";
      empty.textContent = "Du har ingen events";
      eventsSubnav.appendChild(empty);
      return;
    }

    events.forEach((event) => {
      const link = document.createElement("a");
      link.className = "dash-sublink";
      link.href = `#event-${event.id}`;
      link.dataset.eventId = event.id;
      link.innerHTML = `<span></span><span class="dash-sub-arrow" aria-hidden="true">›</span>`;
      link.querySelector("span").textContent = event.title || "Untitled event";
      eventsSubnav.appendChild(link);
    });
  }

  function renderOverviewEvents(events) {
    if (!overviewEvents) return;
    if (eventsCount) eventsCount.textContent = String(events?.length || 0);
    overviewEvents.innerHTML = "";

    if (!events?.length) {
      overviewEvents.innerHTML = `
        <div class="ov-empty" id="events-empty-state">
          <div class="ov-empty-orb" aria-hidden="true"></div>
          <p>Ingen events</p>
          <span>Opret dit første event og få overblikket her.</span>
        </div>`;
      return;
    }

    events.forEach((event, index) => {
      const row = document.createElement("article");
      row.className = "ov-event";
      row.style.animationDelay = `${index * 0.04}s`;
      row.innerHTML = `
        <div class="ov-event-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="M8 3.5V7M16 3.5V7M3.5 10h17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </div>
        <div>
          <strong></strong>
          <span></span>
        </div>
        <span class="ov-event-status">Aktiv</span>`;
      row.querySelector("strong").textContent = event.title || "Untitled event";
      row.querySelector("span:not(.ov-event-status)").textContent = formatDate(
        event.starts_at || event.created_at
      );
      overviewEvents.appendChild(row);
    });
  }

  function renderCollaborators(list) {
    if (!overviewCollab) return;
    overviewCollab.innerHTML = "";
    if (!list?.length) {
      overviewCollab.innerHTML = `
        <div class="ov-empty ov-empty-sm">
          <p>Ingen</p>
          <span>Når du inviterer medarrangører, vises de her.</span>
        </div>`;
      return;
    }

    list.forEach((person) => {
      const el = document.createElement("div");
      el.className = "ov-person";
      const avatar = document.createElement("div");
      avatar.className = "ov-person-avatar";
      if (person.avatar_url) {
        const img = document.createElement("img");
        img.src = person.avatar_url;
        img.alt = person.name || "";
        img.referrerPolicy = "no-referrer";
        avatar.appendChild(img);
      } else {
        avatar.textContent = (person.name || "?").slice(0, 2).toUpperCase();
      }
      const label = document.createElement("span");
      label.textContent = person.name || "Medarrangør";
      el.append(avatar, label);
      overviewCollab.appendChild(el);
    });
  }

  function renderActivity(list) {
    if (!overviewActivity) return;
    overviewActivity.innerHTML = "";
    if (!list?.length) {
      overviewActivity.innerHTML = `
        <div class="ov-empty ov-empty-sm">
          <p>Ingen aktivitet endnu</p>
          <span>Handlingerne på dine events dukker op her.</span>
        </div>`;
      return;
    }

    list.forEach((item) => {
      const row = document.createElement("div");
      row.className = "ov-activity-item";
      row.innerHTML = `
        <span class="ov-activity-dot" aria-hidden="true"></span>
        <div>
          <strong></strong>
          <span></span>
        </div>
        <span class="ov-activity-time"></span>`;
      row.querySelector("strong").textContent = item.message || "Aktivitet";
      row.querySelector("div span").textContent = item.event_title || "Event";
      row.querySelector(".ov-activity-time").textContent = formatRelative(item.created_at);
      overviewActivity.appendChild(row);
    });
  }

  function renderCalendar(direction) {
    if (!calMonth || !calLabel) return;
    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    calLabel.textContent = monthLabel(calCursor);

    if (calTrack && direction) {
      calTrack.classList.remove("is-slide-left", "is-slide-right");
      void calTrack.offsetWidth;
      calTrack.classList.add(direction === "next" ? "is-slide-left" : "is-slide-right");
    }

    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();
    const marked = eventDayKeys(cachedEvents);
    const today = new Date();

    const weekdays = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"]
      .map((d) => `<span>${d}</span>`)
      .join("");

    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) {
      const day = prevDays - startWeekday + i + 1;
      cells.push(`<button type="button" class="ov-cal-day is-muted" tabindex="-1">${day}</button>`);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${year}-${month}-${day}`;
      const isToday =
        today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      const classes = ["ov-cal-day"];
      if (isToday) classes.push("is-today");
      if (marked.has(key)) classes.push("has-event");
      cells.push(`<button type="button" class="${classes.join(" ")}">${day}</button>`);
    }
    while (cells.length % 7 !== 0) {
      const day = cells.length - (startWeekday + daysInMonth) + 1;
      cells.push(`<button type="button" class="ov-cal-day is-muted" tabindex="-1">${day}</button>`);
    }

    calMonth.innerHTML = `<div class="ov-cal-weekdays">${weekdays}</div><div class="ov-cal-days">${cells.join("")}</div>`;
  }

  async function loadOverviewData(userId) {
    currentUserId = userId;
    const [{ data: events }, { data: collabs }, { data: activity }] = await Promise.all([
      client
        .from("events")
        .select("id, title, starts_at, created_at, status")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false }),
      client
        .from("event_collaborators")
        .select("id, name, avatar_url, event_id")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false }),
      client
        .from("event_activity")
        .select("id, message, created_at, event_id, events(title)")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    cachedEvents = events || [];
    renderSidebarEvents(cachedEvents);
    renderOverviewEvents(cachedEvents);
    renderCollaborators(collabs || []);
    renderActivity(
      (activity || []).map((item) => ({
        ...item,
        event_title: item.events?.title || "Event",
      }))
    );
    renderCalendar();
  }

  function openCreateModal() {
    if (!createModal) return;
    createModal.hidden = false;
    if (createError) {
      createError.hidden = true;
      createError.textContent = "";
    }
    const dateInput = createForm?.querySelector('input[name="starts_at"]');
    if (dateInput && !dateInput.value) {
      const today = new Date();
      dateInput.value = today.toISOString().slice(0, 10);
    }
    createForm?.querySelector('input[name="title"]')?.focus();
  }

  function closeCreateModal() {
    if (createModal) createModal.hidden = true;
  }

  function fillDashboard(user, profile) {
    const { first, last } = pickName(profile, user);
    const name = `${first} ${last}`.trim() || "dig";
    const email = profile?.email || user.email || "";
    const chars = initials(first, last, email);
    const avatarUrl = pickAvatarUrl(user);

    if (title) title.textContent = `Hej ${first || name}`;
    if (sub) {
      sub.textContent = "Dit overblik over events, aktivitet og medarrangører.";
    }
    if (profileName) profileName.textContent = name === "dig" ? "Din konto" : name;
    if (profileEmail) profileEmail.textContent = email;
    if (avatarInitials) avatarInitials.textContent = chars;
    if (menuInitials) menuInitials.textContent = chars;
    applyAvatar(avatarUrl, name);
    return { first, name };
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function runSetup(userId, firstName) {
    if (!setupScreen || setupRunning) return;
    setupRunning = true;
    app?.classList.add("is-setup-pending");
    if (setupName) setupName.textContent = firstName || "dig";
    setupScreen.hidden = false;

    const steps = setupScreen.querySelectorAll(".setup-steps span");
    const messages = [
      "Gør klar til dine events…",
      "Tilpasser dit workspace…",
      "Næsten klar…",
    ];

    for (let i = 0; i < messages.length; i += 1) {
      if (setupStatus) setupStatus.textContent = messages[i];
      steps.forEach((el, idx) => el.classList.toggle("is-active", idx <= i));
      await wait(i === 0 ? 1400 : 1100);
    }

    if (setupStatus) setupStatus.textContent = "Din konto er klar";
    await client
      .from("profiles")
      .update({ onboarding_done: true, updated_at: new Date().toISOString() })
      .eq("id", userId);

    await wait(500);
    setupScreen.classList.add("is-leaving");
    await wait(520);
    setupScreen.hidden = true;
    setupScreen.classList.remove("is-leaving");
    app?.classList.remove("is-setup-pending");
    setupRunning = false;
  }

  async function fetchProfile(userId) {
    let profile = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data } = await client
        .from("profiles")
        .select("first_name, last_name, email, phone, onboarding_done")
        .eq("id", userId)
        .maybeSingle();
      profile = data;
      if (profile) break;
      await wait(300);
    }
    return profile;
  }

  async function hydrateUser(user, { allowSetup = true } = {}) {
    if (!user) {
      window.location.href = "auth.html?mode=login";
      return;
    }

    const profile = await fetchProfile(user.id);
    const { first } = fillDashboard(user, profile);
    await loadOverviewData(user.id);
    hydratedOnce = true;

    const createdMs = new Date(user.created_at || 0).getTime();
    const isFreshAccount = Number.isFinite(createdMs) && Date.now() - createdMs < 15 * 60 * 1000;
    const needsSetup =
      allowSetup &&
      ((profile && profile.onboarding_done === false) || (!profile && isFreshAccount));
    if (needsSetup) await runSetup(user.id, first);
  }

  async function load() {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      window.location.href = "auth.html?mode=login";
      return;
    }

    const { data: userData } = await client.auth.getUser();
    await hydrateUser(userData.user || sessionData.session.user, { allowSetup: true });
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

  menuBtn?.addEventListener("click", toggleSidebar);

  if (!isMobileNav() && localStorage.getItem("eventplan-sidebar") === "collapsed") {
    app?.classList.add("is-sidebar-collapsed");
    menuBtn?.setAttribute("aria-label", "Vis navigation");
    menuBtn?.setAttribute("aria-expanded", "false");
  } else {
    menuBtn?.setAttribute("aria-expanded", "true");
  }

  backdrop?.addEventListener("click", () => {
    closeSidebar();
    closeProfileMenu();
  });

  avatarBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleProfileMenu();
  });

  document.addEventListener("click", (e) => {
    if (!menuOpen) return;
    if (profileMenu?.contains(e.target) || avatarBtn?.contains(e.target)) return;
    closeProfileMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeProfileMenu();
    closeCreateModal();
  });

  document.getElementById("dash-create")?.addEventListener("click", openCreateModal);
  document.getElementById("overview-create")?.addEventListener("click", openCreateModal);
  document.getElementById("cal-prev")?.addEventListener("click", () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderCalendar("prev");
  });
  document.getElementById("cal-next")?.addEventListener("click", () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderCalendar("next");
  });

  createModal?.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeCreateModal);
  });

  createForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUserId) return;
    if (createError) {
      createError.hidden = true;
      createError.textContent = "";
    }

    const fd = new FormData(createForm);
    const titleValue = String(fd.get("title") || "").trim();
    const dateValue = String(fd.get("starts_at") || "").trim();
    if (!titleValue || !dateValue) return;

    const startsAt = new Date(`${dateValue}T12:00:00`);
    const { data: created, error } = await client
      .from("events")
      .insert({
        owner_id: currentUserId,
        title: titleValue,
        starts_at: startsAt.toISOString(),
        status: "active",
      })
      .select("id, title")
      .single();

    if (error) {
      if (createError) {
        createError.hidden = false;
        createError.textContent = error.message || "Kunne ikke oprette event.";
      }
      return;
    }

    await client.from("event_activity").insert({
      owner_id: currentUserId,
      event_id: created.id,
      kind: "created",
      message: `Du oprettede “${created.title}”`,
    });

    createForm.reset();
    closeCreateModal();
    await loadOverviewData(currentUserId);
  });

  logoutBtn?.addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.href = "auth.html?mode=login";
  });

  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      window.location.href = "auth.html?mode=login";
      return;
    }
    if (
      session?.user &&
      !setupRunning &&
      (event === "USER_UPDATED" || (event === "SIGNED_IN" && hydratedOnce))
    ) {
      hydrateUser(session.user, { allowSetup: false });
    }
  });

  const current = document.documentElement.getAttribute("data-theme") || "light";
  setTheme(current);
  load();
})();
