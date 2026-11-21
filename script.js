/* ---- Theme toggle ---- */
function initTheme() {
  const root = document.documentElement;
  const btn = document.getElementById("theme-toggle");
  const saved = localStorage.getItem("eventlink-theme");
  const theme = saved === "light" || saved === "dark" ? saved : "dark";
  root.setAttribute("data-theme", theme);

  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("eventlink-theme", next);
  });
}

/* ---- Header mega menus + mobile nav ---- */
function initMobileNav() {
  const burger = document.getElementById("nav-burger");
  const mobile = document.getElementById("mobile-nav");
  const megaSlot = document.getElementById("mega-slot");
  const dropdowns = Array.from(document.querySelectorAll("[data-nav-dropdown]"));
  const panels = Array.from(document.querySelectorAll("[data-mega-panel]"));

  function closeDropdowns() {
    dropdowns.forEach((item) => {
      item.classList.remove("is-open");
      const trigger = item.querySelector(".nav-trigger");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
    panels.forEach((panel) => panel.setAttribute("hidden", ""));
    if (megaSlot) megaSlot.setAttribute("hidden", "");
  }

  function openMega(name) {
    if (!megaSlot) return;
    megaSlot.removeAttribute("hidden");
    panels.forEach((panel) => {
      if (panel.getAttribute("data-mega-panel") === name) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });
  }

  dropdowns.forEach((item) => {
    const trigger = item.querySelector(".nav-trigger");
    const name = item.getAttribute("data-mega");
    if (!trigger || !name) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = item.classList.contains("is-open");
      closeDropdowns();
      if (!open) {
        item.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
        openMega(name);
      }
    });
  });

  if (megaSlot) {
    megaSlot.addEventListener("click", (e) => e.stopPropagation());
    megaSlot.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeDropdowns);
    });
  }

  document.addEventListener("click", closeDropdowns);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDropdowns();
  });

  if (!burger || !mobile) return;

  function closeNav() {
    mobile.setAttribute("hidden", "");
    mobile.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
  }

  function openNav() {
    closeDropdowns();
    mobile.removeAttribute("hidden");
    mobile.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
  }

  burger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (mobile.hasAttribute("hidden")) openNav();
    else closeNav();
  });

  mobile.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 1024) closeNav();
  });
}

/* ---- Process video controls ---- */
function initProcessVideo() {
  const video = document.getElementById("process-video");
  const btn = document.getElementById("pause-process-video");
  if (!video || !btn) return;

  btn.addEventListener("click", () => {
    if (video.paused) {
      video.play();
      btn.textContent = "Stop afspilning";
    } else {
      video.pause();
      btn.textContent = "Afspil";
    }
  });
}

/* ---- Feature carousel ---- */
function initCarousel() {
  const root = document.getElementById("carousel");
  const track = document.getElementById("carousel-track");
  if (!root || !track) return;

  track.innerHTML += track.innerHTML;

  let x = 0;
  let vel = 0;
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let auto = true;
  const speed = 0.45;

  function halfWidth() {
    return track.scrollWidth / 2;
  }

  function wrap() {
    const half = halfWidth();
    if (half <= 0) return;
    if (x <= -half) x += half;
    if (x > 0) x -= half;
  }

  function render() {
    track.style.transform = `translate3d(${x}px,0,0)`;
  }

  function tick() {
    if (!dragging) {
      if (auto) x -= speed;
      else if (Math.abs(vel) > 0.05) {
        x += vel;
        vel *= 0.95;
      } else auto = true;
      wrap();
      render();
    }
    requestAnimationFrame(tick);
  }

  function pointerDown(clientX) {
    dragging = true;
    auto = false;
    vel = 0;
    lastX = clientX;
    lastT = performance.now();
    root.classList.add("dragging");
  }

  function pointerMove(clientX) {
    if (!dragging) return;
    const now = performance.now();
    const dx = clientX - lastX;
    const dt = Math.max(1, now - lastT);
    vel = dx * (16 / dt);
    x += dx;
    lastX = clientX;
    lastT = now;
    wrap();
    render();
  }

  function pointerUp() {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("dragging");
    if (Math.abs(vel) < 0.8) {
      setTimeout(() => {
        if (!dragging) auto = true;
      }, 900);
    }
  }

  root.addEventListener("mousedown", (e) => {
    e.preventDefault();
    pointerDown(e.clientX);
  });
  window.addEventListener("mousemove", (e) => pointerMove(e.clientX));
  window.addEventListener("mouseup", pointerUp);
  root.addEventListener("touchstart", (e) => pointerDown(e.touches[0].clientX), { passive: true });
  root.addEventListener("touchmove", (e) => pointerMove(e.touches[0].clientX), { passive: true });
  root.addEventListener("touchend", pointerUp);
  root.addEventListener("mouseenter", () => {
    if (!dragging) auto = false;
  });
  root.addEventListener("mouseleave", () => {
    if (!dragging) auto = true;
  });

  requestAnimationFrame(() => {
    x = -halfWidth() * 0.08;
    render();
    tick();
  });
}

/* ---- Hero word animation ---- */
function animateHeroWords() {
  const h1 = document.querySelector(".hero-text h1");
  if (!h1) return;

  const nodes = Array.from(h1.childNodes);
  h1.textContent = "";
  let delay = 180;

  nodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .forEach((word) => {
          const span = document.createElement("span");
          span.className = "hero-word";
          span.style.setProperty("--d", `${delay}ms`);
          span.textContent = word;
          h1.appendChild(span);
          h1.appendChild(document.createTextNode(" "));
          delay += 40;
        });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const span = document.createElement("span");
      span.className = "hero-word";
      span.style.setProperty("--d", `${delay}ms`);
      span.appendChild(node.cloneNode(true));
      h1.appendChild(span);
      h1.appendChild(document.createTextNode(" "));
      delay += 40;
    }
  });
}

/* ---- Scroll reveals ---- */
function initReveals() {
  const els = document.querySelectorAll(".reveal");
  if (!els.length) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    els.forEach((el) => el.classList.add("in"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -6% 0px" }
  );

  els.forEach((el) => io.observe(el));
}

/* ---- Hero event cards fade stack + mouse swipe ---- */
function initHeroEvents() {
  const root = document.getElementById("hero-events");
  if (!root) return;
  const slides = Array.from(root.querySelectorAll(".event-slide"));
  const dots = Array.from(root.querySelectorAll(".event-dots span"));
  if (slides.length < 2) return;

  let i = 0;
  let timer = null;
  let dragging = false;
  let startX = 0;
  let deltaX = 0;

  function render() {
    const prev = (i - 1 + slides.length) % slides.length;
    const next = (i + 1) % slides.length;
    slides.forEach((slide, idx) => {
      slide.classList.toggle("is-active", idx === i);
      slide.classList.toggle("is-prev", idx === prev);
      slide.classList.toggle("is-next", idx === next);
    });
    dots.forEach((dot, idx) => dot.classList.toggle("is-on", idx === i));
  }

  function go(to) {
    i = (to + slides.length) % slides.length;
    render();
  }

  function next() {
    go(i + 1);
  }

  function prev() {
    go(i - 1);
  }

  function startAuto() {
    stopAuto();
    timer = setInterval(next, 2800);
  }

  function stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    deltaX = 0;
    stopAuto();
    root.classList.add("is-dragging");
    root.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    deltaX = e.clientX - startX;
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");
    try {
      root.releasePointerCapture?.(e.pointerId);
    } catch (_) {}

    if (Math.abs(deltaX) > 40) {
      if (deltaX < 0) next();
      else prev();
    }
    deltaX = 0;
    startAuto();
  }

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerUp);
  root.addEventListener("pointerleave", () => {
    if (dragging) {
      dragging = false;
      root.classList.remove("is-dragging");
      deltaX = 0;
      startAuto();
    }
  });

  dots.forEach((dot, idx) => {
    dot.addEventListener("click", () => {
      stopAuto();
      go(idx);
      startAuto();
    });
  });

  render();
  startAuto();
}

initTheme();
initMobileNav();
initCarousel();
animateHeroWords();
initReveals();
initHeroEvents();
initProcessVideo();
