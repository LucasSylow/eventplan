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
  const profileRoot = document.getElementById("dash-profile");
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
  const notifRoot = document.getElementById("dash-notif");
  const notifBtn = document.getElementById("dash-notif-btn");
  const notifMenu = document.getElementById("dash-notif-menu");
  const notifList = document.getElementById("dash-notif-list");
  const notifCount = document.getElementById("dash-notif-count");
  let menuOpen = false;
  let notifOpen = false;
  let menuCloseTimer = null;
  let notifCloseTimer = null;
  let setupRunning = false;
  let hydratedOnce = false;
  let currentUserId = null;
  let cachedEvents = [];
  let cachedGuestStats = {};
  let cachedActivity = [];
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
    closeNotifMenu();
    window.clearTimeout(menuCloseTimer);
    profileMenu.hidden = false;
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

  function openNotifMenu() {
    if (!notifMenu) return;
    closeProfileMenu();
    window.clearTimeout(notifCloseTimer);
    notifMenu.hidden = false;
    void notifMenu.offsetWidth;
    notifMenu.classList.add("is-open");
    notifBtn?.classList.add("is-open");
    notifBtn?.setAttribute("aria-expanded", "true");
    notifOpen = true;
  }

  function closeNotifMenu() {
    if (!notifMenu || !notifOpen) {
      if (notifMenu) {
        notifMenu.classList.remove("is-open");
        notifMenu.hidden = true;
      }
      notifBtn?.classList.remove("is-open");
      notifBtn?.setAttribute("aria-expanded", "false");
      notifOpen = false;
      return;
    }
    notifMenu.classList.remove("is-open");
    notifBtn?.classList.remove("is-open");
    notifBtn?.setAttribute("aria-expanded", "false");
    notifOpen = false;
    notifCloseTimer = window.setTimeout(() => {
      if (!notifOpen) notifMenu.hidden = true;
    }, 200);
  }

  function toggleNotifMenu() {
    if (notifOpen) closeNotifMenu();
    else openNotifMenu();
  }

  function renderNotifications(list) {
    const items = list || [];
    if (notifCount) notifCount.textContent = String(items.length);
    notifBtn?.classList.toggle("has-dot", items.length > 0);

    if (!notifList) return;
    notifList.innerHTML = "";

    if (!items.length) {
      notifList.innerHTML = `
        <div class="dash-notif-empty">
          <p>Ingen aktivitet endnu</p>
          <span>Når der sker noget på dine events, dukker det op her.</span>
        </div>`;
      return;
    }

    items.slice(0, 8).forEach((item) => {
      const row = document.createElement(item.event_id ? "a" : "div");
      row.className = "dash-notif-item";
      if (item.event_id) {
        row.href = `event.html?id=${encodeURIComponent(item.event_id)}`;
      }
      row.innerHTML = `
        <span class="dash-notif-dot" aria-hidden="true"></span>
        <div class="dash-notif-body">
          <strong></strong>
          <span></span>
        </div>
        <time class="dash-notif-time"></time>`;
      row.querySelector("strong").textContent = item.message || "Aktivitet";
      row.querySelector(".dash-notif-body span").textContent = item.event_title || "Event";
      row.querySelector("time").textContent = formatRelative(item.created_at);
      notifList.appendChild(row);
    });
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

  function eventsByDay(events) {
    const map = {};
    (events || []).forEach((event) => {
      const raw = event.starts_at || event.created_at;
      if (!raw) return;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(event);
    });
    return map;
  }

  function formatTimeShort(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  }

  function parseLocationParts(location) {
    const raw = String(location || "").trim();
    if (!raw) return { place: "", city: "" };
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { place: parts[0], city: parts.slice(1).join(", ") };
    }
    return { place: raw, city: "" };
  }

  function eventTimeLabel(event) {
    if (event?.starts_time) return String(event.starts_time).slice(0, 5);
    return formatTimeShort(event?.starts_at) || "Heldags";
  }

  function mapsEmbedUrl(location) {
    const q = String(location || "").trim();
    if (!q) return "";
    return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=14&output=embed`;
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
      link.href = `event.html?id=${encodeURIComponent(event.id)}`;
      link.dataset.eventId = event.id;
      link.innerHTML = `<span></span><span class="dash-sub-arrow" aria-hidden="true">›</span>`;
      link.querySelector("span").textContent = event.title || "Untitled event";
      eventsSubnav.appendChild(link);
    });
  }

  function daysUntilParts(startsAt) {
    if (!startsAt) return { value: "—", label: "dato" };
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) return { value: "—", label: "dato" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(start);
    day.setHours(0, 0, 0, 0);
    const diff = Math.round((day - today) / 86400000);
    if (diff === 0) return { value: "I dag", label: "starter" };
    if (diff === 1) return { value: "1", label: "dag til" };
    if (diff > 1) return { value: String(diff), label: "dage til" };
    if (diff === -1) return { value: "1", label: "dag siden" };
    return { value: String(Math.abs(diff)), label: "dage siden" };
  }

  function renderOverviewEvents(events, guestStats = {}) {
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
      const stats = guestStats[event.id] || { invited: 0, attending: 0 };
      const row = document.createElement("a");
      row.className = "ov-event";
      row.href = `event.html?id=${encodeURIComponent(event.id)}`;
      row.style.animationDelay = `${index * 0.04}s`;
      row.innerHTML = `
        <div class="ov-event-top">
          <div class="ov-event-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="M8 3.5V7M16 3.5V7M3.5 10h17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          </div>
          <div class="ov-event-copy">
            <strong></strong>
            <span class="ov-event-meta"></span>
          </div>
          <span class="ov-event-status">Aktiv</span>
        </div>
        <div class="ov-event-stats">
          <div class="ov-event-stat"><b class="stat-days"></b><span class="stat-days-label">dage til</span></div>
          <div class="ov-event-stat"><b class="stat-invited"></b><span>inviteret</span></div>
          <div class="ov-event-stat"><b class="stat-attending"></b><span>deltager</span></div>
        </div>`;
      const countdown = daysUntilParts(event.starts_at);
      row.querySelector("strong").textContent = event.title || "Untitled event";
      row.querySelector(".ov-event-meta").textContent = formatDate(
        event.starts_at || event.created_at
      );
      row.querySelector(".stat-days").textContent = countdown.value;
      row.querySelector(".stat-days-label").textContent = countdown.label;
      row.querySelector(".stat-invited").textContent = String(stats.invited);
      row.querySelector(".stat-attending").textContent = String(stats.attending);
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
    cachedActivity = list || [];
    renderNotifications(cachedActivity);

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
        <div class="ov-activity-body">
          <p class="ov-activity-msg"></p>
          <p class="ov-activity-sub"></p>
        </div>
        <span class="ov-activity-time"></span>`;
      row.querySelector(".ov-activity-msg").textContent = item.message || "Aktivitet";
      row.querySelector(".ov-activity-sub").textContent = item.event_title || "Event";
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
    const byDay = eventsByDay(cachedEvents);
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
      const dayEvents = byDay[key] || [];
      const isToday =
        today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      const classes = ["ov-cal-day"];
      if (isToday) classes.push("is-today");
      if (dayEvents.length) classes.push("has-event");

      let tip = "";
      if (dayEvents.length) {
        const primary = dayEvents[0];
        const hasLocation = Boolean(String(primary.location || "").trim());
        const mapBlock = hasLocation
          ? `<div class="ov-cal-tip-map" data-map-q="" aria-hidden="true"><span class="ov-cal-tip-map-ph">Kort</span></div>`
          : "";
        const more =
          dayEvents.length > 1
            ? `<p class="ov-cal-tip-more">+${dayEvents.length - 1} mere · klik for admin</p>`
            : `<p class="ov-cal-tip-more">Klik for eventadministration</p>`;
        tip = `
          <div class="ov-cal-tip" role="tooltip">
            <p class="ov-cal-tip-title"></p>
            <div class="ov-cal-tip-stats">
              <span><b class="tip-attending"></b> deltager</span>
              <span><b class="tip-invited"></b> inviteret</span>
            </div>
            ${mapBlock}
            <div class="ov-cal-tip-meta">
              <p class="ov-cal-tip-place"></p>
              <p class="ov-cal-tip-city"></p>
              <p class="ov-cal-tip-time"></p>
            </div>
            ${more}
          </div>`;
      }

      cells.push(
        `<button type="button" class="${classes.join(" ")}" data-cal-key="${key}">${day}${tip}</button>`
      );
    }
    while (cells.length % 7 !== 0) {
      const day = cells.length - (startWeekday + daysInMonth) + 1;
      cells.push(`<button type="button" class="ov-cal-day is-muted" tabindex="-1">${day}</button>`);
    }

    calMonth.innerHTML = `<div class="ov-cal-weekdays">${weekdays}</div><div class="ov-cal-days">${cells.join("")}</div>`;

    calMonth.querySelectorAll(".ov-cal-day.has-event").forEach((btn) => {
      const key = btn.dataset.calKey;
      const dayEvents = byDay[key] || [];
      const primary = dayEvents[0];
      if (!primary) return;

      const stats = cachedGuestStats[primary.id] || { invited: 0, attending: 0 };
      const loc = parseLocationParts(primary.location);
      const titleEl = btn.querySelector(".ov-cal-tip-title");
      const placeEl = btn.querySelector(".ov-cal-tip-place");
      const cityEl = btn.querySelector(".ov-cal-tip-city");
      const timeEl = btn.querySelector(".ov-cal-tip-time");
      const mapEl = btn.querySelector(".ov-cal-tip-map");

      if (titleEl) titleEl.textContent = primary.title || "Event";
      btn.querySelector(".tip-attending").textContent = String(stats.attending);
      btn.querySelector(".tip-invited").textContent = String(stats.invited);
      if (placeEl) {
        placeEl.textContent = loc.place || "Lokation ikke sat";
        placeEl.hidden = false;
      }
      if (cityEl) {
        cityEl.textContent = loc.city;
        cityEl.hidden = !loc.city;
      }
      if (timeEl) timeEl.textContent = eventTimeLabel(primary);
      if (mapEl && primary.location) {
        mapEl.dataset.mapQ = primary.location;
      }

      const ensureMap = () => {
        if (!mapEl || mapEl.dataset.ready === "1") return;
        const q = mapEl.dataset.mapQ;
        const src = mapsEmbedUrl(q);
        if (!src) return;
        mapEl.dataset.ready = "1";
        mapEl.innerHTML = `<iframe src="${src}" title="Kort" loading="lazy" referrerpolicy="no-referrer-when-downgrade" tabindex="-1"></iframe>`;
      };

      btn.addEventListener("mouseenter", ensureMap);
      btn.addEventListener("focus", ensureMap);
      btn.addEventListener("click", () => {
        if (primary.id) window.location.href = `event.html?id=${encodeURIComponent(primary.id)}`;
      });
    });
  }

  async function loadOverviewData(userId) {
    currentUserId = userId;
    const [{ data: events }, { data: collabs }, { data: activity }, { data: guests }] =
      await Promise.all([
        client
          .from("events")
          .select("id, title, starts_at, starts_time, created_at, status, location")
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
        client
          .from("event_guests")
          .select("event_id, status")
          .eq("owner_id", userId),
      ]);

    const guestStats = {};
    (guests || []).forEach((guest) => {
      if (!guestStats[guest.event_id]) {
        guestStats[guest.event_id] = { invited: 0, attending: 0 };
      }
      guestStats[guest.event_id].invited += 1;
      if (guest.status === "attending") guestStats[guest.event_id].attending += 1;
    });

    cachedEvents = events || [];
    cachedGuestStats = guestStats;
    renderSidebarEvents(cachedEvents);
    renderOverviewEvents(cachedEvents, guestStats);
    renderCollaborators(collabs || []);
    renderActivity(
      (activity || []).map((item) => ({
        ...item,
        event_title: item.events?.title || "Event",
      }))
    );
    renderCalendar();
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
    closeNotifMenu();
  });

  avatarBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleProfileMenu();
  });

  notifBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNotifMenu();
  });

  document.addEventListener("click", (e) => {
    if (menuOpen && !profileRoot?.contains(e.target)) {
      closeProfileMenu();
    }
    if (notifOpen && !notifRoot?.contains(e.target)) {
      closeNotifMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeProfileMenu();
      closeNotifMenu();
    }
  });

  document.getElementById("cal-prev")?.addEventListener("click", () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderCalendar("prev");
  });
  document.getElementById("cal-next")?.addEventListener("click", () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderCalendar("next");
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
