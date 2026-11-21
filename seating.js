(() => {
  const cfg = window.EVENTPLAN_CONFIG;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !window.supabase) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const bootEl = document.getElementById("seat-boot");
  const editorEl = document.getElementById("seat-editor");
  const canvas = document.getElementById("seat-canvas");
  const canvasInner = document.getElementById("seat-canvas-inner");
  const canvasWrap = document.getElementById("seat-canvas-wrap");
  const propsEl = document.getElementById("seat-props");
  const poolEl = document.getElementById("seat-guest-pool");
  const saveStatus = document.getElementById("seat-save-status");
  const titleEl = document.getElementById("seat-event-title");
  const backEl = document.getElementById("seat-back");
  const doneEl = document.getElementById("seat-done");
  const countLabel = document.getElementById("seat-count-label");
  const placedLabel = document.getElementById("seat-placed-label");
  const zoomLabel = document.getElementById("seat-zoom-label");

  const shapeDefaults = {
    round: { width: 170, height: 170, seats: 8 },
    oval: { width: 210, height: 140, seats: 10 },
    rect: { width: 200, height: 110, seats: 10 },
    square: { width: 150, height: 150, seats: 8 },
  };

  let currentUser = null;
  let currentEvent = null;
  let tables = [];
  let guests = [];
  let selectedId = null;
  let clipboard = null;
  let dragGuestId = null;
  let saveTimer = null;
  let interacting = false;
  let zoom = 1;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 1.75;
  const ZOOM_STEP = 0.1;

  function setBooting(on) {
    if (bootEl) bootEl.hidden = !on;
    if (editorEl) editorEl.hidden = on;
  }

  function setSave(state, label) {
    if (!saveStatus) return;
    saveStatus.className = `seat-save-status${state ? ` is-${state}` : ""}`;
    saveStatus.textContent = label;
  }

  function scheduleSave(table) {
    setSave("saving", "Gemmer…");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => persistTable(table), 280);
  }

  async function persistTable(table) {
    if (!table?.id) return;
    const { error } = await client
      .from("event_tables")
      .update({
        name: table.name,
        seats: table.seats,
        shape: table.shape,
        x: table.x,
        y: table.y,
        width: table.width,
        height: table.height,
        rotation: table.rotation || 0,
      })
      .eq("id", table.id);
    setSave(error ? "" : "saved", error ? "Kunne ikke gemme" : "Gemt");
    if (!error) {
      window.setTimeout(() => {
        if (saveStatus?.textContent === "Gemt") setSave("", "Klar");
      }, 1200);
    }
  }

  function getSelected() {
    return tables.find((t) => t.id === selectedId) || null;
  }

  function updateHeaderMeta() {
    const placed = guests.filter((g) => g.table_id).length;
    if (countLabel) countLabel.textContent = `${tables.length} borde`;
    if (placedLabel) placedLabel.textContent = `${placed}/${guests.length || 0} placeret`;
  }

  function updateActionButtons() {
    const has = Boolean(selectedId);
    ["seat-duplicate", "seat-delete", "seat-rotate-ccw", "seat-rotate-cw"].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = !has;
    });
  }

  function applyZoom() {
    if (!canvasInner) return;
    canvasInner.style.transform = `scale(${zoom})`;
    canvasInner.style.transformOrigin = "0 0";
    if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  function setZoom(next) {
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
    applyZoom();
  }

  function selectTable(id, { refresh = true } = {}) {
    selectedId = id;
    updateActionButtons();
    if (refresh) {
      renderCanvas();
      renderProps();
    } else {
      syncSelectionUi();
    }
  }

  function syncSelectionUi() {
    if (!canvasInner) return;
    canvasInner.querySelectorAll(".ed-table").forEach((node) => {
      const id = node.dataset.id;
      const selected = id === selectedId;
      node.classList.toggle("is-selected", selected);
      node.querySelectorAll(".ed-handle").forEach((h) => h.remove());
      if (selected) appendHandles(node);
    });
  }

  function appendHandles(el) {
    ["nw", "ne", "sw", "se"].forEach((dir) => {
      const handle = document.createElement("div");
      handle.className = `ed-handle ${dir}`;
      handle.dataset.resize = dir;
      el.appendChild(handle);
    });
  }

  function renderPool() {
    if (!poolEl) return;
    const unplaced = guests.filter((g) => !g.table_id);
    poolEl.innerHTML = "";
    if (!unplaced.length) {
      poolEl.innerHTML = `<p class="seat-props-empty">Alle gæster er placeret.</p>`;
      return;
    }
    unplaced.forEach((guest) => {
      const chip = document.createElement("div");
      chip.className = "seat-chip";
      chip.draggable = true;
      chip.textContent = guest.name || guest.email || "Gæst";
      chip.addEventListener("dragstart", (e) => {
        dragGuestId = guest.id;
        chip.classList.add("is-dragging");
        e.dataTransfer.setData("text/plain", guest.id);
      });
      chip.addEventListener("dragend", () => {
        dragGuestId = null;
        chip.classList.remove("is-dragging");
      });
      poolEl.appendChild(chip);
    });
  }

  function renderProps() {
    const table = getSelected();
    if (!propsEl) return;
    if (!table) {
      propsEl.innerHTML = `<p class="seat-props-empty">Vælg et bord for at redigere navn, form, pladser og størrelse.</p>`;
      return;
    }
    propsEl.innerHTML = `
      <div class="seat-field">
        <label for="prop-name">Navn</label>
        <input id="prop-name" type="text" maxlength="40" />
      </div>
      <div class="seat-field">
        <label for="prop-shape">Form</label>
        <select id="prop-shape">
          <option value="round">Rundbord</option>
          <option value="oval">Ovalt</option>
          <option value="rect">Rektangulært</option>
          <option value="square">Kvadratisk</option>
        </select>
      </div>
      <div class="seat-field">
        <label for="prop-seats">Pladser</label>
        <input id="prop-seats" type="number" min="2" max="24" />
      </div>
      <div class="seat-field-row">
        <div class="seat-field">
          <label for="prop-width">Bredde</label>
          <input id="prop-width" type="number" min="80" max="480" />
        </div>
        <div class="seat-field">
          <label for="prop-height">Længde</label>
          <input id="prop-height" type="number" min="80" max="480" />
        </div>
      </div>
      <div class="seat-field">
        <label for="prop-rotation">Rotation (°)</label>
        <input id="prop-rotation" type="number" min="-180" max="180" step="5" />
      </div>`;

    const nameInput = document.getElementById("prop-name");
    const shapeInput = document.getElementById("prop-shape");
    const seatsInput = document.getElementById("prop-seats");
    const widthInput = document.getElementById("prop-width");
    const heightInput = document.getElementById("prop-height");
    const rotInput = document.getElementById("prop-rotation");

    nameInput.value = table.name || "Bord";
    shapeInput.value = table.shape || "rect";
    seatsInput.value = table.seats || 8;
    widthInput.value = Math.round(table.width || 150);
    heightInput.value = Math.round(table.height || 96);
    rotInput.value = Math.round(table.rotation || 0);

    const apply = (patch, { redraw = true } = {}) => {
      Object.assign(table, patch);
      if (table.shape === "round" || table.shape === "square") {
        if (patch.width != null) table.height = table.width;
        else if (patch.height != null) table.width = table.height;
        else if (patch.shape) {
          const size = Math.max(table.width || 150, table.height || 150);
          table.width = size;
          table.height = size;
        }
      }
      if (redraw) renderCanvas();
      else {
        const el = canvasInner?.querySelector(`.ed-table[data-id="${table.id}"]`);
        if (el) applyTableStyles(el, table);
      }
      if (widthInput) widthInput.value = Math.round(table.width || 150);
      if (heightInput) heightInput.value = Math.round(table.height || 96);
      if (rotInput) rotInput.value = Math.round(table.rotation || 0);
      scheduleSave(table);
    };

    nameInput.addEventListener("change", () => apply({ name: nameInput.value.trim() || "Bord" }));
    shapeInput.addEventListener("change", () => apply({ shape: shapeInput.value }));
    seatsInput.addEventListener("change", () =>
      apply({ seats: Math.min(24, Math.max(2, Number(seatsInput.value) || 8)) })
    );
    widthInput.addEventListener("change", () =>
      apply({ width: Math.min(480, Math.max(80, Number(widthInput.value) || 150)) })
    );
    heightInput.addEventListener("change", () =>
      apply({ height: Math.min(480, Math.max(80, Number(heightInput.value) || 96)) })
    );
    rotInput.addEventListener("change", () =>
      apply({ rotation: Math.min(180, Math.max(-180, Number(rotInput.value) || 0)) })
    );
  }

  function applyTableStyles(el, table) {
    el.style.left = `${table.x || 0}px`;
    el.style.top = `${table.y || 0}px`;
    el.style.width = `${table.width || 150}px`;
    el.style.height = `${table.height || 96}px`;
    el.style.transform = `rotate(${table.rotation || 0}deg)`;
    el.className = `ed-table is-${table.shape || "rect"}${table.id === selectedId ? " is-selected" : ""}`;
  }

  function renderCanvas() {
    if (!canvasInner || interacting) return;
    canvasInner.innerHTML = "";
    applyZoom();

    tables.forEach((table) => {
      const el = document.createElement("div");
      applyTableStyles(el, table);
      el.dataset.id = table.id;

      const seated = guests.filter((g) => g.table_id === table.id);
      const seats = Math.max(table.seats || 8, seated.length);

      el.innerHTML = `
        <div class="ed-table-head">
          <div class="ed-table-name"></div>
        </div>
        <div class="ed-table-meta"></div>
        <div class="ed-seats"></div>`;
      el.querySelector(".ed-table-name").textContent = table.name || "Bord";
      el.querySelector(".ed-table-meta").textContent = `${seated.length}/${table.seats || 0} placeret`;

      const seatWrap = el.querySelector(".ed-seats");
      for (let i = 0; i < seats; i += 1) {
        const guest = seated[i];
        const slot = document.createElement("div");
        slot.className = `ed-slot${guest ? " has-guest" : ""}`;
        slot.textContent = guest ? guest.name || "Gæst" : `${i + 1}`;
        if (guest) {
          slot.draggable = true;
          slot.addEventListener("dragstart", (e) => {
            dragGuestId = guest.id;
            e.dataTransfer.setData("text/plain", guest.id);
          });
          slot.addEventListener("dblclick", () => assignGuest(guest.id, null));
        }
        seatWrap.appendChild(slot);
      }

      if (table.id === selectedId) appendHandles(el);

      el.addEventListener("pointerdown", (e) => onTablePointerDown(e, table, el));
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.classList.add("is-over");
      });
      el.addEventListener("dragleave", () => el.classList.remove("is-over"));
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("is-over");
        const id = e.dataTransfer.getData("text/plain") || dragGuestId;
        if (id) assignGuest(id, table.id);
      });

      canvasInner.appendChild(el);
    });

    updateHeaderMeta();
    updateActionButtons();
  }

  function canvasPoint(clientX, clientY) {
    const rect = canvasInner.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom,
    };
  }

  function onTablePointerDown(e, table, el) {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest(".ed-slot")) return;

    e.preventDefault();
    e.stopPropagation();

    const resizeDir = e.target.closest("[data-resize]")?.dataset.resize || null;
    selectedId = table.id;
    updateActionButtons();
    syncSelectionUi();

    const start = canvasPoint(e.clientX, e.clientY);
    const orig = {
      x: Number(table.x) || 0,
      y: Number(table.y) || 0,
      width: Number(table.width) || 150,
      height: Number(table.height) || 96,
    };
    interacting = true;
    el.classList.add("is-dragging");

    const liveEl = () => canvasInner?.querySelector(`.ed-table[data-id="${table.id}"]`) || el;

    const onMove = (ev) => {
      const point = canvasPoint(ev.clientX, ev.clientY);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const node = liveEl();

      if (resizeDir) {
        let { x, y, width, height } = { ...orig };
        if (resizeDir.includes("e")) width = orig.width + dx;
        if (resizeDir.includes("s")) height = orig.height + dy;
        if (resizeDir.includes("w")) {
          width = orig.width - dx;
          x = orig.x + dx;
        }
        if (resizeDir.includes("n")) {
          height = orig.height - dy;
          y = orig.y + dy;
        }
        width = Math.min(480, Math.max(80, width));
        height = Math.min(480, Math.max(80, height));
        if (table.shape === "round" || table.shape === "square") {
          const size = Math.max(width, height);
          if (resizeDir.includes("w")) x = orig.x + orig.width - size;
          if (resizeDir.includes("n")) y = orig.y + orig.height - size;
          width = size;
          height = size;
        }
        table.x = Math.max(0, x);
        table.y = Math.max(0, y);
        table.width = width;
        table.height = height;
      } else {
        table.x = Math.max(0, orig.x + dx);
        table.y = Math.max(0, orig.y + dy);
      }

      if (node) {
        node.style.left = `${table.x}px`;
        node.style.top = `${table.y}px`;
        node.style.width = `${table.width}px`;
        node.style.height = `${table.height}px`;
      }
    };

    const onUp = () => {
      interacting = false;
      liveEl()?.classList.remove("is-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      scheduleSave(table);
      renderProps();
      updateHeaderMeta();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    canvas?.focus();
  }

  async function assignGuest(guestId, tableId) {
    const guest = guests.find((g) => g.id === guestId);
    if (!guest) return;
    const seatedCount = tableId ? guests.filter((g) => g.table_id === tableId).length : 0;
    const { error } = await client
      .from("event_guests")
      .update({
        table_id: tableId,
        seat_index: tableId == null ? null : seatedCount,
      })
      .eq("id", guestId);
    if (error) return alert(error.message);
    guest.table_id = tableId;
    guest.seat_index = tableId == null ? null : seatedCount;
    renderCanvas();
    renderPool();
    updateHeaderMeta();
  }

  async function addTable(shape) {
    const defaults = shapeDefaults[shape] || shapeDefaults.rect;
    const payload = {
      event_id: currentEvent.id,
      owner_id: currentUser.id,
      name: `Bord ${tables.length + 1}`,
      seats: defaults.seats,
      shape,
      x: 80 + (tables.length % 5) * 36,
      y: 80 + Math.floor(tables.length / 5) * 36,
      width: defaults.width,
      height: defaults.height,
      rotation: 0,
    };
    const { data, error } = await client.from("event_tables").insert(payload).select("*").single();
    if (error) return alert(error.message);
    tables.push(data);
    selectTable(data.id);
  }

  async function duplicateSelected() {
    const source = getSelected();
    if (!source) return;
    const payload = {
      event_id: currentEvent.id,
      owner_id: currentUser.id,
      name: `${source.name || "Bord"} kopi`,
      seats: source.seats,
      shape: source.shape,
      x: (source.x || 0) + 28,
      y: (source.y || 0) + 28,
      width: source.width,
      height: source.height,
      rotation: source.rotation || 0,
    };
    const { data, error } = await client.from("event_tables").insert(payload).select("*").single();
    if (error) return alert(error.message);
    tables.push(data);
    selectTable(data.id);
  }

  async function deleteSelected() {
    const table = getSelected();
    if (!table) return;
    await client.from("event_guests").update({ table_id: null, seat_index: null }).eq("table_id", table.id);
    const { error } = await client.from("event_tables").delete().eq("id", table.id);
    if (error) return alert(error.message);
    guests.forEach((g) => {
      if (g.table_id === table.id) {
        g.table_id = null;
        g.seat_index = null;
      }
    });
    tables = tables.filter((t) => t.id !== table.id);
    selectedId = null;
    renderCanvas();
    renderProps();
    renderPool();
    updateActionButtons();
  }

  function rotateSelected(delta) {
    const table = getSelected();
    if (!table) return;
    let next = (Number(table.rotation) || 0) + delta;
    if (next > 180) next -= 360;
    if (next < -180) next += 360;
    table.rotation = next;
    const el = canvasInner?.querySelector(`.ed-table[data-id="${table.id}"]`);
    if (el) el.style.transform = `rotate(${table.rotation}deg)`;
    scheduleSave(table);
    renderProps();
  }

  function copySelected() {
    const table = getSelected();
    if (!table) return;
    clipboard = {
      name: table.name,
      seats: table.seats,
      shape: table.shape,
      width: table.width,
      height: table.height,
      rotation: table.rotation || 0,
    };
    setSave("", "Kopieret");
  }

  async function pasteClipboard() {
    if (!clipboard) return;
    const payload = {
      event_id: currentEvent.id,
      owner_id: currentUser.id,
      name: `${clipboard.name || "Bord"} kopi`,
      seats: clipboard.seats,
      shape: clipboard.shape,
      x: 100 + Math.random() * 40,
      y: 100 + Math.random() * 40,
      width: clipboard.width,
      height: clipboard.height,
      rotation: clipboard.rotation || 0,
    };
    const selected = getSelected();
    if (selected) {
      payload.x = (selected.x || 0) + 30;
      payload.y = (selected.y || 0) + 30;
    }
    const { data, error } = await client.from("event_tables").insert(payload).select("*").single();
    if (error) return alert(error.message);
    tables.push(data);
    selectTable(data.id);
  }

  function wireUi() {
    document.querySelectorAll("[data-add-shape]").forEach((btn) => {
      btn.addEventListener("click", () => addTable(btn.dataset.addShape));
    });
    document.getElementById("seat-duplicate")?.addEventListener("click", () => duplicateSelected());
    document.getElementById("seat-delete")?.addEventListener("click", () => deleteSelected());
    document.getElementById("seat-rotate-ccw")?.addEventListener("click", () => rotateSelected(-15));
    document.getElementById("seat-rotate-cw")?.addEventListener("click", () => rotateSelected(15));
    document.getElementById("seat-zoom-in")?.addEventListener("click", () => setZoom(zoom + ZOOM_STEP));
    document.getElementById("seat-zoom-out")?.addEventListener("click", () => setZoom(zoom - ZOOM_STEP));
    document.getElementById("seat-zoom-label")?.addEventListener("click", () => setZoom(1));

    canvasInner?.addEventListener("pointerdown", (e) => {
      if (e.target === canvasInner) {
        selectedId = null;
        updateActionButtons();
        renderCanvas();
        renderProps();
      }
    });

    canvasWrap?.addEventListener(
      "wheel",
      (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        setZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
      },
      { passive: false }
    );

    window.addEventListener("keydown", (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelected();
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteClipboard();
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      }
      if ((mod && (e.key === "=" || e.key === "+")) || e.key === "+") {
        e.preventDefault();
        setZoom(zoom + ZOOM_STEP);
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        setZoom(zoom - ZOOM_STEP);
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === "[" ) {
        e.preventDefault();
        rotateSelected(-15);
      }
      if (e.key === "]" ) {
        e.preventDefault();
        rotateSelected(15);
      }
      if (e.key === "Escape") {
        selectedId = null;
        updateActionButtons();
        renderCanvas();
        renderProps();
      }
      if (!mod && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const table = getSelected();
        if (!table) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowLeft") table.x = Math.max(0, (table.x || 0) - step);
        if (e.key === "ArrowRight") table.x = (table.x || 0) + step;
        if (e.key === "ArrowUp") table.y = Math.max(0, (table.y || 0) - step);
        if (e.key === "ArrowDown") table.y = (table.y || 0) + step;
        const node = canvasInner?.querySelector(`.ed-table[data-id="${table.id}"]`);
        if (node) {
          node.style.left = `${table.x}px`;
          node.style.top = `${table.y}px`;
        }
        scheduleSave(table);
      }
    });
  }

  async function fetchEvent(eventId, user) {
    const { data: owned } = await client
      .from("events")
      .select("id, title, owner_id")
      .eq("id", eventId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (owned) return owned;

    const { data: collab } = await client
      .from("event_collaborators")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .maybeSingle();
    if (!collab) return null;

    const { data: shared } = await client
      .from("events")
      .select("id, title, owner_id")
      .eq("id", eventId)
      .maybeSingle();
    return shared;
  }

  async function boot() {
    const eventId = new URLSearchParams(window.location.search).get("id");
    if (!eventId) {
      window.location.href = "account.html";
      return;
    }

    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      window.location.href = `auth.html?mode=login&next=${encodeURIComponent(`/seating.html?id=${eventId}`)}`;
      return;
    }
    currentUser = sessionData.session.user;

    currentEvent = await fetchEvent(eventId, currentUser);
    if (!currentEvent) {
      setBooting(false);
      alert("Du har ikke adgang til denne bordplan.");
      window.location.href = "account.html";
      return;
    }

    const eventHref = `event.html?id=${encodeURIComponent(currentEvent.id)}&tab=seating`;
    if (titleEl) titleEl.textContent = currentEvent.title || "Event";
    if (backEl) backEl.href = eventHref;
    if (doneEl) doneEl.href = eventHref;

    const [{ data: tableRows }, { data: guestRows }] = await Promise.all([
      client.from("event_tables").select("*").eq("event_id", eventId).order("created_at", { ascending: true }),
      client.from("event_guests").select("*").eq("event_id", eventId).order("created_at", { ascending: true }),
    ]);
    tables = tableRows || [];
    guests = guestRows || [];

    wireUi();
    applyZoom();
    renderCanvas();
    renderProps();
    renderPool();
    updateHeaderMeta();
    updateActionButtons();
    setBooting(false);
    canvas?.focus();
  }

  boot();
})();
