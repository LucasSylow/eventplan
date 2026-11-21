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
  const app = document.querySelector(".dash-app");
  const menuBtn = document.getElementById("dash-menu-btn");
  const backdrop = document.getElementById("dash-backdrop");

  let menuOpen = false;
  let menuCloseTimer = null;

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

  async function hydrateUser(user) {
    if (!user) {
      window.location.href = "auth.html?mode=login";
      return;
    }

    const { data: profile } = await client
      .from("profiles")
      .select("first_name, last_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    const { first, last } = pickName(profile, user);
    const name = `${first} ${last}`.trim() || "dig";
    const email = profile?.email || user.email || "";
    const chars = initials(first, last, email);
    const avatarUrl = pickAvatarUrl(user);

    if (title) title.textContent = `Hej ${first || name}`;
    if (sub) {
      sub.textContent =
        "Dit overblik kommer her snart. Navigationen er klar — indhold følger.";
    }
    if (profileName) profileName.textContent = name === "dig" ? "Din konto" : name;
    if (profileEmail) profileEmail.textContent = email;
    if (avatarInitials) avatarInitials.textContent = chars;
    if (menuInitials) menuInitials.textContent = chars;
    applyAvatar(avatarUrl, name);
  }

  async function load() {
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      window.location.href = "auth.html?mode=login";
      return;
    }

    // Fresh user payload (better metadata after Google login)
    const { data: userData } = await client.auth.getUser();
    await hydrateUser(userData.user || sessionData.session.user);
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
    if (e.key === "Escape") closeProfileMenu();
  });

  document.getElementById("dash-create")?.addEventListener("click", () => {
    if (sub) sub.textContent = "Opret event kommer snart — skallen er klar.";
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
    if (session?.user && (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED")) {
      hydrateUser(session.user);
    }
  });

  const current = document.documentElement.getAttribute("data-theme") || "light";
  setTheme(current);
  load();
})();
