(() => {
  const cfg = window.EVENTPLAN_CONFIG;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !window.supabase) {
    console.error("Supabase config mangler");
    return;
  }

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const tabs = document.querySelectorAll(".auth-tab");
  const tabWrap = document.querySelector(".auth-tabs");
  const signupForm = document.getElementById("signup-form");
  const loginForm = document.getElementById("login-form");
  const title = document.getElementById("auth-title");
  const sub = document.getElementById("auth-sub");
  const statusEl = document.getElementById("auth-status");
  const card = document.getElementById("auth-card");

  let mode = "signup";

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
    card?.classList.remove("shake");
    void card?.offsetWidth;
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchMode(tab.dataset.tab));
  });

  async function redirectIfLoggedIn() {
    const { data } = await client.auth.getSession();
    if (data.session) {
      window.location.href = "account.html";
    }
  }

  signupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");
    setLoading(signupForm, true);

    const fd = new FormData(signupForm);
    const firstName = String(fd.get("first_name") || "").trim();
    const lastName = String(fd.get("last_name") || "").trim();
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const phone = String(fd.get("phone") || "").trim();
    const password = String(fd.get("password") || "");

    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            phone,
          },
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
      const msg = err?.message || "Kunne ikke oprette konto.";
      setStatus(translateAuthError(msg), "error");
      card?.classList.add("shake");
    } finally {
      setLoading(signupForm, false);
    }
  });

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");
    setLoading(loginForm, true);

    const fd = new FormData(loginForm);
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const password = String(fd.get("password") || "");

    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setStatus("Du er logget ind — sender dig videre…", "ok");
      window.location.href = "account.html";
    } catch (err) {
      const msg = err?.message || "Kunne ikke logge ind.";
      setStatus(translateAuthError(msg), "error");
      card?.classList.add("shake");
    } finally {
      setLoading(loginForm, false);
    }
  });

  function translateAuthError(msg) {
    const m = msg.toLowerCase();
    if (m.includes("invalid login")) return "Forkert email eller adgangskode.";
    if (m.includes("already registered") || m.includes("user already"))
      return "Der findes allerede en bruger med den email.";
    if (m.includes("password")) return "Adgangskoden skal være mindst 6 tegn.";
    if (m.includes("email")) return "Tjek at emailen er gyldig.";
    if (m.includes("rate")) return "For mange forsøg. Prøv igen om lidt.";
    return msg;
  }

  // Deep-link support: auth.html?mode=login
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "login") switchMode("login");

  redirectIfLoggedIn();
})();
