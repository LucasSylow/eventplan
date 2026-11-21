(() => {
  const card = document.getElementById("auth-card");
  const signupForm = document.getElementById("signup-form");
  const loginForm = document.getElementById("login-form");
  if (!card || (!signupForm && !loginForm)) return;

  const title = document.getElementById("auth-title");
  const sub = document.getElementById("auth-sub");
  const statusEl = document.getElementById("auth-status");
  const switchEl = document.getElementById("auth-switch");
  const socialBtns = document.querySelectorAll("[data-oauth]");

  let client = null;
  let mode = "signup";

  function getClient() {
    if (client) return client;
    const cfg = window.EVENTPLAN_CONFIG;
    const lib = window.supabase;
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !lib?.createClient) return null;
    client = lib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return client;
  }

  function safeNextPath() {
    const next = new URLSearchParams(window.location.search).get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
    return next;
  }

  function accountUrl() {
    const next = safeNextPath();
    if (next) return `${window.location.origin}${next}`;
    return `${window.location.origin}/account.html`;
  }

  function postAuthRedirect() {
    const next = safeNextPath();
    window.location.href = next || "account.html";
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

  function setSocialLoading(loading, activeProvider) {
    socialBtns.forEach((btn) => {
      btn.disabled = loading;
      if (loading && btn.dataset.oauth === activeProvider) {
        btn.classList.add("is-loading");
      } else {
        btn.classList.remove("is-loading");
      }
    });
  }

  function updateSwitch(next) {
    if (!switchEl) return;
    if (next === "login") {
      switchEl.innerHTML =
        'Har du ikke en konto? <button type="button" data-auth-mode="signup">Opret bruger</button>';
    } else {
      switchEl.innerHTML =
        'Har du allerede en bruger? <button type="button" data-auth-mode="login">Log ind</button>';
    }
  }

  function switchMode(next) {
    mode = next === "login" ? "login" : "signup";
    const isLogin = mode === "login";
    if (signupForm) signupForm.hidden = isLogin;
    if (loginForm) loginForm.hidden = !isLogin;
    if (title) title.textContent = isLogin ? "Velkommen tilbage" : "Opret din konto";
    if (sub) {
      sub.textContent = isLogin
        ? "Log ind for at fortsætte med dine events."
        : "Udfyld dig selv — så er du klar til dit første event.";
    }
    updateSwitch(mode);
    setStatus("");
    const url = new URL(window.location.href);
    if (isLogin) url.searchParams.set("mode", "login");
    else url.searchParams.delete("mode");
    window.history.replaceState({}, "", url);
  }

  function translateAuthError(msg) {
    const m = String(msg || "").toLowerCase();
    if (m.includes("invalid login")) return "Forkert email eller adgangskode.";
    if (m.includes("already registered") || m.includes("user already"))
      return "Der findes allerede en bruger med den email.";
    if (m.includes("password")) return "Adgangskoden skal være mindst 6 tegn.";
    if (m.includes("email")) return "Tjek at emailen er gyldig.";
    if (m.includes("rate")) return "For mange forsøg. Prøv igen om lidt.";
    if (m.includes("provider is not enabled") || m.includes("unsupported provider"))
      return "Google-login er ikke aktiveret endnu. Tjek Google i Supabase.";
    if (m.includes("redirect")) return "Redirect-URL er ikke tilladt. Tilføj siden i Supabase Auth.";
    return msg;
  }

  async function startOAuth(provider) {
    setStatus("");
    const sb = getClient();
    if (!sb) {
      setStatus("Kunne ikke forbinde til login-systemet. Genindlæs siden.", "error");
      return;
    }

    setSocialLoading(true, provider);
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: accountUrl(),
          queryParams: { access_type: "online", prompt: "select_account" },
        },
      });
      if (error) throw error;
      setStatus("Sender dig til Google…", "ok");
    } catch (err) {
      setStatus(
        translateAuthError(err?.message || "Kunne ikke starte social login."),
        "error"
      );
      card.classList.add("shake");
      window.setTimeout(() => card.classList.remove("shake"), 450);
      setSocialLoading(false);
    }
  }

  switchEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-auth-mode]");
    if (!btn) return;
    switchMode(btn.dataset.authMode);
  });

  socialBtns.forEach((btn) => {
    btn.addEventListener("click", () => startOAuth(btn.dataset.oauth));
  });

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
          emailRedirectTo: accountUrl(),
        },
      });
      if (error) throw error;

      if (data.session) {
        setStatus("Konto oprettet — sender dig videre…", "ok");
        postAuthRedirect();
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
      postAuthRedirect();
    } catch (err) {
      setStatus(translateAuthError(err?.message || "Kunne ikke logge ind."), "error");
      card.classList.add("shake");
      window.setTimeout(() => card.classList.remove("shake"), 450);
    } finally {
      setLoading(loginForm, false);
    }
  });

  async function redirectIfLoggedIn() {
    const sb = getClient();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    if (data.session) postAuthRedirect();
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("error_description") || params.get("error")) {
    setStatus(
      translateAuthError(params.get("error_description") || params.get("error")),
      "error"
    );
  }

  if (params.get("mode") === "login") switchMode("login");
  else switchMode("signup");

  redirectIfLoggedIn();
})();
