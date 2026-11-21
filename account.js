(() => {
  const cfg = window.EVENTPLAN_CONFIG;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !window.supabase) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const title = document.getElementById("dash-title");
  const sub = document.getElementById("dash-sub");
  const logoutBtn = document.getElementById("logout-btn");

  async function load() {
    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      window.location.href = "index.html?auth=login";
      return;
    }

    const user = session.user;
    const { data: profile } = await client
      .from("profiles")
      .select("first_name, last_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    const first = profile?.first_name || user.user_metadata?.first_name || "";
    const last = profile?.last_name || user.user_metadata?.last_name || "";
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
    window.location.href = "index.html?auth=login";
  });

  load();
})();
