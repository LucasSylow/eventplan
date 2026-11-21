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
  let todoFilter = "open";

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

  function formatClock(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  }

  function formatTimeRange(start, end) {
    const a = formatClock(start);
    const b = formatClock(end);
    if (a && b) return `${a} – ${b}`;
    return a || b || "Tid ikke sat";
  }

  function programDateBase() {
    const base = currentEvent?.starts_at ? new Date(currentEvent.starts_at) : new Date();
    if (Number.isNaN(base.getTime())) return new Date();
    return base;
  }

  function timeToIso(timeStr) {
    const match = String(timeStr || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const base = programDateBase();
    const d = new Date(base);
    d.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return d.toISOString();
  }

  async function uploadProgramImage(file) {
    if (!file || !currentUser || !currentEvent) return null;
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error("Billedet må max være 5 MB.");
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) throw new Error("Vælg JPG, PNG, WebP eller GIF.");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${currentUser.id}/${currentEvent.id}/${crypto.randomUUID?.() || Date.now()}.${ext}`;
    const { error } = await client.storage.from("program-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    const { data } = client.storage.from("program-images").getPublicUrl(path);
    return data?.publicUrl || null;
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

  function assigneeName(todo) {
    if (!todo?.assignee_collab_id) return "";
    const person = state.collabs.find((c) => c.id === todo.assignee_collab_id);
    return person?.name || person?.email || "Medarrangør";
  }

  function fillAssigneeSelect() {
    const select = document.getElementById("todo-assignee");
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">Ingen ansvarlig</option>`;
    state.collabs.forEach((person) => {
      const opt = document.createElement("option");
      opt.value = person.id;
      opt.textContent = person.name || person.email || "Medarrangør";
      select.appendChild(opt);
    });
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  }

  async function toggleTodo(todo) {
    const { error } = await client
      .from("event_todos")
      .update({ done: !todo.done })
      .eq("id", todo.id);
    if (error) {
      alert(error.message);
      return;
    }
    todo.done = !todo.done;
    renderTodos();
    renderOverview();
  }

  function renderTodoRows(listEl, items, { compact = false } = {}) {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!items.length) {
      listEl.innerHTML = `<div class="ev-empty">${compact ? "Ingen åbne opgaver." : "Ingen opgaver i denne visning."}</div>`;
      return;
    }
    items.forEach((todo, i) => {
      const row = document.createElement("div");
      row.className = `todo-item${todo.done ? " is-done" : ""}`;
      row.style.animationDelay = `${i * 0.03}s`;
      row.innerHTML = `
        <button type="button" class="todo-check" aria-label="Marker færdig">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div>
          <p class="todo-title"></p>
          <div class="todo-meta"></div>
          <p class="todo-notes" hidden></p>
        </div>
        ${compact ? "" : `<button type="button" class="ev-icon-btn" data-todo-del aria-label="Slet">×</button>`}`;
      row.querySelector(".todo-title").textContent = todo.title;
      const meta = row.querySelector(".todo-meta");
      if (todo.due_at) {
        const due = document.createElement("span");
        due.className = "todo-chip is-due";
        due.textContent = `Frist ${formatDateShort(todo.due_at)}`;
        meta.appendChild(due);
      }
      const person = assigneeName(todo);
      if (person) {
        const chip = document.createElement("span");
        chip.className = "todo-chip is-person";
        chip.textContent = person;
        meta.appendChild(chip);
      }
      if (!todo.due_at && !person) {
        const chip = document.createElement("span");
        chip.className = "todo-chip";
        chip.textContent = todo.done ? "Fuldført" : "Ingen frist";
        meta.appendChild(chip);
      }
      const notesEl = row.querySelector(".todo-notes");
      if (notesEl && todo.notes && !compact) {
        notesEl.hidden = false;
        notesEl.textContent = todo.notes;
      }
      row.querySelector(".todo-check").addEventListener("click", () => toggleTodo(todo));
      row.querySelector("[data-todo-del]")?.addEventListener("click", async () => {
        const { error } = await client.from("event_todos").delete().eq("id", todo.id);
        if (!error) {
          state.todos = state.todos.filter((t) => t.id !== todo.id);
          renderTodos();
          renderOverview();
        }
      });
      listEl.appendChild(row);
    });
  }

  function renderOverview() {
    const stats = document.getElementById("overview-stats");
    const snap = document.getElementById("overview-snap");
    const c = guestCounts();
    const todosDone = state.todos.filter((t) => t.done).length;
    const claimed = state.wishes.filter((w) => w.claimed).length;
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
        <div class="ev-snap-row"><strong>Ønskeliste</strong><span>${state.wishes.length} ønsker · ${claimed} reserveret</span></div>
        <div class="ev-snap-row"><strong>Medarrangører</strong><span>${state.collabs.length}</span></div>
        <div class="ev-snap-row"><strong>Ikke svaret</strong><span>${c.invited}</span></div>`;
    }

    const ovProgress = document.getElementById("overview-todo-progress");
    const pct = state.todos.length ? Math.round((todosDone / state.todos.length) * 100) : 0;
    if (ovProgress) ovProgress.innerHTML = `<span style="width:${pct}%"></span>`;
    const openTodos = state.todos.filter((t) => !t.done).slice(0, 5);
    renderTodoRows(document.getElementById("overview-todo-list"), openTodos, { compact: true });
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
    const floor = document.getElementById("seat-preview-floor");
    const stats = document.getElementById("seat-preview-stats");
    const meta = document.getElementById("seat-preview-meta");
    const editBtn = document.getElementById("seat-edit-btn");
    const overlay = document.getElementById("seat-preview-overlay");
    if (overlay) overlay.hidden = true;
    if (editBtn && currentEvent?.id) {
      editBtn.href = `seating.html?id=${encodeURIComponent(currentEvent.id)}`;
    }

    const placed = state.guests.filter((g) => g.table_id).length;
    const unplaced = state.guests.length - placed;
    if (stats) {
      stats.innerHTML = `
        <div class="ev-stat"><b>${state.tables.length}</b><span>borde</span></div>
        <div class="ev-stat"><b>${placed}</b><span>placeret</span></div>
        <div class="ev-stat"><b>${unplaced}</b><span>uplaceret</span></div>
        <div class="ev-stat"><b>${state.tables.reduce((n, t) => n + (t.seats || 0), 0)}</b><span>pladser</span></div>`;
    }
    if (meta) {
      meta.innerHTML = state.tables.length
        ? state.tables
            .slice(0, 6)
            .map((t) => {
              const count = state.guests.filter((g) => g.table_id === t.id).length;
              return `<div class="ev-snap-row"><strong></strong><span>${count}/${t.seats || 0} gæster</span></div>`;
            })
            .join("")
        : `<div class="ev-empty">Ingen borde endnu. Åbn editoren for at starte.</div>`;
      if (state.tables.length) {
        meta.querySelectorAll(".ev-snap-row strong").forEach((el, i) => {
          el.textContent = state.tables[i]?.name || "Bord";
        });
      }
    }

    if (!floor) return;
    floor.innerHTML = "";
    if (!state.tables.length) {
      floor.innerHTML = `<div class="ev-empty">Ingen bordplan endnu</div>`;
      return;
    }

    const maxX = Math.max(...state.tables.map((t) => (t.x || 0) + (t.width || 150)), 400);
    const maxY = Math.max(...state.tables.map((t) => (t.y || 0) + (t.height || 96)), 300);
    const scale = Math.min(1, 560 / maxX, 320 / maxY);
    floor.style.width = `${Math.max(560, maxX * scale + 40)}px`;
    floor.style.height = `${Math.max(280, maxY * scale + 40)}px`;

    state.tables.forEach((table) => {
      const el = document.createElement("div");
      const shape = table.shape || "rect";
      el.className = `seat-preview-table is-${shape}`;
      el.style.left = `${(table.x || 0) * scale + 16}px`;
      el.style.top = `${(table.y || 0) * scale + 16}px`;
      el.style.width = `${(table.width || 150) * scale}px`;
      el.style.height = `${(table.height || 96) * scale}px`;
      if (table.rotation) el.style.transform = `rotate(${table.rotation}deg)`;
      const seated = state.guests.filter((g) => g.table_id === table.id).length;
      el.innerHTML = `<strong></strong><span></span>`;
      el.querySelector("strong").textContent = table.name || "Bord";
      el.querySelector("span").textContent = `${seated}/${table.seats || 0}`;
      floor.appendChild(el);
    });
  }

  function renderWishlist() {
    const list = document.getElementById("wish-list");
    const stats = document.getElementById("wish-stats");
    const open = document.getElementById("wish-external-open");
    const input = document.getElementById("wish-external-url");
    const claimed = state.wishes.filter((w) => w.claimed).length;
    const openCount = state.wishes.length - claimed;
    if (stats) {
      stats.innerHTML = `
        <div class="ev-stat"><b>${state.wishes.length}</b><span>ønsker</span></div>
        <div class="ev-stat"><b>${openCount}</b><span>ledige</span></div>
        <div class="ev-stat"><b>${claimed}</b><span>reserveret</span></div>`;
    }
    if (input) input.value = currentEvent?.wishlist_external_url || "";
    if (open) {
      const url = currentEvent?.wishlist_external_url || "";
      open.hidden = !url;
      open.href = url || "#";
    }
    if (!list) return;
    if (!state.wishes.length) {
      list.innerHTML = `<div class="ev-empty">Ingen ønsker endnu. Tilføj det første, eller link til Ønskeskyen i siden.</div>`;
      return;
    }
    list.innerHTML = "";
    state.wishes.forEach((item, i) => {
      const card = document.createElement("article");
      card.className = `wish-card${item.claimed ? " is-claimed" : ""}`;
      card.style.animationDelay = `${i * 0.03}s`;
      card.innerHTML = `
        <div class="wish-card-media">
          <span class="wish-card-media-fallback">Ønske</span>
          <img alt="" hidden />
          <span class="wish-card-badge" hidden>Reserveret</span>
        </div>
        <div class="wish-card-body">
          <strong></strong>
          <p class="wish-card-price"></p>
          <p class="wish-card-note" hidden></p>
          <div class="wish-card-actions">
            <a class="ev-btn ev-btn-ghost" target="_blank" rel="noopener" hidden>Åbn link</a>
            <button type="button" class="ev-btn ev-btn-ghost" data-wish-claim></button>
            <button type="button" class="ev-icon-btn" data-wish-del aria-label="Slet">×</button>
          </div>
        </div>`;
      card.querySelector("strong").textContent = item.title;
      card.querySelector(".wish-card-price").textContent = item.price || "Pris ikke angivet";
      const note = card.querySelector(".wish-card-note");
      if (item.notes) {
        note.hidden = false;
        note.textContent = item.notes;
      }
      const img = card.querySelector("img");
      if (item.image_url) {
        img.hidden = false;
        img.src = item.image_url;
        card.querySelector(".wish-card-media-fallback").hidden = true;
      }
      const badge = card.querySelector(".wish-card-badge");
      if (item.claimed) badge.hidden = false;
      const link = card.querySelector("a");
      if (item.url) {
        link.hidden = false;
        link.href = item.url;
      }
      const claimBtn = card.querySelector("[data-wish-claim]");
      claimBtn.textContent = item.claimed ? "Frigiv" : "Reservér";
      claimBtn.addEventListener("click", async () => {
        const { error } = await client
          .from("event_wishlist_items")
          .update({ claimed: !item.claimed })
          .eq("id", item.id);
        if (!error) {
          item.claimed = !item.claimed;
          renderWishlist();
          renderOverview();
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
    fillAssigneeSelect();
    const list = document.getElementById("todo-list");
    const progress = document.getElementById("todo-progress");
    const label = document.getElementById("todo-progress-label");
    const done = state.todos.filter((t) => t.done).length;
    const pct = state.todos.length ? Math.round((done / state.todos.length) * 100) : 0;
    if (progress) progress.innerHTML = `<span style="width:${pct}%"></span>`;
    if (label) label.textContent = `${done} af ${state.todos.length} fuldført`;
    const items = state.todos.filter((t) => {
      if (todoFilter === "open") return !t.done;
      if (todoFilter === "done") return t.done;
      return true;
    });
    renderTodoRows(list, items);
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
      list.innerHTML = `<div class="ev-empty">Ingen programpunkter endnu. Tilføj titel, tidspunkt og gerne et billede.</div>`;
      return;
    }
    list.innerHTML = "";
    items.forEach((item, i) => {
      const row = document.createElement("article");
      row.className = "program-item";
      row.style.animationDelay = `${i * 0.04}s`;
      row.innerHTML = `
        <div class="program-time"></div>
        <div class="program-card">
          <img class="program-img" alt="" hidden />
          <div class="program-body">
            <h3></h3>
            <p class="program-desc" hidden></p>
            <p class="program-loc" hidden></p>
            <div class="program-actions">
              <button type="button" class="ev-btn ev-btn-danger" data-program-del>Slet</button>
            </div>
          </div>
        </div>`;
      row.querySelector(".program-time").textContent = formatClock(item.starts_at) || "—";
      row.querySelector("h3").textContent = item.title;
      const desc = row.querySelector(".program-desc");
      if (item.description) {
        desc.hidden = false;
        desc.textContent = item.description;
      }
      const loc = row.querySelector(".program-loc");
      if (item.location) {
        loc.hidden = false;
        loc.textContent = item.location;
      }
      const img = row.querySelector(".program-img");
      if (item.image_url) {
        img.hidden = false;
        img.src = item.image_url;
        img.alt = item.title || "Programbillede";
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
    document.querySelectorAll("[data-goto-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.gotoTab));
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

    document.getElementById("seat-edit-btn")?.addEventListener("click", () => {
      const overlay = document.getElementById("seat-preview-overlay");
      if (overlay) overlay.hidden = false;
    });
    window.addEventListener("pageshow", () => {
      const overlay = document.getElementById("seat-preview-overlay");
      if (overlay) overlay.hidden = true;
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
        image_url: String(fd.get("image_url") || "").trim() || null,
        notes: String(fd.get("notes") || "").trim() || null,
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

    document.getElementById("todo-filters")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-todo-filter]");
      if (!btn) return;
      todoFilter = btn.dataset.todoFilter;
      document.querySelectorAll("#todo-filters button").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
      });
      renderTodos();
    });

    document.getElementById("todo-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const due = String(fd.get("due") || "");
      const assignee = String(fd.get("assignee") || "").trim();
      const payload = {
        event_id: currentEvent.id,
        owner_id: currentUser.id,
        title: String(fd.get("title") || "").trim(),
        notes: String(fd.get("notes") || "").trim() || null,
        due_at: due ? new Date(`${due}T12:00:00`).toISOString() : null,
        assignee_collab_id: assignee || null,
        sort_order: state.todos.length,
      };
      const { data, error } = await client.from("event_todos").insert(payload).select("*").single();
      if (error) return alert(error.message);
      state.todos.push(data);
      e.target.reset();
      fillAssigneeSelect();
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
      fillAssigneeSelect();
      renderOverview();
    });

    document.getElementById("program-add-btn")?.addEventListener("click", () => {
      const form = document.getElementById("program-form");
      if (form) form.hidden = !form.hidden;
    });
    document.getElementById("program-form-cancel")?.addEventListener("click", () => {
      const form = document.getElementById("program-form");
      if (form) {
        form.reset();
        form.hidden = true;
      }
      const hint = document.getElementById("program-file-hint");
      if (hint) hint.textContent = "JPG, PNG eller WebP — max 5 MB";
    });
    document.getElementById("program-image")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      const hint = document.getElementById("program-file-hint");
      if (!hint) return;
      hint.textContent = file ? file.name : "JPG, PNG eller WebP — max 5 MB";
    });
    document.getElementById("program-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      const title = String(fd.get("title") || "").trim();
      const time = String(fd.get("time") || "").trim();
      if (!title || !time) return alert("Udfyld titel og tidspunkt.");
      const startsAt = timeToIso(time);
      if (!startsAt) return alert("Ugyldigt tidspunkt.");

      const submitBtn = document.getElementById("program-submit");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Gemmer…";
      }

      let imageUrl = null;
      try {
        const file = fd.get("image");
        if (file instanceof File && file.size > 0) {
          imageUrl = await uploadProgramImage(file);
        }
      } catch (err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Gem programpunkt";
        }
        return alert(err?.message || "Kunne ikke uploade billede.");
      }

      const payload = {
        event_id: currentEvent.id,
        owner_id: currentUser.id,
        title,
        description: String(fd.get("description") || "").trim() || null,
        location: String(fd.get("location") || "").trim() || null,
        image_url: imageUrl,
        starts_at: startsAt,
        ends_at: null,
        sort_order: state.program.length,
      };
      const { data, error } = await client.from("event_program_items").insert(payload).select("*").single();
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Gem programpunkt";
      }
      if (error) return alert(error.message);
      state.program.push(data);
      form.reset();
      form.hidden = true;
      const hint = document.getElementById("program-file-hint");
      if (hint) hint.textContent = "JPG, PNG eller WebP — max 5 MB";
      renderProgram();
      renderOverview();
    });
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
