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
  const contentEl = document.getElementById("event-content");
  const shellEl = document.getElementById("event-shell");
  const titleEl = document.getElementById("event-title");
  const subEl = document.getElementById("event-sub");
  const planEl = document.getElementById("event-plan");
  const roleEl = document.getElementById("event-role");
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

  const statusLabels = {
    attending: "Deltager",
    invited: "Ikke svaret",
    declined: "Kan ikke",
    maybe: "Måske",
  };

  let currentUser = null;
  let currentEvent = null;
  let isOwner = false;
  let guestFilter = "all";
  let dragGuestId = null;

  const state = {
    guests: [],
    tables: [],
    todos: [],
    wishes: [],
    collabs: [],
    program: [],
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

  function setBooting(on) {
    contentEl?.classList.toggle("is-booting", Boolean(on));
    contentEl?.setAttribute("aria-busy", on ? "true" : "false");
    if (shellEl) shellEl.hidden = Boolean(on);
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

  function formatDateShort(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
  }

  function formatDateTimeLocal(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatTimeRange(start, end) {
    const fmt = (v) => {
      if (!v) return "";
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    };
    const a = fmt(start);
    const b = fmt(end);
    if (a && b) return `${a} – ${b}`;
    return a || b || "Tid ikke sat";
  }

  function initials(name, email) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
    return String(email || "G").slice(0, 2).toUpperCase();
  }

  function token() {
    if (crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, "");
    return `${Date.now()}${Math.random().toString(16).slice(2)}`;
  }

  function logActivity(message) {
    if (!currentEvent || !currentUser) return;
    client.from("event_activity").insert({
      event_id: currentEvent.id,
      owner_id: currentEvent.owner_id || currentUser.id,
      kind: "note",
      message,
    }).then(() => {});
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
    const chars = `${first.charAt(0)}${last.charAt(0) || ""}`.toUpperCase() || "EP";
    if (avatarInitials) avatarInitials.textContent = chars;
    const url = meta.avatar_url || meta.picture || "";
    if (!avatarImg || !url) return;
    avatarImg.referrerPolicy = "no-referrer";
    avatarImg.onload = () => {
      avatarImg.hidden = false;
      avatarBtn?.classList.add("has-photo");
    };
    avatarImg.src = url;
  }

  function switchTab(tab) {
    document.querySelectorAll(".event-tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".event-panel").forEach((panel) => {
      const active = panel.dataset.panel === tab;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    if (tab === "seating") renderSeating();
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    history.replaceState({}, "", url);
  }

  function guestCounts() {
    const counts = { all: state.guests.length, attending: 0, invited: 0, declined: 0, maybe: 0 };
    state.guests.forEach((g) => {
      if (counts[g.status] != null) counts[g.status] += 1;
    });
    return counts;
  }

  function renderOverview() {
    const stats = document.getElementById("overview-stats");
    const snap = document.getElementById("overview-snap");
    const c = guestCounts();
    const todosDone = state.todos.filter((t) => t.done).length;
    if (stats) {
      stats.innerHTML = `
        <div class="ev-stat"><b>${c.all}</b><span>gæster</span></div>
        <div class="ev-stat"><b>${c.attending}</b><span>deltager</span></div>
        <div class="ev-stat"><b>${todosDone}/${state.todos.length}</b><span>to-do klaret</span></div>
        <div class="ev-stat"><b>${state.program.length}</b><span>programpunkter</span></div>`;
    }
    if (snap) {
      snap.innerHTML = `
        <div class="ev-snap-row"><strong>Bordplan</strong><span>${state.tables.length} borde · ${state.guests.filter((g) => g.table_id).length} placeret</span></div>
        <div class="ev-snap-row"><strong>Ønskeliste</strong><span>${state.wishes.length} ønsker</span></div>
        <div class="ev-snap-row"><strong>Medarrangører</strong><span>${state.collabs.length}</span></div>
        <div class="ev-snap-row"><strong>Ikke svaret</strong><span>${c.invited}</span></div>`;
    }
  }

  function renderGuests() {
    const list = document.getElementById("guest-list");
    if (!list) return;
    const items = state.guests.filter((g) => guestFilter === "all" || g.status === guestFilter);
    if (!items.length) {
      list.innerHTML = `<div class="ev-empty">Ingen gæster i denne kategori endnu.</div>`;
      return;
    }
    list.innerHTML = "";
    items.forEach((guest, i) => {
      const row = document.createElement("div");
      row.className = "ev-guest-card";
      row.style.animationDelay = `${i * 0.03}s`;
      row.innerHTML = `
        <div class="ev-guest-avatar"></div>
        <div class="ev-guest-copy">
          <strong></strong>
          <span></span>
        </div>
        <div class="ev-guest-actions">
          <span class="ev-badge ${guest.status}"></span>
          <select data-guest-status="${guest.id}" aria-label="Status">
            <option value="invited">Ikke svaret</option>
            <option value="attending">Deltager</option>
            <option value="maybe">Måske</option>
            <option value="declined">Kan ikke</option>
          </select>
          <button type="button" class="ev-icon-btn" data-guest-del="${guest.id}" aria-label="Fjern">×</button>
        </div>`;
      row.querySelector(".ev-guest-avatar").textContent = initials(guest.name, guest.email);
      row.querySelector("strong").textContent = guest.name || guest.email || "Gæst";
      row.querySelector(".ev-guest-copy span").textContent = [
        guest.email || "Ingen email",
        `Inviteret ${formatDateShort(guest.created_at)}`,
      ].join(" · ");
      row.querySelector(".ev-badge").textContent = statusLabels[guest.status] || guest.status;
      row.querySelector("select").value = guest.status || "invited";
      list.appendChild(row);
    });
  }

  function renderSeating() {
    const pool = document.getElementById("seat-guest-pool");
    const floor = document.getElementById("seat-floor");
    if (!pool || !floor) return;

    const unplaced = state.guests.filter((g) => !g.table_id);
    pool.innerHTML = "";
    if (!unplaced.length) {
      pool.innerHTML = `<div class="ev-empty">Alle gæster er placeret</div>`;
    } else {
      unplaced.forEach((guest) => {
        const chip = document.createElement("div");
        chip.className = "seat-chip";
        chip.draggable = true;
        chip.dataset.guestId = guest.id;
        chip.textContent = guest.name || guest.email || "Gæst";
        chip.addEventListener("dragstart", (e) => {
          dragGuestId = guest.id;
          chip.classList.add("is-dragging");
          e.dataTransfer.setData("text/plain", guest.id);
          e.dataTransfer.effectAllowed = "move";
        });
        chip.addEventListener("dragend", () => {
          chip.classList.remove("is-dragging");
          dragGuestId = null;
        });
        pool.appendChild(chip);
      });
    }

    floor.innerHTML = "";
    state.tables.forEach((table) => {
      const el = document.createElement("div");
      el.className = `seat-table${table.shape === "round" ? " is-round" : ""}`;
      el.style.left = `${table.x || 80}px`;
      el.style.top = `${table.y || 80}px`;
      el.style.width = `${table.width || 150}px`;
      el.style.minHeight = `${table.height || 96}px`;
      el.dataset.tableId = table.id;

      const seated = state.guests.filter((g) => g.table_id === table.id);
      const seats = Math.max(table.seats || 8, seated.length);
      const slots = Array.from({ length: seats }, (_, idx) => seated[idx] || null);

      el.innerHTML = `
        <div class="seat-table-head">
          <input class="seat-table-name" value="" maxlength="40" />
          <button type="button" class="ev-icon-btn" data-table-del="${table.id}" aria-label="Slet bord">×</button>
        </div>
        <div class="seat-table-seats"></div>`;
      el.querySelector(".seat-table-name").value = table.name || "Bord";
      const seatWrap = el.querySelector(".seat-table-seats");
      slots.forEach((guest, idx) => {
        const slot = document.createElement("div");
        slot.className = `seat-slot${guest ? " has-guest" : ""}`;
        slot.dataset.seatIndex = String(idx);
        if (guest) {
          slot.textContent = guest.name || "Gæst";
          slot.draggable = true;
          slot.dataset.guestId = guest.id;
          slot.addEventListener("dragstart", (e) => {
            dragGuestId = guest.id;
            e.dataTransfer.setData("text/plain", guest.id);
          });
          slot.addEventListener("dblclick", () => assignGuest(guest.id, null, null));
        } else {
          slot.textContent = `Plads ${idx + 1}`;
        }
        seatWrap.appendChild(slot);
      });

      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.classList.add("is-over");
      });
      el.addEventListener("dragleave", () => el.classList.remove("is-over"));
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("is-over");
        const id = e.dataTransfer.getData("text/plain") || dragGuestId;
        if (id) assignGuest(id, table.id, seated.length);
      });

      el.querySelector(".seat-table-name").addEventListener("change", async (e) => {
        const name = e.target.value.trim() || "Bord";
        await client.from("event_tables").update({ name }).eq("id", table.id);
        table.name = name;
      });

      enableTableDrag(el, table);
      floor.appendChild(el);
    });

    if (!state.tables.length) {
      floor.innerHTML = `<div class="ev-empty" style="margin:40px">Tilføj et bord for at starte bordplanen.</div>`;
    }
  }

  function enableTableDrag(el, table) {
    let startX = 0;
    let startY = 0;
    let origX = 0;
    let origY = 0;
    let moving = false;

    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest("input,button,.seat-slot")) return;
      moving = true;
      startX = e.clientX;
      startY = e.clientY;
      origX = table.x || 80;
      origY = table.y || 80;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!moving) return;
      table.x = Math.max(0, origX + (e.clientX - startX));
      table.y = Math.max(0, origY + (e.clientY - startY));
      el.style.left = `${table.x}px`;
      el.style.top = `${table.y}px`;
    });
    el.addEventListener("pointerup", async () => {
      if (!moving) return;
      moving = false;
      await client
        .from("event_tables")
        .update({ x: table.x, y: table.y })
        .eq("id", table.id);
    });
  }

  async function assignGuest(guestId, tableId, seatIndex) {
    const guest = state.guests.find((g) => g.id === guestId);
    if (!guest) return;
    const payload = {
      table_id: tableId,
      seat_index: tableId == null ? null : seatIndex ?? 0,
    };
    const { error } = await client.from("event_guests").update(payload).eq("id", guestId);
    if (error) {
      alert(error.message);
      return;
    }
    guest.table_id = tableId;
    guest.seat_index = payload.seat_index;
    renderSeating();
    renderOverview();
  }

  function renderWishlist() {
    const list = document.getElementById("wish-list");
    const open = document.getElementById("wish-external-open");
    const input = document.getElementById("wish-external-url");
    if (input) input.value = currentEvent?.wishlist_external_url || "";
    if (open) {
      const url = currentEvent?.wishlist_external_url || "";
      open.hidden = !url;
      open.href = url || "#";
    }
    if (!list) return;
    if (!state.wishes.length) {
      list.innerHTML = `<div class="ev-empty">Ingen ønsker endnu. Tilføj det første.</div>`;
      return;
    }
    list.innerHTML = "";
    state.wishes.forEach((item, i) => {
      const card = document.createElement("div");
      card.className = "wish-card";
      card.style.animationDelay = `${i * 0.03}s`;
      card.innerHTML = `
        <div class="wish-card-body">
          <strong></strong>
          <span></span>
          <div class="wish-card-actions">
            <a class="ev-btn ev-btn-ghost" target="_blank" rel="noopener" hidden>Åbn link</a>
            <button type="button" class="ev-btn ev-btn-ghost" data-wish-claim></button>
            <button type="button" class="ev-icon-btn" data-wish-del aria-label="Slet">×</button>
          </div>
        </div>`;
      card.querySelector("strong").textContent = item.title;
      card.querySelector("span").textContent = item.price || (item.claimed ? "Reserveret" : "Ønske");
      const link = card.querySelector("a");
      if (item.url) {
        link.hidden = false;
        link.href = item.url;
      }
      const claimBtn = card.querySelector("[data-wish-claim]");
      claimBtn.textContent = item.claimed ? "Frigiv" : "Markér reserveret";
      claimBtn.addEventListener("click", async () => {
        const { error } = await client
          .from("event_wishlist_items")
          .update({ claimed: !item.claimed })
          .eq("id", item.id);
        if (!error) {
          item.claimed = !item.claimed;
          renderWishlist();
        }
      });
      card.querySelector("[data-wish-del]").addEventListener("click", async () => {
        const { error } = await client.from("event_wishlist_items").delete().eq("id", item.id);
        if (!error) {
          state.wishes = state.wishes.filter((w) => w.id !== item.id);
          renderWishlist();
          renderOverview();
        }
      });
      list.appendChild(card);
    });
  }

  function renderTodos() {
    const list = document.getElementById("todo-list");
    const progress = document.getElementById("todo-progress");
    const done = state.todos.filter((t) => t.done).length;
    const pct = state.todos.length ? Math.round((done / state.todos.length) * 100) : 0;
    if (progress) progress.innerHTML = `<span style="width:${pct}%"></span>`;
    if (!list) return;
    if (!state.todos.length) {
      list.innerHTML = `<div class="ev-empty">Ingen opgaver endnu. Tilføj den første ovenfor.</div>`;
      return;
    }
    list.innerHTML = "";
    state.todos.forEach((todo, i) => {
      const row = document.createElement("div");
      row.className = `todo-item${todo.done ? " is-done" : ""}`;
      row.style.animationDelay = `${i * 0.03}s`;
      row.innerHTML = `
        <button type="button" class="todo-check" aria-label="Marker færdig">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div>
          <p class="todo-title"></p>
          <p class="todo-meta"></p>
        </div>
        <button type="button" class="ev-icon-btn" data-todo-del aria-label="Slet">×</button>`;
      row.querySelector(".todo-title").textContent = todo.title;
      row.querySelector(".todo-meta").textContent = todo.due_at
        ? `Frist ${formatDateShort(todo.due_at)}`
        : "Ingen frist";
      row.querySelector(".todo-check").addEventListener("click", async () => {
        const { error } = await client
          .from("event_todos")
          .update({ done: !todo.done })
          .eq("id", todo.id);
        if (!error) {
          todo.done = !todo.done;
          renderTodos();
          renderOverview();
        }
      });
      row.querySelector("[data-todo-del]").addEventListener("click", async () => {
        const { error } = await client.from("event_todos").delete().eq("id", todo.id);
        if (!error) {
          state.todos = state.todos.filter((t) => t.id !== todo.id);
          renderTodos();
          renderOverview();
        }
      });
      list.appendChild(row);
    });
  }

  function renderCollabs() {
    const list = document.getElementById("collab-list");
    if (!list) return;
    if (!state.collabs.length) {
      list.innerHTML = `<div class="ev-empty">Ingen medarrangører endnu.</div>`;
      return;
    }
    list.innerHTML = "";
    state.collabs.forEach((person, i) => {
      const row = document.createElement("div");
      row.className = "collab-card";
      row.style.animationDelay = `${i * 0.03}s`;
      const inviteUrl = person.invite_token
        ? `${window.location.origin}/invite.html?token=${encodeURIComponent(person.invite_token)}`
        : "";
      row.innerHTML = `
        <div class="ev-guest-avatar"></div>
        <div>
          <strong></strong>
          <span></span>
        </div>
        <div class="ev-guest-actions">
          <span class="ev-badge ${person.status === "accepted" ? "attending" : "invited"}"></span>
          ${inviteUrl ? `<button type="button" class="ev-btn ev-btn-ghost" data-copy>Kopiér link</button>` : ""}
          <a class="ev-btn ev-btn-ghost" data-mail hidden>Email</a>
          <button type="button" class="ev-icon-btn" data-collab-del aria-label="Fjern">×</button>
        </div>`;
      row.querySelector(".ev-guest-avatar").textContent = initials(person.name, person.email);
      row.querySelector("strong").textContent = person.name || person.email || "Medarrangør";
      row.querySelector("span").textContent = [
        person.email || "",
        person.status === "accepted" ? "Accepteret" : "Afventer",
        `Inviteret ${formatDateShort(person.invited_at || person.created_at)}`,
      ]
        .filter(Boolean)
        .join(" · ");
      row.querySelector(".ev-badge").textContent =
        person.status === "accepted" ? "Aktiv" : "Afventer";
      const copyBtn = row.querySelector("[data-copy]");
      copyBtn?.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          copyBtn.textContent = "Kopieret";
          setTimeout(() => {
            copyBtn.textContent = "Kopiér link";
          }, 1200);
        } catch {
          prompt("Kopiér invitationslinket:", inviteUrl);
        }
      });
      const mail = row.querySelector("[data-mail]");
      if (mail && person.email && inviteUrl) {
        mail.hidden = false;
        mail.href = `mailto:${encodeURIComponent(person.email)}?subject=${encodeURIComponent(
          `Medarrangør: ${currentEvent.title}`
        )}&body=${encodeURIComponent(
          `Hej ${person.name || ""},\n\nDu er inviteret som medarrangør til “${currentEvent.title}”.\nÅbn linket for at acceptere:\n${inviteUrl}\n`
        )}`;
        mail.textContent = "Send mail";
      }
      row.querySelector("[data-collab-del]").addEventListener("click", async () => {
        if (!isOwner) return;
        const { error } = await client.from("event_collaborators").delete().eq("id", person.id);
        if (!error) {
          state.collabs = state.collabs.filter((c) => c.id !== person.id);
          renderCollabs();
          renderOverview();
        }
      });
      list.appendChild(row);
    });
  }

  function renderProgram() {
    const list = document.getElementById("program-list");
    if (!list) return;
    const items = [...state.program].sort((a, b) => {
      const ta = a.starts_at ? new Date(a.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.starts_at ? new Date(b.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb || (a.sort_order || 0) - (b.sort_order || 0);
    });
    if (!items.length) {
      list.innerHTML = `<div class="ev-empty">Ingen programpunkter endnu.</div>`;
      return;
    }
    list.innerHTML = "";
    items.forEach((item, i) => {
      const row = document.createElement("article");
      row.className = "program-item";
      row.style.animationDelay = `${i * 0.04}s`;
      row.innerHTML = `
        <div class="program-time"></div>
        <div class="program-body">
          <h3></h3>
          <p class="program-desc"></p>
          <p class="program-loc" hidden></p>
          <img class="program-img" alt="" hidden />
          <div class="program-actions">
            <button type="button" class="ev-btn ev-btn-danger" data-program-del>Slet</button>
          </div>
        </div>`;
      row.querySelector(".program-time").textContent = formatTimeRange(item.starts_at, item.ends_at);
      row.querySelector("h3").textContent = item.title;
      const desc = row.querySelector(".program-desc");
      desc.textContent = item.description || "Ingen beskrivelse";
      const loc = row.querySelector(".program-loc");
      if (item.location) {
        loc.hidden = false;
        loc.textContent = item.location;
      }
      const img = row.querySelector(".program-img");
      if (item.image_url) {
        img.hidden = false;
        img.src = item.image_url;
      }
      row.querySelector("[data-program-del]").addEventListener("click", async () => {
        const { error } = await client.from("event_program_items").delete().eq("id", item.id);
        if (!error) {
          state.program = state.program.filter((p) => p.id !== item.id);
          renderProgram();
          renderOverview();
        }
      });
      list.appendChild(row);
    });
  }

  function renderAll() {
    renderOverview();
    renderGuests();
    renderSeating();
    renderWishlist();
    renderTodos();
    renderCollabs();
    renderProgram();
  }

  async function loadEventData(eventId) {
    const [
      { data: guests },
      { data: tables },
      { data: todos },
      { data: wishes },
      { data: collabs },
      { data: program },
    ] = await Promise.all([
      client.from("event_guests").select("*").eq("event_id", eventId).order("created_at", { ascending: true }),
      client.from("event_tables").select("*").eq("event_id", eventId).order("created_at", { ascending: true }),
      client.from("event_todos").select("*").eq("event_id", eventId).order("sort_order", { ascending: true }),
      client.from("event_wishlist_items").select("*").eq("event_id", eventId).order("sort_order", { ascending: true }),
      client.from("event_collaborators").select("*").eq("event_id", eventId).order("created_at", { ascending: true }),
      client.from("event_program_items").select("*").eq("event_id", eventId).order("sort_order", { ascending: true }),
    ]);
    state.guests = guests || [];
    state.tables = tables || [];
    state.todos = todos || [];
    state.wishes = wishes || [];
    state.collabs = collabs || [];
    state.program = program || [];
  }

  async function fetchEventForUser(eventId, user) {
    const { data: owned } = await client
      .from("events")
      .select("id, title, description, location, plan, starts_at, ends_at, starts_time, owner_id, wishlist_external_url")
      .eq("id", eventId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (owned) return { event: owned, owner: true };

    const { data: collab } = await client
      .from("event_collaborators")
      .select("id, status, event_id")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .maybeSingle();
    if (!collab) return { event: null, owner: false };

    const { data: shared } = await client
      .from("events")
      .select("id, title, description, location, plan, starts_at, ends_at, starts_time, owner_id, wishlist_external_url")
      .eq("id", eventId)
      .maybeSingle();
    return { event: shared, owner: false };
  }

  function wireUi() {
    document.querySelectorAll(".event-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    document.getElementById("guest-add-btn")?.addEventListener("click", () => {
      const form = document.getElementById("guest-form");
      if (form) form.hidden = !form.hidden;
    });
    document.getElementById("guest-form-cancel")?.addEventListener("click", () => {
      const form = document.getElementById("guest-form");
      if (form) form.hidden = true;
    });
    document.getElementById("guest-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        event_id: currentEvent.id,
        owner_id: currentUser.id,
        name: String(fd.get("name") || "").trim(),
        email: String(fd.get("email") || "").trim() || null,
        status: String(fd.get("status") || "invited"),
      };
      const { data, error } = await client.from("event_guests").insert(payload).select("*").single();
      if (error) return alert(error.message);
      state.guests.push(data);
      e.target.reset();
      e.target.hidden = true;
      logActivity(`Gæst tilføjet: ${data.name || data.email}`);
      renderGuests();
      renderSeating();
      renderOverview();
    });

    document.getElementById("guest-filters")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-guest-filter]");
      if (!btn) return;
      guestFilter = btn.dataset.guestFilter;
      document.querySelectorAll("#guest-filters button").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
      });
      renderGuests();
    });

    document.getElementById("guest-list")?.addEventListener("change", async (e) => {
      const sel = e.target.closest("[data-guest-status]");
      if (!sel) return;
      const id = sel.dataset.guestStatus;
      const status = sel.value;
      const { error } = await client.from("event_guests").update({ status }).eq("id", id);
      if (error) return alert(error.message);
      const guest = state.guests.find((g) => g.id === id);
      if (guest) guest.status = status;
      renderGuests();
      renderOverview();
    });
    document.getElementById("guest-list")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-guest-del]");
      if (!btn) return;
      const id = btn.dataset.guestDel;
      const { error } = await client.from("event_guests").delete().eq("id", id);
      if (error) return alert(error.message);
      state.guests = state.guests.filter((g) => g.id !== id);
      renderGuests();
      renderSeating();
      renderOverview();
    });

    document.getElementById("table-add-rect")?.addEventListener("click", () => addTable("rect"));
    document.getElementById("table-add-round")?.addEventListener("click", () => addTable("round"));
    document.getElementById("seat-floor")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-table-del]");
      if (!btn) return;
      const id = btn.dataset.tableDel;
      await client.from("event_guests").update({ table_id: null, seat_index: null }).eq("table_id", id);
      const { error } = await client.from("event_tables").delete().eq("id", id);
      if (error) return alert(error.message);
      state.guests.forEach((g) => {
        if (g.table_id === id) {
          g.table_id = null;
          g.seat_index = null;
        }
      });
      state.tables = state.tables.filter((t) => t.id !== id);
      renderSeating();
      renderOverview();
    });

    document.getElementById("wish-add-btn")?.addEventListener("click", () => {
      const form = document.getElementById("wish-form");
      if (form) form.hidden = !form.hidden;
    });
    document.getElementById("wish-form-cancel")?.addEventListener("click", () => {
      const form = document.getElementById("wish-form");
      if (form) form.hidden = true;
    });
    document.getElementById("wish-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        event_id: currentEvent.id,
        owner_id: currentUser.id,
        title: String(fd.get("title") || "").trim(),
        url: String(fd.get("url") || "").trim() || null,
        price: String(fd.get("price") || "").trim() || null,
        sort_order: state.wishes.length,
      };
      const { data, error } = await client.from("event_wishlist_items").insert(payload).select("*").single();
      if (error) return alert(error.message);
      state.wishes.push(data);
      e.target.reset();
      e.target.hidden = true;
      renderWishlist();
      renderOverview();
    });
    document.getElementById("wish-link-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const url = String(new FormData(e.target).get("url") || "").trim() || null;
      const { error } = await client
        .from("events")
        .update({ wishlist_external_url: url })
        .eq("id", currentEvent.id);
      if (error) return alert(error.message);
      currentEvent.wishlist_external_url = url;
      renderWishlist();
    });

    document.getElementById("todo-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const due = String(fd.get("due") || "");
      const payload = {
        event_id: currentEvent.id,
        owner_id: currentUser.id,
        title: String(fd.get("title") || "").trim(),
        due_at: due ? new Date(`${due}T12:00:00`).toISOString() : null,
        sort_order: state.todos.length,
      };
      const { data, error } = await client.from("event_todos").insert(payload).select("*").single();
      if (error) return alert(error.message);
      state.todos.push(data);
      e.target.reset();
      renderTodos();
      renderOverview();
    });

    document.getElementById("collab-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isOwner) return alert("Kun ejeren kan invitere medarrangører.");
      const fd = new FormData(e.target);
      const name = String(fd.get("name") || "").trim();
      const email = String(fd.get("email") || "").trim().toLowerCase();
      const inviteToken = token();
      const { data, error } = await client
        .from("event_collaborators")
        .insert({
          event_id: currentEvent.id,
          owner_id: currentUser.id,
          name,
          email,
          invite_token: inviteToken,
          status: "pending",
        })
        .select("*")
        .single();
      if (error) return alert(error.message);
      state.collabs.push(data);
      e.target.reset();
      const hint = document.getElementById("collab-hint");
      const inviteUrl = `${window.location.origin}/invite.html?token=${encodeURIComponent(inviteToken)}`;
      if (hint) {
        hint.hidden = false;
        hint.textContent = `Invitation klar. Del linket: ${inviteUrl}`;
      }
      logActivity(`Medarrangør inviteret: ${name}`);
      renderCollabs();
      renderOverview();
    });

    document.getElementById("program-add-btn")?.addEventListener("click", () => {
      const form = document.getElementById("program-form");
      if (form) form.hidden = !form.hidden;
    });
    document.getElementById("program-form-cancel")?.addEventListener("click", () => {
      const form = document.getElementById("program-form");
      if (form) form.hidden = true;
    });
    document.getElementById("program-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const starts = String(fd.get("starts_at") || "");
      const ends = String(fd.get("ends_at") || "");
      const payload = {
        event_id: currentEvent.id,
        owner_id: currentUser.id,
        title: String(fd.get("title") || "").trim(),
        description: String(fd.get("description") || "").trim() || null,
        location: String(fd.get("location") || "").trim() || null,
        image_url: String(fd.get("image_url") || "").trim() || null,
        starts_at: starts ? new Date(starts).toISOString() : null,
        ends_at: ends ? new Date(ends).toISOString() : null,
        sort_order: state.program.length,
      };
      const { data, error } = await client.from("event_program_items").insert(payload).select("*").single();
      if (error) return alert(error.message);
      state.program.push(data);
      e.target.reset();
      e.target.hidden = true;
      renderProgram();
      renderOverview();
    });
  }

  async function addTable(shape) {
    const payload = {
      event_id: currentEvent.id,
      owner_id: currentUser.id,
      name: `Bord ${state.tables.length + 1}`,
      seats: shape === "round" ? 8 : 10,
      shape,
      x: 60 + (state.tables.length % 4) * 40,
      y: 60 + Math.floor(state.tables.length / 4) * 40,
      width: shape === "round" ? 170 : 180,
      height: shape === "round" ? 170 : 110,
    };
    const { data, error } = await client.from("event_tables").insert(payload).select("*").single();
    if (error) return alert(error.message);
    state.tables.push(data);
    renderSeating();
    renderOverview();
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

    setBooting(true);
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      window.location.href = "auth.html?mode=login";
      return;
    }

    currentUser = sessionData.session.user;
    applyAvatar(currentUser);
    setTheme(document.documentElement.getAttribute("data-theme") || "light");
    wireUi();

    const [{ event, owner }, { data: events }] = await Promise.all([
      fetchEventForUser(eventId, currentUser),
      client
        .from("events")
        .select("id, title")
        .eq("owner_id", currentUser.id)
        .order("created_at", { ascending: false }),
    ]);

    renderSidebarEvents(events || [], eventId);

    if (!event) {
      setBooting(false);
      if (shellEl) shellEl.hidden = false;
      if (titleEl) titleEl.textContent = "Event ikke fundet";
      if (subEl) subEl.textContent = "Du har ikke adgang, eller eventet findes ikke.";
      return;
    }

    currentEvent = event;
    isOwner = owner;
    if (roleEl) {
      roleEl.hidden = isOwner;
    }

    document.title = `${event.title} — Eventplan`;
    if (titleEl) titleEl.textContent = event.title;
    if (subEl) {
      subEl.textContent = event.description?.trim()
        ? event.description.trim()
        : "Administrér gæster, program, bordplan og mere.";
    }
    if (planEl) planEl.textContent = planNames[event.plan] || event.plan || "Standard";
    if (dateEl) dateEl.textContent = formatDate(event.starts_at);
    const endDateEl = document.getElementById("event-end-date");
    if (endDateEl) endDateEl.textContent = event.ends_at ? formatDate(event.ends_at) : "Ikke sat";
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

    await loadEventData(eventId);
    renderAll();
    setBooting(false);

    const tab = params.get("tab") || "overview";
    switchTab(tab);
  }

  boot();
})();
