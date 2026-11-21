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

  const roomCatalog = {
    entrance: { label: "Indgang", width: 140, height: 48, badge: "IN" },
    exit: { label: "Udgang", width: 140, height: 48, badge: "UD" },
    toilet: { label: "Toilet", width: 110, height: 80, badge: "WC" },
    kitchen: { label: "Køkken", width: 160, height: 100, badge: "KØ" },
    bar: { label: "Bar", width: 180, height: 70, badge: "BR" },
    stage: { label: "Scene", width: 240, height: 110, badge: "SC" },
    dancefloor: { label: "Dansegulv", width: 220, height: 160, badge: "DN" },
    wardrobe: { label: "Garderobe", width: 140, height: 70, badge: "GA" },
    gift: { label: "Gavbord", width: 150, height: 70, badge: "GV" },
    wall: { label: "Væg", width: 220, height: 18, badge: "VG" },
    plant: { label: "Plante", width: 56, height: 56, badge: "PL" },
    speaker: { label: "Højttaler", width: 56, height: 56, badge: "LY" },
  };

  let currentUser = null;
  let currentEvent = null;
  let tables = [];
  let rooms = [];
  let guests = [];
  let selectedId = null;
  let selectedKind = null; // "table" | "room"
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

  function scheduleSave(item) {
    setSave("saving", "Gemmer…");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (selectedKind === "room" || rooms.some((r) => r.id === item.id)) persistRoom(item);
      else persistTable(item);
    }, 280);
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

  async function persistRoom(room) {
    if (!room?.id) return;
    const { error } = await client
      .from("event_room_items")
      .update({
        kind: room.kind,
        label: room.label,
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
        rotation: room.rotation || 0,
      })
      .eq("id", room.id);
    setSave(error ? "" : "saved", error ? "Kunne ikke gemme" : "Gemt");
    if (!error) {
      window.setTimeout(() => {
        if (saveStatus?.textContent === "Gemt") setSave("", "Klar");
      }, 1200);
    }
  }

  function getSelected() {
    if (selectedKind === "table") return tables.find((t) => t.id === selectedId) || null;
    if (selectedKind === "room") return rooms.find((r) => r.id === selectedId) || null;
    return null;
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

  function selectItem(kind, id, { refresh = true } = {}) {
    selectedKind = kind;
    selectedId = id;
    updateActionButtons();
    if (refresh) {
      renderCanvas();
      renderProps();
    } else {
      syncSelectionUi();
    }
  }

  function clearSelection({ refresh = true } = {}) {
    selectedKind = null;
    selectedId = null;
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
    canvasInner.querySelectorAll(".ed-table, .ed-room").forEach((node) => {
      const kind = node.classList.contains("ed-room") ? "room" : "table";
      const selected = kind === selectedKind && node.dataset.id === selectedId;
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
    const item = getSelected();
    if (!propsEl) return;
    if (!item) {
      propsEl.innerHTML = `<p class="seat-props-empty">Vælg et bord eller rum-element for at redigere navn, størrelse og placering.</p>`;
      return;
    }

    if (selectedKind === "room") {
      const meta = roomCatalog[item.kind] || { label: item.kind };
      propsEl.innerHTML = `
        <div class="seat-prop-badge">${meta.badge || "RU"} · ${meta.label}</div>
        <div class="seat-field">
          <label for="prop-name">Navn</label>
          <input id="prop-name" type="text" maxlength="40" />
        </div>
        <div class="seat-field-row">
          <div class="seat-field">
            <label for="prop-width">Bredde</label>
            <input id="prop-width" type="number" min="24" max="600" />
          </div>
          <div class="seat-field">
            <label for="prop-height">Højde</label>
            <input id="prop-height" type="number" min="18" max="600" />
          </div>
        </div>
        <div class="seat-field">
          <label for="prop-rotation">Rotation (°)</label>
          <input id="prop-rotation" type="number" min="-180" max="180" step="5" />
        </div>`;
      const nameInput = document.getElementById("prop-name");
      const widthInput = document.getElementById("prop-width");
      const heightInput = document.getElementById("prop-height");
      const rotInput = document.getElementById("prop-rotation");
      nameInput.value = item.label || meta.label;
      widthInput.value = Math.round(item.width || 120);
      heightInput.value = Math.round(item.height || 56);
      rotInput.value = Math.round(item.rotation || 0);

      const apply = (patch) => {
        Object.assign(item, patch);
        renderCanvas();
        scheduleSave(item);
      };
      nameInput.addEventListener("change", () => apply({ label: nameInput.value.trim() || meta.label }));
      widthInput.addEventListener("change", () =>
        apply({ width: Math.min(600, Math.max(24, Number(widthInput.value) || 120)) })
      );
      heightInput.addEventListener("change", () =>
        apply({ height: Math.min(600, Math.max(18, Number(heightInput.value) || 56)) })
      );
      rotInput.addEventListener("change", () =>
        apply({ rotation: Math.min(180, Math.max(-180, Number(rotInput.value) || 0)) })
      );
      return;
    }

    propsEl.innerHTML = `
      <div class="seat-prop-badge">Bord</div>
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

    nameInput.value = item.name || "Bord";
    shapeInput.value = item.shape || "rect";
    seatsInput.value = item.seats || 8;
    widthInput.value = Math.round(item.width || 150);
    heightInput.value = Math.round(item.height || 96);
    rotInput.value = Math.round(item.rotation || 0);

    const apply = (patch) => {
      Object.assign(item, patch);
      if (item.shape === "round" || item.shape === "square") {
        if (patch.width != null) item.height = item.width;
        else if (patch.height != null) item.width = item.height;
        else if (patch.shape) {
          const size = Math.max(item.width || 150, item.height || 150);
          item.width = size;
          item.height = size;
        }
      }
      renderCanvas();
      scheduleSave(item);
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

  function sideFromPoint(el, clientX, clientY) {
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / Math.max(rect.width, 1);
    const y = (clientY - rect.top) / Math.max(rect.height, 1);
    const dist = { n: y, s: 1 - y, w: x, e: 1 - x };
    return Object.entries(dist).sort((a, b) => a[1] - b[1])[0][0];
  }

  function guestsOnSide(tableId, side) {
    return guests
      .filter((g) => g.table_id === tableId && (g.seat_side || "s") === side)
      .sort((a, b) => (a.seat_index || 0) - (b.seat_index || 0));
  }

  function makeGuestChip(guest) {
    const chip = document.createElement("div");
    chip.className = "ed-guest";
    chip.draggable = true;
    chip.title = "Træk for at flytte · dobbeltklik for at fjerne";
    chip.textContent = guest.name || guest.email || "Gæst";
    chip.addEventListener("dragstart", (e) => {
      dragGuestId = guest.id;
      chip.classList.add("is-dragging");
      e.dataTransfer.setData("text/plain", guest.id);
      e.stopPropagation();
    });
    chip.addEventListener("dragend", () => {
      dragGuestId = null;
      chip.classList.remove("is-dragging");
    });
    chip.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      assignGuest(guest.id, null);
    });
    chip.addEventListener("pointerdown", (e) => e.stopPropagation());
    return chip;
  }

  function clearSideHighlights(el) {
    el.querySelectorAll(".ed-side").forEach((side) => side.classList.remove("is-hot"));
    el.classList.remove("is-over");
  }

  function applyItemStyles(el, item, kind) {
    el.style.left = `${item.x || 0}px`;
    el.style.top = `${item.y || 0}px`;
    el.style.width = `${item.width || 120}px`;
    el.style.height = `${item.height || 56}px`;
    el.style.transform = `rotate(${item.rotation || 0}deg)`;
    if (kind === "table") {
      el.className = `ed-table is-${item.shape || "rect"}${item.id === selectedId && selectedKind === "table" ? " is-selected" : ""}`;
    } else {
      el.className = `ed-room is-${item.kind || "wall"}${item.id === selectedId && selectedKind === "room" ? " is-selected" : ""}`;
    }
  }

  function renderCanvas() {
    if (!canvasInner || interacting) return;
    canvasInner.innerHTML = "";
    applyZoom();

    rooms.forEach((room) => {
      const el = document.createElement("div");
      applyItemStyles(el, room, "room");
      el.dataset.id = room.id;
      el.dataset.kind = "room";
      const meta = roomCatalog[room.kind] || { label: room.kind, badge: "?" };
      el.innerHTML = `
        <div class="ed-room-badge"></div>
        <div class="ed-room-label"></div>`;
      el.querySelector(".ed-room-badge").textContent = meta.badge || "RU";
      el.querySelector(".ed-room-label").textContent = room.label || meta.label;
      if (room.id === selectedId && selectedKind === "room") appendHandles(el);
      el.addEventListener("pointerdown", (e) => onItemPointerDown(e, room, el, "room"));
      canvasInner.appendChild(el);
    });

    tables.forEach((table) => {
      const el = document.createElement("div");
      applyItemStyles(el, table, "table");
      el.dataset.id = table.id;
      el.dataset.kind = "table";

      const seated = guests.filter((g) => g.table_id === table.id);
      el.innerHTML = `
        <div class="ed-side ed-side-n" data-side="n"></div>
        <div class="ed-side ed-side-e" data-side="e"></div>
        <div class="ed-side ed-side-s" data-side="s"></div>
        <div class="ed-side ed-side-w" data-side="w"></div>
        <div class="ed-table-core">
          <div class="ed-table-name"></div>
          <div class="ed-table-meta"></div>
        </div>`;
      el.querySelector(".ed-table-name").textContent = table.name || "Bord";
      el.querySelector(".ed-table-meta").textContent = `${seated.length}/${table.seats || 0}`;

      ["n", "e", "s", "w"].forEach((side) => {
        const rail = el.querySelector(`.ed-side-${side}`);
        guestsOnSide(table.id, side).forEach((guest) => rail.appendChild(makeGuestChip(guest)));
      });

      if (table.id === selectedId && selectedKind === "table") appendHandles(el);

      el.addEventListener("pointerdown", (e) => onItemPointerDown(e, table, el, "table"));
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.classList.add("is-over");
        const side = e.target.closest("[data-side]")?.dataset.side || sideFromPoint(el, e.clientX, e.clientY);
        el.querySelectorAll(".ed-side").forEach((node) => {
          node.classList.toggle("is-hot", node.dataset.side === side);
        });
      });
      el.addEventListener("dragleave", (e) => {
        if (!el.contains(e.relatedTarget)) clearSideHighlights(el);
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain") || dragGuestId;
        const side = e.target.closest("[data-side]")?.dataset.side || sideFromPoint(el, e.clientX, e.clientY);
        clearSideHighlights(el);
        if (id) assignGuest(id, table.id, side);
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

  function onItemPointerDown(e, item, el, kind) {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest(".ed-guest")) return;

    e.preventDefault();
    e.stopPropagation();

    const resizeDir = e.target.closest("[data-resize]")?.dataset.resize || null;
    selectedKind = kind;
    selectedId = item.id;
    updateActionButtons();
    syncSelectionUi();

    const start = canvasPoint(e.clientX, e.clientY);
    const orig = {
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      width: Number(item.width) || 120,
      height: Number(item.height) || 56,
    };
    interacting = true;
    el.classList.add("is-dragging");

    const selector = kind === "room" ? `.ed-room[data-id="${item.id}"]` : `.ed-table[data-id="${item.id}"]`;
    const liveEl = () => canvasInner?.querySelector(selector) || el;
    const minW = kind === "room" ? 24 : 80;
    const minH = kind === "room" ? 18 : 80;
    const maxSize = kind === "room" ? 600 : 480;
    const lockSquare = kind === "table" && (item.shape === "round" || item.shape === "square");

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
        width = Math.min(maxSize, Math.max(minW, width));
        height = Math.min(maxSize, Math.max(minH, height));
        if (lockSquare) {
          const size = Math.max(width, height);
          if (resizeDir.includes("w")) x = orig.x + orig.width - size;
          if (resizeDir.includes("n")) y = orig.y + orig.height - size;
          width = size;
          height = size;
        }
        item.x = Math.max(0, x);
        item.y = Math.max(0, y);
        item.width = width;
        item.height = height;
      } else {
        item.x = Math.max(0, orig.x + dx);
        item.y = Math.max(0, orig.y + dy);
      }

      if (node) {
        node.style.left = `${item.x}px`;
        node.style.top = `${item.y}px`;
        node.style.width = `${item.width}px`;
        node.style.height = `${item.height}px`;
      }
    };

    const onUp = () => {
      interacting = false;
      liveEl()?.classList.remove("is-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      scheduleSave(item);
      renderProps();
      updateHeaderMeta();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    canvas?.focus();
  }

  async function assignGuest(guestId, tableId, side = "s") {
    const guest = guests.find((g) => g.id === guestId);
    if (!guest) return;

    if (tableId) {
      const table = tables.find((t) => t.id === tableId);
      const seatedHere = guests.filter((g) => g.table_id === tableId && g.id !== guestId).length;
      if (table && seatedHere >= (table.seats || 8)) {
        return alert("Bordet er fuldt. Øg antal pladser under egenskaber.");
      }
    }

    const seatSide = tableId ? side || "s" : null;
    const seatIndex = tableId
      ? guests.filter((g) => g.table_id === tableId && (g.seat_side || "s") === seatSide && g.id !== guestId).length
      : null;

    const { error } = await client
      .from("event_guests")
      .update({
        table_id: tableId,
        seat_index: seatIndex,
        seat_side: seatSide,
      })
      .eq("id", guestId);
    if (error) return alert(error.message);
    guest.table_id = tableId;
    guest.seat_index = seatIndex;
    guest.seat_side = seatSide;
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
    selectItem("table", data.id);
  }

  async function addRoom(kind) {
    const meta = roomCatalog[kind];
    if (!meta) return;
    const payload = {
      event_id: currentEvent.id,
      owner_id: currentUser.id,
      kind,
      label: meta.label,
      x: 120 + (rooms.length % 4) * 40,
      y: 120 + Math.floor(rooms.length / 4) * 40,
      width: meta.width,
      height: meta.height,
      rotation: 0,
    };
    const { data, error } = await client.from("event_room_items").insert(payload).select("*").single();
    if (error) return alert(error.message);
    rooms.push(data);
    selectItem("room", data.id);
  }

  async function duplicateSelected() {
    const source = getSelected();
    if (!source) return;
    if (selectedKind === "room") {
      const payload = {
        event_id: currentEvent.id,
        owner_id: currentUser.id,
        kind: source.kind,
        label: `${source.label || roomCatalog[source.kind]?.label || "Rum"} kopi`,
        x: (source.x || 0) + 28,
        y: (source.y || 0) + 28,
        width: source.width,
        height: source.height,
        rotation: source.rotation || 0,
      };
      const { data, error } = await client.from("event_room_items").insert(payload).select("*").single();
      if (error) return alert(error.message);
      rooms.push(data);
      selectItem("room", data.id);
      return;
    }
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
    selectItem("table", data.id);
  }

  async function deleteSelected() {
    const item = getSelected();
    if (!item) return;
    if (selectedKind === "room") {
      const { error } = await client.from("event_room_items").delete().eq("id", item.id);
      if (error) return alert(error.message);
      rooms = rooms.filter((r) => r.id !== item.id);
      clearSelection();
      return;
    }
    await client.from("event_guests").update({ table_id: null, seat_index: null, seat_side: null }).eq("table_id", item.id);
    const { error } = await client.from("event_tables").delete().eq("id", item.id);
    if (error) return alert(error.message);
    guests.forEach((g) => {
      if (g.table_id === item.id) {
        g.table_id = null;
        g.seat_index = null;
        g.seat_side = null;
      }
    });
    tables = tables.filter((t) => t.id !== item.id);
    clearSelection();
    renderPool();
  }

  function rotateSelected(delta) {
    const item = getSelected();
    if (!item) return;
    let next = (Number(item.rotation) || 0) + delta;
    if (next > 180) next -= 360;
    if (next < -180) next += 360;
    item.rotation = next;
    const sel = selectedKind === "room"
      ? `.ed-room[data-id="${item.id}"]`
      : `.ed-table[data-id="${item.id}"]`;
    const el = canvasInner?.querySelector(sel);
    if (el) el.style.transform = `rotate(${item.rotation}deg)`;
    scheduleSave(item);
    renderProps();
  }

  function copySelected() {
    const item = getSelected();
    if (!item) return;
    clipboard = selectedKind === "room"
      ? {
          kind: "room",
          roomKind: item.kind,
          label: item.label,
          width: item.width,
          height: item.height,
          rotation: item.rotation || 0,
        }
      : {
          kind: "table",
          name: item.name,
          seats: item.seats,
          shape: item.shape,
          width: item.width,
          height: item.height,
          rotation: item.rotation || 0,
        };
    setSave("", "Kopieret");
  }

  async function pasteClipboard() {
    if (!clipboard) return;
    if (clipboard.kind === "room") {
      const payload = {
        event_id: currentEvent.id,
        owner_id: currentUser.id,
        kind: clipboard.roomKind,
        label: `${clipboard.label || "Rum"} kopi`,
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
      const { data, error } = await client.from("event_room_items").insert(payload).select("*").single();
      if (error) return alert(error.message);
      rooms.push(data);
      selectItem("room", data.id);
      return;
    }
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
    selectItem("table", data.id);
  }

  function wireUi() {
    document.querySelectorAll("[data-add-shape]").forEach((btn) => {
      btn.addEventListener("click", () => addTable(btn.dataset.addShape));
    });
    document.querySelectorAll("[data-add-room]").forEach((btn) => {
      btn.addEventListener("click", () => addRoom(btn.dataset.addRoom));
    });
    document.getElementById("seat-duplicate")?.addEventListener("click", () => duplicateSelected());
    document.getElementById("seat-delete")?.addEventListener("click", () => deleteSelected());
    document.getElementById("seat-rotate-ccw")?.addEventListener("click", () => rotateSelected(-15));
    document.getElementById("seat-rotate-cw")?.addEventListener("click", () => rotateSelected(15));
    document.getElementById("seat-zoom-in")?.addEventListener("click", () => setZoom(zoom + ZOOM_STEP));
    document.getElementById("seat-zoom-out")?.addEventListener("click", () => setZoom(zoom - ZOOM_STEP));
    document.getElementById("seat-zoom-label")?.addEventListener("click", () => setZoom(1));

    canvasInner?.addEventListener("pointerdown", (e) => {
      if (e.target === canvasInner) clearSelection();
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
      if (mod && (e.key === "=" || e.key === "+")) {
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
      if (e.key === "[") {
        e.preventDefault();
        rotateSelected(-15);
      }
      if (e.key === "]") {
        e.preventDefault();
        rotateSelected(15);
      }
      if (e.key === "Escape") clearSelection();
      if (!mod && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const item = getSelected();
        if (!item) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowLeft") item.x = Math.max(0, (item.x || 0) - step);
        if (e.key === "ArrowRight") item.x = (item.x || 0) + step;
        if (e.key === "ArrowUp") item.y = Math.max(0, (item.y || 0) - step);
        if (e.key === "ArrowDown") item.y = (item.y || 0) + step;
        const sel = selectedKind === "room"
          ? `.ed-room[data-id="${item.id}"]`
          : `.ed-table[data-id="${item.id}"]`;
        const node = canvasInner?.querySelector(sel);
        if (node) {
          node.style.left = `${item.x}px`;
          node.style.top = `${item.y}px`;
        }
        scheduleSave(item);
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

    const [{ data: tableRows }, { data: guestRows }, { data: roomRows }] = await Promise.all([
      client.from("event_tables").select("*").eq("event_id", eventId).order("created_at", { ascending: true }),
      client.from("event_guests").select("*").eq("event_id", eventId).order("created_at", { ascending: true }),
      client.from("event_room_items").select("*").eq("event_id", eventId).order("created_at", { ascending: true }),
    ]);
    tables = tableRows || [];
    guests = guestRows || [];
    rooms = roomRows || [];

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
