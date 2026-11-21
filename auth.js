(() => {
  const overlay = document.getElementById("auth-overlay");
  const card = document.getElementById("auth-card");
  if (!overlay || !card) return;

  const tabs = document.querySelectorAll(".auth-tab");
  const tabWrap = document.querySelector(".auth-tabs");
  const signupForm = document.getElementById("signup-form");
  const loginForm = document.getElementById("login-form");
  const title = document.getElementById("auth-title");
  const sub = document.getElementById("auth-sub");
  const statusEl = document.getElementById("auth-status");

  let client = null;
  let mode = "signup";

  function getClient() {
    if (client) return client;
    const cfg = window.EVENTPLAN_CONFIG;
    const lib = window.supabase;
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !lib?.createClient) {
      return null;
    }
    client = lib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return client;
  }

  function setStatus(message, type) {
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.className = "auth-status";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = `auth-status is-${type}`;
  }

  function setLoading(form, loading) {
    const btn = form.querySelector(".auth-submit");
    if (!btn) return;
    btn.classList.toggle("is-loading", loading);
    btn.disabled = loading;
  }

  function switchMode(next) {
    mode = next;
    const isLogin = next === "login";
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === next;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    tabWrap?.setAttribute("data-mode", next);
    if (signupForm) signupForm.hidden = isLogin;
    if (loginForm) loginForm.hidden = !isLogin;
    if (title) title.textContent = isLogin ? "Velkommen tilbage" : "Opret din konto";
    if (sub) {
      sub.textContent = isLogin
        ? "Log ind for at fortsætte med dine events."
        : "Kom i gang på under et minut — så kan du oprette dit første event.";
    }
    setStatus("");
  }

  function openAuth(nextMode = "signup") {
    switchMode(nextMode === "login" ? "login" : "signup");
    overlay.hidden = false;
    // force reflow so CSS transition runs
    void overlay.offsetWidth;
    overlay.classList.add("is-open");
    document.body.classList.add("auth-open");
    const firstInput = overlay.querySelector(
      nextMode === "login"
        ? "#login-form input[name='email']"
        : "#signup-form input[name='first_name']"
    );
    window.setTimeout(() => firstInput?.focus(), 50);
  }

  function closeAuth() {
    overlay.classList.remove("is-open");
    document.body.classList.remove("auth-open");
    window.setTimeout(() => {
      if (!overlay.classList.contains("is-open")) overlay.hidden = true;
    }, 280);
    setStatus("");
  }

  window.EventplanAuth = { open: openAuth, close: closeAuth };

  // Event delegation so buttons always work
  document.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-auth-open]");
    if (openBtn) {
      e.preventDefault();
      openAuth(openBtn.getAttribute("data-auth-open") || "signup");
      return;
    }
    if (e.target.closest("[data-auth-close]")) {
      e.preventDefault();
      closeAuth();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) closeAuth();
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchMode(tab.dataset.tab));
  });

  function translateAuthError(msg) {
    const m = String(msg || "").toLowerCase();
    if (m.includes("invalid login")) return "Forkert email eller adgangskode.";
    if (m.includes("already registered") || m.includes("user already"))
      return "Der findes allerede en bruger med den email.";
    if (m.includes("password")) return "Adgangskoden skal være mindst 6 tegn.";
    if (m.includes("email")) return "Tjek at emailen er gyldig.";
    if (m.includes("rate")) return "For mange forsøg. Prøv igen om lidt.";
    return msg;
  }

  signupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");
    const sb = getClient();
    if (!sb) {
      setStatus("Kunne ikke forbinde til login-systemet. Genindlæs siden.", "error");
      return;
    }
    setLoading(signupForm, true);

    const fd = new FormData(signupForm);
    const firstName = String(fd.get("first_name") || "").trim();
    const lastName = String(fd.get("last_name") || "").trim();
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const phone = String(fd.get("phone") || "").trim();
    const password = String(fd.get("password") || "");

    try {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: firstName, last_name: lastName, phone },
          emailRedirectTo: `${window.location.origin}/account.html`,
        },
      });
      if (error) throw error;

      if (data.session) {
        setStatus("Konto oprettet — sender dig videre…", "ok");
        window.location.href = "account.html";
        return;
      }

      setStatus(
        "Konto oprettet. Tjek din email for bekræftelseslink, og log derefter ind.",
        "ok"
      );
      switchMode("login");
      const emailInput = loginForm?.querySelector('input[name="email"]');
      if (emailInput) emailInput.value = email;
    } catch (err) {
      setStatus(translateAuthError(err?.message || "Kunne ikke oprette konto."), "error");
      card.classList.add("shake");
      window.setTimeout(() => card.classList.remove("shake"), 450);
    } finally {
      setLoading(signupForm, false);
    }
  });

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");
    const sb = getClient();
    if (!sb) {
      setStatus("Kunne ikke forbinde til login-systemet. Genindlæs siden.", "error");
      return;
    }
    setLoading(loginForm, true);

    const fd = new FormData(loginForm);
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const password = String(fd.get("password") || "");

    try {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setStatus("Du er logget ind — sender dig videre…", "ok");
      window.location.href = "account.html";
    } catch (err) {
      setStatus(translateAuthError(err?.message || "Kunne ikke logge ind."), "error");
      card.classList.add("shake");
      window.setTimeout(() => card.classList.remove("shake"), 450);
    } finally {
      setLoading(loginForm, false);
    }
  });

  const params = new URLSearchParams(window.location.search);
  const authParam = params.get("auth");
  if (authParam === "login" || authParam === "signup") {
    openAuth(authParam);
  }
})();
