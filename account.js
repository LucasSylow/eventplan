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

  async function load() {
    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      window.location.href = "auth.html?mode=login";
      return;
    }

    const user = session.user;
    const { data: profile } = await client
      .from("profiles")
      .select("first_name, last_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    const { first, last } = pickName(profile, user);
    const name = `${first} ${last}`.trim() || "dig";
    const email = profile?.email || user.email || "";
    const phone = profile?.phone || user.user_metadata?.phone || "";

    if (title) title.textContent = `Hej ${first || name}`;
    if (sub) {
      sub.textContent = phone
        ? `Du er logget ind som ${email} · ${phone}`
        : `Du er logget ind som ${email}`;
    }
  }

  logoutBtn?.addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.href = "auth.html?mode=login";
  });

  load();
})();
