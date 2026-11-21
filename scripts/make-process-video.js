const { createCanvas } = require("canvas");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ffmpegPath = require("ffmpeg-static");
const OUT = path.join(__dirname, "..", "assets", "process.mp4");
const W = 720;
const H = 720;
const FPS = 30;
const STEP_SEC = 3.5;
const STEPS = 4;
const TOTAL_FRAMES = Math.round(FPS * STEP_SEC * STEPS);

function clamp(v, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}
function easeOut(t) {
  return 1 - Math.pow(1 - clamp(t), 3);
}
function easeInOut(t) {
  t = clamp(t);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function hexAlpha(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawPerson(ctx, x, y, color, waveT = 0) {
  ctx.save();
  ctx.translate(x, y);
  // head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -38, 16, 0, Math.PI * 2);
  ctx.fill();
  // body
  roundRect(ctx, -18, -20, 36, 44, 12);
  ctx.fill();
  // arm wave
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(16, -8);
  ctx.quadraticCurveTo(34, -18 + Math.sin(waveT * Math.PI * 2) * 10, 42, -6 + Math.cos(waveT * Math.PI * 2) * 8);
  ctx.stroke();
  ctx.restore();
}

function drawChatBubble(ctx, x, y, w, h, text, color, side, appear) {
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.translate(x, y - (1 - appear) * 16);
  ctx.fillStyle = hexAlpha(color, 0.18);
  roundRect(ctx, 0, 0, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = hexAlpha(color, 0.45);
  ctx.lineWidth = 2;
  roundRect(ctx, 0, 0, w, h, 16);
  ctx.stroke();

  // tail
  ctx.beginPath();
  if (side === "left") {
    ctx.moveTo(18, h);
    ctx.lineTo(28, h + 12);
    ctx.lineTo(40, h);
  } else {
    ctx.moveTo(w - 18, h);
    ctx.lineTo(w - 28, h + 12);
    ctx.lineTo(w - 40, h);
  }
  ctx.closePath();
  ctx.fillStyle = hexAlpha(color, 0.18);
  ctx.fill();

  ctx.fillStyle = "#e8eaf0";
  ctx.font = "600 15px sans-serif";
  ctx.fillText(text, 16, 30);
  ctx.restore();
}

function drawParticles(ctx, t, color, count = 18) {
  for (let i = 0; i < count; i++) {
    const seed = i * 97.13;
    const px = (Math.sin(seed) * 0.5 + 0.5) * W;
    const py = ((t * 40 + seed * 13) % (H + 40)) - 20;
    const size = 2 + (i % 4);
    ctx.globalAlpha = 0.15 + (i % 5) * 0.05;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawScene(ctx, sceneIndex, localT, absT) {
  const accents = ["#5b8cff", "#0be881", "#ffc14d", "#ff6b9d"];
  const accent = accents[sceneIndex];

  // bg
  ctx.fillStyle = "#0f1016";
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.55, H * 0.35, 10, W * 0.55, H * 0.35, 420);
  g.addColorStop(0, hexAlpha(accent, 0.18));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawParticles(ctx, absT, accent, 22);

  // brand chip
  ctx.fillStyle = "rgba(26,27,33,0.85)";
  roundRect(ctx, 28, 24, 168, 34, 99);
  ctx.fill();
  ctx.fillStyle = "#0be881";
  ctx.font = "700 14px sans-serif";
  ctx.fillText("Canvamedia.dk", 48, 46);

  if (sceneIndex === 0) sceneTalk(ctx, localT, accent);
  if (sceneIndex === 1) sceneBuild(ctx, localT, accent);
  if (sceneIndex === 2) sceneReview(ctx, localT, accent);
  if (sceneIndex === 3) sceneLive(ctx, localT, accent);

  // bottom progress
  const progress = (sceneIndex + clamp(localT)) / STEPS;
  ctx.fillStyle = "#22232c";
  roundRect(ctx, 40, H - 34, W - 80, 6, 99);
  ctx.fill();
  ctx.fillStyle = "#0be881";
  roundRect(ctx, 40, H - 34, (W - 80) * progress, 6, 99);
  ctx.fill();

  for (let i = 0; i < STEPS; i++) {
    ctx.beginPath();
    ctx.fillStyle = i <= sceneIndex ? "#0be881" : "#3a3c48";
    ctx.arc(W / 2 - 36 + i * 24, H - 54, i === sceneIndex ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function sceneTalk(ctx, t, accent) {
  // title
  const titleA = easeOut(clamp(t / 0.25));
  ctx.globalAlpha = titleA;
  ctx.fillStyle = "#5b8cff";
  ctx.font = "800 18px sans-serif";
  ctx.fillText("01  ·  SAMTALE", 40, 100);
  ctx.fillStyle = "#fff";
  ctx.font = "700 34px sans-serif";
  ctx.fillText("Vi aftaler din hjemmeside", 40, 142);
  ctx.fillStyle = "#b1b3c0";
  ctx.font = "500 18px sans-serif";
  ctx.fillText("Behov, mål og pris — helt klart fra start", 40, 172);
  ctx.globalAlpha = 1;

  // people walking in
  const p1 = easeOut(clamp((t - 0.1) / 0.35));
  const p2 = easeOut(clamp((t - 0.2) / 0.35));
  drawPerson(ctx, lerp(-40, 180, p1), 430, "#7ea2ff", t);
  drawPerson(ctx, lerp(780, 520, p2), 430, "#0be881", t + 0.25);

  // chat bubbles appear
  drawChatBubble(
    ctx,
    70,
    220,
    280,
    48,
    "Vi skal bruge en ny hjemmeside",
    "#5b8cff",
    "left",
    easeOut(clamp((t - 0.35) / 0.25))
  );
  drawChatBubble(
    ctx,
    360,
    290,
    290,
    48,
    "Perfekt — lad os finde prisen",
    "#0be881",
    "right",
    easeOut(clamp((t - 0.55) / 0.25))
  );

  // handshake / price card flies in
  const deal = easeOut(clamp((t - 0.75) / 0.25));
  if (deal > 0) {
    ctx.save();
    ctx.globalAlpha = deal;
    ctx.translate(W / 2, 520);
    ctx.scale(lerp(0.7, 1, deal), lerp(0.7, 1, deal));
    ctx.fillStyle = "rgba(11,232,129,0.12)";
    roundRect(ctx, -110, -28, 220, 56, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(11,232,129,0.5)";
    ctx.lineWidth = 2;
    roundRect(ctx, -110, -28, 220, 56, 16);
    ctx.stroke();
    ctx.fillStyle = "#0be881";
    ctx.font = "800 18px sans-serif";
    ctx.fillText("Aftalt pris  ✓", -68, 6);
    ctx.restore();
  }

  // checklist items ticking
  const items = ["Mål & målgruppe", "Designretning", "Pris & deadline"];
  items.forEach((item, i) => {
    const a = easeOut(clamp((t - (0.85 + i * 0.05)) / 0.2));
    if (a <= 0) return;
    ctx.globalAlpha = a;
    const y = 560 + i * 28;
    ctx.fillStyle = hexAlpha("#0be881", 0.2);
    ctx.beginPath();
    ctx.arc(60, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0be881";
    ctx.font = "700 12px sans-serif";
    ctx.fillText("✓", 55, y + 4);
    ctx.fillStyle = "#d5d7e0";
    ctx.font = "500 14px sans-serif";
    ctx.fillText(item, 78, y + 5);
  });
  ctx.globalAlpha = 1;
}

function sceneBuild(ctx, t, accent) {
  ctx.globalAlpha = easeOut(clamp(t / 0.2));
  ctx.fillStyle = "#0be881";
  ctx.font = "800 18px sans-serif";
  ctx.fillText("02  ·  UDVIKLING", 40, 100);
  ctx.fillStyle = "#fff";
  ctx.font = "700 34px sans-serif";
  ctx.fillText("Vi bygger din side", 40, 142);
  ctx.fillStyle = "#b1b3c0";
  ctx.font = "500 18px sans-serif";
  ctx.fillText("Design, kode og indhold samles live", 40, 172);
  ctx.globalAlpha = 1;

  // laptop shell
  const enter = easeOut(clamp((t - 0.1) / 0.3));
  ctx.save();
  ctx.globalAlpha = enter;
  ctx.translate(W / 2, lerp(520, 400, enter));
  ctx.scale(lerp(0.9, 1, enter), lerp(0.9, 1, enter));

  // screen
  ctx.fillStyle = "#1a1b21";
  roundRect(ctx, -250, -170, 500, 300, 18);
  ctx.fill();
  ctx.strokeStyle = "#3a3c48";
  ctx.lineWidth = 3;
  roundRect(ctx, -250, -170, 500, 300, 18);
  ctx.stroke();

  // browser chrome
  ctx.fillStyle = "#12131a";
  roundRect(ctx, -236, -156, 472, 272, 12);
  ctx.fill();
  ctx.fillStyle = "#1c1d24";
  ctx.fillRect(-236, -156, 472, 28);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
    ctx.beginPath();
    ctx.fillStyle = c;
    ctx.arc(-214 + i * 14, -142, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // website assembling
  const nav = easeOut(clamp((t - 0.3) / 0.2));
  ctx.globalAlpha = nav;
  ctx.fillStyle = "#0be881";
  roundRect(ctx, -220, -112, 36, 14, 4);
  ctx.fill();
  ctx.fillStyle = "#2f313b";
  roundRect(ctx, 80, -110, 100, 8, 99);
  ctx.fill();

  // hero lines typing
  for (let i = 0; i < 3; i++) {
    const p = easeOut(clamp((t - (0.45 + i * 0.12)) / 0.2));
    ctx.globalAlpha = p;
    ctx.fillStyle = i === 0 ? hexAlpha("#0be881", 0.7) : "#2f313b";
    roundRect(ctx, -220, -70 + i * 22, (280 - i * 50) * p, i === 0 ? 14 : 10, 99);
    ctx.fill();
  }

  // CTA button pops
  const btn = easeOut(clamp((t - 0.8) / 0.15));
  ctx.globalAlpha = btn;
  ctx.fillStyle = "#0be881";
  roundRect(ctx, -220, 10, 90 * btn, 28, 8);
  ctx.fill();

  // cards slide up
  for (let i = 0; i < 3; i++) {
    const p = easeOut(clamp((t - (0.95 + i * 0.1)) / 0.25));
    ctx.globalAlpha = p;
    const y = lerp(90, 55, p);
    ctx.fillStyle = "#1a1b21";
    roundRect(ctx, -220 + i * 145, y, 130, 70, 10);
    ctx.fill();
    ctx.strokeStyle = hexAlpha("#0be881", 0.25 + p * 0.35);
    ctx.lineWidth = 2;
    roundRect(ctx, -220 + i * 145, y, 130, 70, 10);
    ctx.stroke();
    ctx.fillStyle = hexAlpha("#0be881", 0.2);
    roundRect(ctx, -208 + i * 145, y + 12, 50, 8, 99);
    ctx.fill();
  }

  // code cursor blink on side panel
  if (t > 0.5) {
    ctx.globalAlpha = (Math.sin(t * 24) + 1) / 2;
    ctx.fillStyle = "#0be881";
    ctx.fillRect(200, -40, 6, 14);
  }

  ctx.restore();
  ctx.globalAlpha = 1;

  // floating UI pieces orbiting in
  const bits = [
    { x: 90, y: 260, c: "#5b8cff" },
    { x: 620, y: 280, c: "#ffc14d" },
    { x: 100, y: 560, c: "#ff6b9d" },
    { x: 610, y: 540, c: "#0be881" },
  ];
  bits.forEach((b, i) => {
    const p = easeOut(clamp((t - 0.2 - i * 0.05) / 0.35));
    const bob = Math.sin(t * 6 + i) * 6;
    ctx.globalAlpha = p * 0.9;
    ctx.fillStyle = hexAlpha(b.c, 0.35);
    roundRect(ctx, b.x, b.y + bob, 28, 28, 8);
    ctx.fill();
    ctx.strokeStyle = hexAlpha(b.c, 0.7);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function sceneReview(ctx, t, accent) {
  ctx.globalAlpha = easeOut(clamp(t / 0.2));
  ctx.fillStyle = "#ffc14d";
  ctx.font = "800 18px sans-serif";
  ctx.fillText("03  ·  GODKENDELSE", 40, 100);
  ctx.fillStyle = "#fff";
  ctx.font = "700 34px sans-serif";
  ctx.fillText("Færdigt udkast", 40, 142);
  ctx.fillStyle = "#b1b3c0";
  ctx.font = "500 18px sans-serif";
  ctx.fillText("Du ser det, retter til og godkender", 40, 172);
  ctx.globalAlpha = 1;

  // draft pages flipping / sliding
  for (let i = 0; i < 3; i++) {
    const p = easeOut(clamp((t - i * 0.12) / 0.35));
    const x = 120 + i * 40;
    const y = 250 + i * 16;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(x + 160, y + 140);
    ctx.rotate((-8 + i * 4) * (Math.PI / 180) * (1 - p * 0.3));
    ctx.translate(-(x + 160), -(y + 140));
    ctx.fillStyle = "#171822";
    roundRect(ctx, x, y, 320, 280, 16);
    ctx.fill();
    ctx.strokeStyle = hexAlpha("#ffc14d", 0.25);
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, 320, 280, 16);
    ctx.stroke();
    ctx.fillStyle = "#22232c";
    ctx.fillRect(x, y, 320, 36);
    ctx.fillStyle = "#2f313b";
    roundRect(ctx, x + 20, y + 60, 180, 10, 99);
    ctx.fill();
    roundRect(ctx, x + 20, y + 84, 120, 8, 99);
    ctx.fill();
    ctx.fillStyle = hexAlpha("#ffc14d", 0.2);
    roundRect(ctx, x + 20, y + 120, 280, 100, 12);
    ctx.fill();
    ctx.restore();
  }

  // cursor moving to approve
  const move = easeInOut(clamp((t - 0.45) / 0.35));
  const cx = lerp(200, 470, move);
  const cy = lerp(420, 500, move);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + 14, cy + 18);
  ctx.lineTo(cx + 8, cy + 18);
  ctx.lineTo(cx + 12, cy + 28);
  ctx.lineTo(cx + 6, cy + 28);
  ctx.lineTo(cx + 2, cy + 18);
  ctx.lineTo(cx - 6, cy + 18);
  ctx.closePath();
  ctx.fill();

  // approve button + stamp
  const click = easeOut(clamp((t - 0.75) / 0.2));
  ctx.globalAlpha = Math.max(click, easeOut(clamp((t - 0.55) / 0.2)));
  ctx.fillStyle = click > 0.2 ? "#0be881" : "#2f313b";
  roundRect(ctx, 400, 470, 150, 44, 12);
  ctx.fill();
  ctx.fillStyle = click > 0.2 ? "#04140c" : "#b1b3c0";
  ctx.font = "800 16px sans-serif";
  ctx.fillText("Godkend  →", 424, 498);

  const stamp = easeOut(clamp((t - 0.85) / 0.2));
  if (stamp > 0) {
    ctx.save();
    ctx.globalAlpha = stamp;
    ctx.translate(300, 360);
    ctx.rotate(-0.2);
    ctx.scale(lerp(1.4, 1, stamp), lerp(1.4, 1, stamp));
    ctx.strokeStyle = "#0be881";
    ctx.lineWidth = 4;
    roundRect(ctx, -70, -24, 140, 48, 10);
    ctx.stroke();
    ctx.fillStyle = "#0be881";
    ctx.font = "800 18px sans-serif";
    ctx.fillText("GODKENDT", -58, 8);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function sceneLive(ctx, t, accent) {
  ctx.globalAlpha = easeOut(clamp(t / 0.2));
  ctx.fillStyle = "#ff6b9d";
  ctx.font = "800 18px sans-serif";
  ctx.fillText("04  ·  LAUNCH", 40, 100);
  ctx.fillStyle = "#fff";
  ctx.font = "700 34px sans-serif";
  ctx.fillText("Din side går live", 40, 142);
  ctx.fillStyle = "#b1b3c0";
  ctx.font = "500 18px sans-serif";
  ctx.fillText("Opsætning i systemet — klar til kunder", 40, 172);
  ctx.globalAlpha = 1;

  // server racks lighting up
  for (let i = 0; i < 3; i++) {
    const on = easeOut(clamp((t - 0.15 - i * 0.12) / 0.25));
    const x = 70 + i * 70;
    ctx.fillStyle = "#1a1b21";
    roundRect(ctx, x, 250, 56, 120, 10);
    ctx.fill();
    for (let r = 0; r < 4; r++) {
      ctx.fillStyle = on > 0.3 + r * 0.1 ? "#0be881" : "#2f313b";
      ctx.globalAlpha = on;
      roundRect(ctx, x + 10, 265 + r * 24, 36, 10, 4);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // browser rising / zooming
  const rise = easeOut(clamp((t - 0.35) / 0.4));
  ctx.save();
  ctx.globalAlpha = rise;
  ctx.translate(W / 2 + 60, lerp(560, 390, rise));
  ctx.scale(lerp(0.7, 1, rise), lerp(0.7, 1, rise));
  ctx.fillStyle = "#12131a";
  roundRect(ctx, -180, -130, 360, 240, 14);
  ctx.fill();
  ctx.strokeStyle = hexAlpha("#0be881", 0.35);
  ctx.lineWidth = 2;
  roundRect(ctx, -180, -130, 360, 240, 14);
  ctx.stroke();
  ctx.fillStyle = "#1a1b21";
  ctx.fillRect(-180, -130, 360, 30);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
    ctx.beginPath();
    ctx.fillStyle = c;
    ctx.arc(-158 + i * 14, -115, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#8b8d9a";
  ctx.font = "500 12px sans-serif";
  ctx.fillText("ditfirma.dk", -30, -111);

  // site content
  ctx.fillStyle = "#0be881";
  roundRect(ctx, -150, -70, 40, 14, 4);
  ctx.fill();
  ctx.fillStyle = "#2f313b";
  roundRect(ctx, -150, -40, 200, 12, 99);
  ctx.fill();
  roundRect(ctx, -150, -18, 140, 8, 99);
  ctx.fill();
  ctx.fillStyle = "#0be881";
  roundRect(ctx, -150, 10, 80, 24, 8);
  ctx.fill();

  // LIVE badge pulse
  const live = easeOut(clamp((t - 0.65) / 0.2));
  if (live > 0) {
    const pulse = 1 + Math.sin(t * 10) * 0.06;
    ctx.save();
    ctx.translate(90, -20);
    ctx.scale(pulse * live, pulse * live);
    ctx.fillStyle = "#0be881";
    roundRect(ctx, -40, -16, 80, 32, 99);
    ctx.fill();
    ctx.fillStyle = "#04140c";
    ctx.font = "800 14px sans-serif";
    ctx.fillText("LIVE", -18, 5);
    ctx.restore();
  }
  ctx.restore();

  // confetti / rockets
  if (t > 0.7) {
    for (let i = 0; i < 24; i++) {
      const ct = clamp((t - 0.7) / 0.5);
      const angle = (i / 24) * Math.PI * 2;
      const dist = ct * (80 + (i % 5) * 30);
      const px = W / 2 + 60 + Math.cos(angle) * dist;
      const py = 390 + Math.sin(angle) * dist - ct * 40;
      ctx.globalAlpha = 1 - ct;
      ctx.fillStyle = ["#0be881", "#5b8cff", "#ffc14d", "#ff6b9d"][i % 4];
      ctx.fillRect(px, py, 6, 6);
    }
  }

  // rocket
  if (t > 0.55) {
    const rt = clamp((t - 0.55) / 0.7);
    ctx.globalAlpha = 1 - rt * 0.8;
    ctx.font = "36px sans-serif";
    ctx.fillText("🚀", 560, lerp(480, 180, easeOut(rt)));
  }
  ctx.globalAlpha = 1;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const ff = spawn(
    ffmpegPath,
    [
      "-y",
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "-s", `${W}x${H}`,
      "-r", String(FPS),
      "-i", "-",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      OUT,
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
  );

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const absT = frame / FPS;
    const sceneIndex = Math.min(STEPS - 1, Math.floor(absT / STEP_SEC));
    const localT = (absT - sceneIndex * STEP_SEC) / STEP_SEC;
    drawScene(ctx, sceneIndex, localT, absT);
    const buf = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer);
    const ok = ff.stdin.write(buf);
    if (!ok) await new Promise((r) => ff.stdin.once("drain", r));
  }

  ff.stdin.end();
  await new Promise((resolve, reject) => {
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code))));
  });
  console.log("Wrote", OUT, `(${TOTAL_FRAMES} frames)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
