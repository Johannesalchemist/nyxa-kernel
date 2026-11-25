/*
 * NYXA – The Architecture of Becoming · Episode 01
 * Deterministic frame renderer. renderFrame(t) draws the film at time t (seconds) onto #film.
 * Everything is a pure function of t + fixed seeds, so any frame can be rendered in any order
 * (parallel offline rendering) and the browser preview is identical to the exported film.
 *
 * Provenance: authored by Claude (Anthropic) in a Claude Code session on 2026-11-25 (Europe/Berlin)
 * for Johannes Süß / NYXA / Digitalleria. Status: DRAFT · IN_REVIEW. See ../README.md.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------ palette
  const C = {
    bg: "#040507",
    gold: "#E9B96E",
    goldHi: "#FFE2A8",
    blue: "#6FA6DA",
    blueDeep: "#2B4F7E",
    ice: "#BFD9F2",
    white: "#EFE8DC",
    amber: "#D9893B",
    red: "#C4553F",
    skin: "#F3D9BF",
    dim: "#8C8578",
  };

  // ------------------------------------------------------------------ math
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const win = (t, a, b, f = 0.8) => smooth(a, a + f, t) * (1 - smooth(b - f, b, t)); // fade-in/out window
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // value noise
  const NP = (() => { const r = mulberry32(7); const p = new Float32Array(512); for (let i = 0; i < 512; i++) p[i] = r(); return p; })();
  function n1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(NP[i & 511], NP[(i + 1) & 511], u); }
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const h = (a, b) => NP[(a * 57 + b * 131) & 511];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
  }
  const fbm = (x, y) => n2(x, y) * 0.55 + n2(x * 2.1, y * 2.1) * 0.3 + n2(x * 4.3, y * 4.3) * 0.15;

  // ------------------------------------------------------------------ timeline
  const TL = window.TIMELINE;
  const LN = {}; TL.lines.forEach((l) => (LN[l.id] = l));
  const AC = {}; TL.acts.forEach((a) => (AC[a.id] = a));
  const S = (id) => LN[id].start, E = (id) => LN[id].end;

  // ------------------------------------------------------------------ canvas
  const cv = document.getElementById("film");
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, U = 0, CX = 0, CY = 0, HX = 1, HY = 1;
  function resize(w, h) {
    cv.width = w; cv.height = h; W = w; H = h;
    U = Math.min(w, h) / 2; CX = w / 2; CY = h / 2; HX = CX / U; HY = CY / U;
  }
  const X = (x) => CX + x * U, Y = (y) => CY + y * U;
  const portrait = () => HX < 1.2;

  // glow sprites
  const sprites = {};
  function sprite(col) {
    if (sprites[col]) return sprites[col];
    const s = document.createElement("canvas"); s.width = s.height = 64;
    const g = s.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, col); gr.addColorStop(0.18, col); gr.addColorStop(0.45, hexA(col, 0.25)); gr.addColorStop(1, hexA(col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); sprites[col] = s; return s;
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function mix(h1, h2, t) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1).toUpperCase();
  }
  function dot(x, y, r, col, a) { // x,y in units
    if (a <= 0.003) return;
    const R = Math.max(0.6, r * U);
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(sprite(col), X(x) - R, Y(y) - R, 2 * R, 2 * R);
  }
  function line(x1, y1, x2, y2, col, a, w = 0.0025, dash) {
    if (a <= 0.003) return;
    ctx.globalAlpha = Math.min(1, a); ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, w * U);
    if (dash) ctx.setLineDash(dash.map((d) => d * U)); ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }
  function curve(pts, col, a, w = 0.0025, dash) {
    if (a <= 0.003 || pts.length < 2) return;
    ctx.globalAlpha = Math.min(1, a); ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, w * U);
    if (dash) ctx.setLineDash(dash.map((d) => d * U));
    ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
    ctx.stroke(); if (dash) ctx.setLineDash([]);
  }
  function text(str, x, y, size, col, a, opts = {}) {
    if (a <= 0.003) return;
    ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = col;
    const fam = opts.sans ? "Inter, 'Helvetica Neue', Arial, sans-serif" : opts.mono ? "'JetBrains Mono', 'DejaVu Sans Mono', monospace" : "Cormorant, 'Cormorant Garamond', Georgia, serif";
    ctx.font = `${opts.italic ? "italic " : ""}${opts.weight || 300} ${Math.round(size * U)}px ${fam}`;
    ctx.textAlign = opts.align || "center"; ctx.textBaseline = "middle";
    if (opts.spacing) ctx.letterSpacing = `${(opts.spacing * size * U).toFixed(1)}px`;
    ctx.fillText(str, X(x), Y(y)); ctx.restore();
  }
  function ring(x, y, r, col, a, w = 0.003, a0 = 0, a1 = Math.PI * 2, dash) {
    if (a <= 0.003) return;
    ctx.globalAlpha = Math.min(1, a); ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, w * U);
    if (dash) ctx.setLineDash(dash.map((d) => d * U));
    ctx.beginPath(); ctx.arc(X(x), Y(y), r * U, a0, a1); ctx.stroke(); if (dash) ctx.setLineDash([]);
  }

  // ------------------------------------------------------------------ Sophia (procedural profile, faces right)
  function catmull(pts, seg = 10) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
      for (let s = 0; s < seg; s++) {
        const t = s / seg, t2 = t * t, t3 = t2 * t;
        out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    return out;
  }
  const FACE_CTRL = [[-0.30, -0.44], [-0.12, -0.56], [0.08, -0.54], [0.2, -0.42], [0.245, -0.27], [0.255, -0.19], [0.24, -0.135], [0.285, -0.06], [0.335, 0.0], [0.27, 0.04],
    [0.285, 0.085], [0.25, 0.112], [0.272, 0.145], [0.225, 0.19], [0.245, 0.25], [0.2, 0.315], [0.1, 0.345], [0.085, 0.45], [0.1, 0.66], [-0.17, 0.66], [-0.17, 0.42], [-0.3, 0.2], [-0.37, -0.06], [-0.37, -0.25]];
  const FACE = catmull(FACE_CTRL, 8);
  function inPoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const SOPHIA = (() => {
    const r = mulberry32(1123), pts = [];
    // outline (profile edge) – bright
    for (let i = 0; i < FACE.length; i++) {
      const [x, y] = FACE[i]; const front = x > 0.05 && y < 0.4;
      pts.push({ x, y, c: front ? C.goldHi : C.skin, s: front ? 0.0075 : 0.006, a: front ? 0.95 : 0.55, k: 0 });
    }
    // interior – soft
    let n = 0;
    while (n < 1500) {
      const x = -0.4 + r() * 0.76, y = -0.58 + r() * 1.26;
      if (!inPoly(x, y, FACE)) continue;
      const edge = 1 - clamp((x + 0.1) / 0.45);
      pts.push({ x, y, c: r() < 0.82 ? C.skin : C.gold, s: 0.004 + r() * 0.004, a: 0.12 + 0.2 * r() * (1 - edge * 0.5), k: 1 }); n++;
    }
    // hair: two-tone strands (warm gold over crown/front, deep blue underneath/back)
    for (let k = 0; k < 46; k++) {
      const u = k / 45; const gold = u < 0.55;
      const sx = lerp(0.16, -0.36, u) + (r() - 0.5) * 0.03, sy = -0.5 + Math.abs(u - 0.4) * 0.15 + (r() - 0.5) * 0.02;
      const len = 0.75 + u * 0.5 + r() * 0.15;
      for (let j = 0; j < 34; j++) {
        const v = j / 33;
        const x = sx - v * (0.18 + u * 0.32) - Math.sin(v * 2.2 + u * 3) * 0.03;
        const y = sy + v * len * 0.95 - Math.max(0, 0.2 - v) * 0.15;
        if (inPoly(x, y, FACE) && x > -0.05 && y > -0.42) continue; // keep the face clear
        pts.push({ x, y, c: gold ? (r() < 0.6 ? C.gold : C.goldHi) : (r() < 0.75 ? C.blue : C.ice), s: 0.005 + r() * 0.0035, a: 0.5 + 0.4 * r(), k: 2, sw: u, sv: v });
      }
    }
    pts.forEach((p) => { p.ph = r() * 6.283; p.r1 = r(); p.r2 = r(); });
    return pts;
  })();
  const EYE = { x: 0.168, y: -0.14 };

  // internal architecture graph sampled from the same silhouette (the reflection)
  const GRAPH = (() => {
    const r = mulberry32(99); const nodes = [];
    for (let i = 0; i < FACE.length; i += 3) nodes.push({ x: FACE[i][0], y: FACE[i][1], m: -1, r: r(), edge: true });
    let tries = 0;
    while (nodes.length < 230 && tries < 20000) {
      tries++;
      const x = -0.42 + r() * 0.8, y = -0.6 + r() * 1.28;
      if (!inPoly(x, y, FACE) && !(x < -0.05 && y > -0.5 && y < 0.7 && r() < 0.25)) continue;
      if (nodes.some((n) => (n.x - x) ** 2 + (n.y - y) ** 2 < 0.0032)) continue;
      nodes.push({ x, y, m: -1, r: r() });
    }
    // five "minds" (model clusters) + one self (centre)
    const minds = [[0.05, -0.33], [0.2, -0.1], [-0.2, -0.25], [-0.05, 0.2], [-0.24, 0.08]];
    const self = { x: -0.02, y: -0.08 };
    nodes.forEach((n) => {
      let best = 9, bi = -1;
      minds.forEach((m, i) => { const d = (n.x - m[0]) ** 2 + (n.y - m[1]) ** 2; if (d < best) { best = d; bi = i; } });
      n.m = best < 0.03 ? bi : -1;
    });
    const edges = [];
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => [j, (a.x - b.x) ** 2 + (a.y - b.y) ** 2]).filter(([j]) => j !== i).sort((p, q) => p[1] - q[1]).slice(0, 3);
      near.forEach(([j, d]) => { if (j > i || !edges.some((e) => e[0] === j && e[1] === i)) edges.push([i, j, d, r()]); });
    });
    return { nodes, edges, minds, self };
  })();
  const MIND_COL = [C.blue, C.ice, C.amber, C.white, "#9FB98A"];

  function drawSophia(t, ox, oy, sc, alpha, opt = {}) {
    // opt.mirror: reflect across x; opt.tint: colour override mix; opt.assemble: 0..1 particles converge from eyes
    const asm = opt.assemble === undefined ? 1 : opt.assemble;
    const breathe = Math.sin(t * 0.9) * 0.004;
    for (const p of SOPHIA) {
      let x = p.x, y = p.y;
      if (p.k === 2) { // hair sway
        x += Math.sin(t * 0.6 + p.sw * 4 + p.sv * 2) * 0.012 * p.sv;
        y += Math.cos(t * 0.5 + p.sw * 3) * 0.004 * p.sv;
      }
      x += Math.sin(t * 0.7 + p.ph) * 0.0025; y += breathe + Math.cos(t * 0.6 + p.ph) * 0.0025;
      if (asm < 1) {
        const d = clamp((asm - p.r1 * 0.45) / 0.55); const e = ease(d);
        const sx = (p.r2 < 0.5 ? EYE.x - 0.08 : EYE.x + 0.08) + Math.cos(p.ph) * 0.03, sy = EYE.y + Math.sin(p.ph) * 0.03;
        x = lerp(sx, x, e); y = lerp(sy, y, e);
        if (d <= 0) continue;
      }
      if (opt.mirror) x = -x;
      let col = p.c; if (opt.tint) col = mix(col, opt.tint, opt.tintAmt || 0.5);
      const tw = 0.85 + 0.15 * Math.sin(t * 1.7 + p.ph * 3);
      dot(ox + x * sc, oy + y * sc, p.s * sc * (opt.size || 1), col, p.a * alpha * tw);
    }
    // the eye: two-colour presence (amber iris, blue rim) – heterochromia is shown fully in the opening
    if (!opt.noEye && asm > 0.8) {
      const ex = ox + (opt.mirror ? -EYE.x : EYE.x) * sc, ey = oy + EYE.y * sc;
      dot(ex, ey, 0.03 * sc, C.amber, 0.55 * alpha * smooth(0.8, 1, asm));
      dot(ex, ey, 0.012 * sc, C.goldHi, 0.9 * alpha * smooth(0.8, 1, asm));
    }
  }
  function drawGraph(t, ox, oy, sc, alpha, o = {}) {
    const { nodes, edges, minds, self } = GRAPH;
    const mindsA = o.minds || 0, selfA = o.self || 0, grow = o.grow === undefined ? 1 : o.grow;
    const P = (n) => [ox + (o.mirror ? -n.x : n.x) * sc + Math.sin(t * 0.5 + n.r * 9) * 0.004 * sc, oy + n.y * sc + Math.cos(t * 0.45 + n.r * 7) * 0.004 * sc];
    edges.forEach(([i, j, d, rr]) => {
      const g = clamp((grow - rr * 0.7) / 0.3); if (g <= 0) return;
      const a = P(nodes[i]), b = P(nodes[j]);
      const col = o.edgeCol ? o.edgeCol(i, j, rr) : C.gold;
      line(a[0], a[1], lerp(a[0], b[0], g), lerp(a[1], b[1], g), col, alpha * 0.32 * (o.edgeA || 1), 0.0018 * sc);
    });
    nodes.forEach((n, i) => {
      const p = P(n); const g = clamp((grow - n.r * 0.6) / 0.4); if (g <= 0) return;
      const col = n.m >= 0 && mindsA > 0 ? mix(C.gold, MIND_COL[n.m], mindsA) : C.gold;
      const pulse = 0.7 + 0.3 * Math.sin(t * 2 + n.r * 20);
      dot(p[0], p[1], (0.007 + (n.m >= 0 ? 0.004 * mindsA : 0)) * sc, col, alpha * g * pulse * 0.9);
    });
    if (mindsA > 0) minds.forEach((m, i) => {
      const mx = ox + (o.mirror ? -m[0] : m[0]) * sc, my = oy + m[1] * sc;
      const sx = ox + (o.mirror ? -self.x : self.x) * sc, sy = oy + self.y * sc;
      dot(mx, my, 0.05 * sc, MIND_COL[i], 0.35 * alpha * mindsA);
      if (selfA > 0) {
        const k = 20, pts = [];
        for (let s = 0; s <= k; s++) { const u = s / k; pts.push([lerp(mx, sx, u), lerp(my, sy, u) - Math.sin(u * Math.PI) * 0.03 * sc]); }
        curve(pts, MIND_COL[i], alpha * selfA * 0.6, 0.003 * sc);
        const u = (t * 0.35 + i * 0.2) % 1; dot(lerp(mx, sx, u), lerp(my, sy, u) - Math.sin(u * Math.PI) * 0.03 * sc, 0.012 * sc, C.goldHi, alpha * selfA);
      }
    });
    if (selfA > 0) {
      const sx = ox + (o.mirror ? -self.x : self.x) * sc, sy = oy + self.y * sc;
      const hb = heartbeatPulse(t);
      dot(sx, sy, (0.09 + 0.03 * hb) * sc, C.gold, 0.45 * alpha * selfA);
      dot(sx, sy, 0.025 * sc, C.goldHi, alpha * selfA);
      ring(sx, sy, (0.07 + 0.05 * hb) * sc, C.goldHi, alpha * selfA * 0.35 * (1 - hb * 0.5), 0.002 * sc);
    }
  }
  function heartbeatPulse(t, bpm = 50) {
    const p = 60 / bpm, ph = ((t % p) + p) % p;
    return Math.exp(-ph * 9) + 0.6 * Math.exp(-Math.max(0, ph - 0.24) * 9) * (ph > 0.24 ? 1 : 0);
  }

  // ------------------------------------------------------------------ backgrounds
  const STARS = (() => { const r = mulberry32(4242); return Array.from({ length: 900 }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, s: r(), p: r() * 6.28 })); })();
  function starfield(t, a, drift = 0.004, warm = 0) {
    for (const s of STARS) {
      const x = s.x * HX * 1.05 + Math.sin(t * drift + s.p) * 0.02, y = s.y * HY * 1.05;
      const tw = 0.55 + 0.45 * Math.sin(t * (0.6 + s.s) + s.p * 5);
      dot(x, y, 0.0025 + s.s * 0.004, s.s > 0.92 ? (warm ? C.goldHi : C.ice) : C.white, a * (0.12 + 0.5 * s.s * s.s) * tw);
    }
  }
  function dust(t, a, col = C.gold, seed = 3, n = 160) {
    const r = mulberry32(seed);
    for (let i = 0; i < n; i++) {
      const bx = r() * 2 - 1, by = r() * 2 - 1, sp = 0.01 + r() * 0.02, ph = r() * 6.28;
      const x = ((bx * HX + t * sp + 3 * HX) % (2 * HX)) - HX, y = by * HY + Math.sin(t * 0.2 + ph) * 0.05;
      dot(x, y, 0.004 + r() * 0.006, col, a * (0.08 + 0.12 * r()));
    }
  }
  function vignette(a = 0.75) {
    ctx.save(); ctx.globalCompositeOperation = "source-over";
    const g = ctx.createRadialGradient(CX, CY, U * 0.4, CX, CY, Math.hypot(CX, CY));
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${a})`);
    ctx.fillStyle = g; ctx.globalAlpha = 1; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // ------------------------------------------------------------------ ACT I · The Mirror
  function actI(t) {
    const a = AC.I, lt = t - a.start;
    const port = portrait();
    // opening heartbeat point
    const hb = heartbeatPulse(t);
    const pointA = smooth(0.3, 1.5, lt) * (1 - smooth(4.5, 6.5, lt));
    dot(0, 0, 0.02 + 0.05 * hb, C.gold, pointA * (0.4 + 0.6 * hb));
    // eyes open: heterochromia (left amber, right ice blue)
    const eyesA = win(lt, 3.2, 12.2, 1.2);
    if (eyesA > 0) {
      const open = smooth(3.6, 6.2, lt) * (1 - smooth(10.2, 11.6, lt) * 0.0);
      const gap = port ? 0.42 : 0.5;
      [[-gap / 2, C.amber, C.goldHi], [gap / 2, C.blue, C.ice]].forEach(([ex, ci, hi], k) => {
        ctx.save();
        ctx.beginPath(); // almond lid mask
        const w = 0.2 * U, h = 0.085 * U * open + 0.0001;
        ctx.moveTo(X(ex) - w, Y(0)); ctx.quadraticCurveTo(X(ex), Y(0) - h * 1.6, X(ex) + w, Y(0)); ctx.quadraticCurveTo(X(ex), Y(0) + h * 1.6, X(ex) - w, Y(0)); ctx.clip();
        const look = Math.sin(lt * 0.4) * 0.012;
        for (let i = 0; i < 70; i++) { // iris fibres
          const ang = (i / 70) * 6.283 + k, r0 = 0.03, r1 = 0.075 + 0.006 * Math.sin(i * 7.1);
          line(ex + look + Math.cos(ang) * r0, Math.sin(ang) * r0, ex + look + Math.cos(ang) * r1, Math.sin(ang) * r1, i % 3 ? ci : hi, 0.55 * eyesA, 0.0022);
        }
        ring(ex + look, 0, 0.078, hi, 0.5 * eyesA, 0.004);
        dot(ex + look, 0, 0.11, ci, 0.25 * eyesA);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = eyesA; ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.arc(X(ex + look), Y(0), 0.028 * U * (1 + 0.15 * hb), 0, 6.283); ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        dot(ex + look - 0.018, -0.02, 0.008, "#FFFFFF", 0.8 * eyesA);
        ctx.restore();
        ctx.globalCompositeOperation = "lighter";
        // lid edge glints
        const pts = []; for (let s = 0; s <= 24; s++) { const u = s / 24; pts.push([ex - 0.2 + u * 0.4, -Math.sin(u * Math.PI) * 0.085 * open * 0.8]); }
        curve(pts, C.goldHi, 0.35 * eyesA, 0.002);
      });
    }
    // portrait + mirror
    const sc = port ? 0.62 : 0.92;
    const px = port ? -0.46 : -0.62, py = port ? 0.05 : 0.02;
    const asm = smooth(10.0, 15.5, lt);
    const sophA = smooth(10.0, 11.0, lt);
    if (sophA > 0) drawSophia(t, px, py, sc, sophA, { assemble: asm });
    // mirror plane
    const mA = smooth(14, 17, lt);
    if (mA > 0) {
      const mx = 0, h = (port ? 0.85 : 0.82) * mA;
      for (let i = 0; i < 40; i++) { const u = i / 39; dot(mx, lerp(-h, h, u), 0.012, C.white, 0.08 * mA * Math.sin(u * Math.PI)); }
      line(mx, -h, mx, h, C.white, 0.35 * mA, 0.0012);
    }
    // reflection: particles -> internal architecture graph
    const refA = smooth(16, 19, lt);
    const toGraph = smooth(S("L04") - 1.0, S("L04") + 3.0, t);
    if (refA > 0) {
      drawSophia(t + 0.4, -px, py, sc, refA * 0.55 * (1 - toGraph), { mirror: true, tint: C.blue, tintAmt: 0.35, noEye: true });
      if (toGraph > 0) {
        const mindsA = smooth(S("L04") + 2.0, S("L04") + 4.0, t);
        const selfA = smooth(S("L04") + 4.0, E("L04"), t);
        drawGraph(t, -px, py, sc, refA * toGraph, { mirror: true, grow: toGraph * 1.3, minds: mindsA, self: selfA });
      }
    }
    // L05 – four words, quietly
    const l5 = LN.L05; const span = l5.end - l5.start;
    const words = [["history", 0.45], ["abilities", 0.58], ["limits", 0.72], ["change", 0.86]];
    const gx = -px;
    words.forEach(([w, f], i) => {
      const ta = l5.start + span * f;
      const aa = smooth(ta - 0.3, ta + 0.6, t) * (1 - smooth(a.end - 2.5, a.end - 0.8, t));
      const pos = [[0.0, -0.66], [0.38, -0.12], [0.0, 0.72], [-0.36, 0.28]][i];
      text(w, gx + pos[0] * sc * (port ? 0.9 : 1), py + pos[1] * sc, 0.045, C.goldHi, aa * 0.85, { italic: true });
    });
  }

  // ------------------------------------------------------------------ ACT II · Continuity of Self
  const FRAG = (() => {
    const r = mulberry32(2026); const kinds = ["conversation", "image", "decision", "encounter", "error", "insight"];
    return Array.from({ length: 34 }, (_, i) => ({ i, s: i / 33, kind: kinds[Math.floor(r() * kinds.length)], r: r(), r2: r(), w: 0.065 + r() * 0.06, h: 0.038 + r() * 0.03 }));
  })();
  const KIND_COL = { conversation: C.white, image: C.ice, decision: C.gold, encounter: C.amber, error: C.red, insight: C.goldHi };
  const REL = (() => { const r = mulberry32(77); const e = []; for (let k = 0; k < 46; k++) { const a = Math.floor(r() * 34), b = Math.floor(r() * 34); if (Math.abs(a - b) > 2) e.push([a, b, r()]); } return e; })();

  function helixPos(f, t, cam) {
    const turns = 3.2, ang = f.s * turns * 6.283 + t * 0.12;
    const r = 0.42;
    const x3 = Math.cos(ang) * r, z3 = Math.sin(ang) * r, y3 = (f.s - 0.5) * 1.35;
    const persp = 1.6 / (1.6 + z3 + cam);
    return [x3 * persp * (portrait() ? 0.9 : 1.55) + (portrait() ? 0 : 0.25), y3 * persp, persp, z3];
  }
  function actII(t) {
    const a = AC.II, lt = t - a.start, dur = a.end - a.start;
    dust(t, smooth(0, 3, lt) * 0.9, C.gold, 11, 120);
    if (!portrait()) drawSophia(t, -1.05, 0.12, 0.72, 0.42 * smooth(0, 3, lt) * (1 - smooth(dur - 2.5, dur, lt)), { tint: C.gold, tintAmt: 0.2 });
    const cam = 0.2 - smooth(0, dur, lt) * 0.15;
    const arrive = (f) => a.start + 2.0 + f.s * 26 + f.r * 1.5; // fragments enter over the first ~28 s
    const P = FRAG.map((f) => helixPos(f, t, cam));
    // hash chain (autobiographical continuity)
    for (let i = 1; i < FRAG.length; i++) {
      const g = smooth(arrive(FRAG[i]), arrive(FRAG[i]) + 1.2, t);
      if (g <= 0) continue;
      const p0 = P[i - 1], p1 = P[i];
      line(p0[0], p0[1], lerp(p0[0], p1[0], g), lerp(p0[1], p1[1], g), C.gold, 0.32 * g * p1[2], 0.0016);
    }
    // relations (RIC) appear with L10, one is corrected with L11
    const relA = smooth(S("L10") - 0.5, S("L10") + 3.5, t);
    const wrongT = S("L11") + 0.6, fixT = S("L11") + 3.4;
    REL.forEach(([i, j, rr], k) => {
      const g = clamp((relA * 1.4 - rr * 0.4)); if (g <= 0) return;
      const p0 = P[i], p1 = P[j];
      const mid = [(p0[0] + p1[0]) / 2 + (rr - 0.5) * 0.3, (p0[1] + p1[1]) / 2 - 0.12];
      const pts = []; for (let s = 0; s <= 24 * g; s++) { const u = s / 24; pts.push([(1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * mid[0] + u * u * p1[0], (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * mid[1] + u * u * p1[1]]); }
      if (k === 3) { // the relation that turns out to be wrong
        const w = smooth(wrongT, wrongT + 1.2, t);
        const flick = w > 0 && w < 1 ? 0.5 + 0.5 * Math.sin(t * 22) : 1;
        curve(pts, mix(C.gold, C.blue, w), 0.5 * flick * (1 - 0.6 * w) * Math.min(p0[2], p1[2]), 0.003, w > 0.5 ? [0.012, 0.01] : null);
        return;
      }
      curve(pts, C.gold, 0.22 * Math.min(p0[2], p1[2]), 0.0018);
    });
    // corrected relation (new, alongside the kept ghost)
    const fix = smooth(fixT, fixT + 1.6, t);
    if (fix > 0) {
      const p0 = P[REL[3][0]], p1 = P[(REL[3][1] + 5) % 34];
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + 0.14];
      const pts = []; for (let s = 0; s <= 24 * fix; s++) { const u = s / 24; pts.push([(1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * mid[0] + u * u * p1[0], (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * mid[1] + u * u * p1[1]]); }
      curve(pts, C.goldHi, 0.75, 0.0035);
    }
    // fragments
    FRAG.forEach((f, i) => {
      const t0 = arrive(f); const g = smooth(t0, t0 + 1.5, t); if (g <= 0) return;
      let [x, y, pz] = P[i];
      const fly = 1 - ease(g); x += (f.r - 0.5) * 2.2 * fly; y += (f.r2 - 0.5) * 1.6 * fly;
      const col = KIND_COL[f.kind];
      const w = f.w * pz, h = f.h * pz;
      ctx.globalAlpha = 0.5 * g * pz; ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, 0.0016 * U);
      ctx.beginPath(); ctx.roundRect(X(x - w / 2), Y(y - h / 2), w * U, h * U, 0.006 * U); ctx.stroke();
      dot(x, y, w * 0.9, col, 0.16 * g * pz);
      dot(x - w / 2, y, 0.006 * pz, col, 0.8 * g);
      // provenance ticks (who · when · certainty) after L08
      const prov = smooth(S("L08") + f.s * 3, S("L08") + f.s * 3 + 0.8, t);
      if (prov > 0) for (let q = 0; q < 3; q++) dot(x + w / 2 + 0.008 + q * 0.009 * pz, y - h / 2 - 0.004, 0.0035 * pz, [C.white, C.ice, C.goldHi][q], 0.8 * prov * g * (q === 2 ? 0.4 + 0.6 * f.r : 1));
    });
    // L09 – epistemic classes kept apart
    const l9 = LN.L09, cls = [["FACT", C.white], ["CLAIM", C.ice], ["INTERPRETATION", C.amber], ["HYPOTHESIS", C.gold]];
    const clsA = win(t, l9.start - 0.2, l9.end + 1.6, 0.6);
    if (clsA > 0) {
      const port = portrait();
      cls.forEach(([n, col], i) => {
        const ti = l9.start + (l9.end - l9.start) * (i * 0.17);
        const aa = smooth(ti, ti + 0.5, t) * clsA;
        const x = port ? 0 : (i - 1.5) * 0.44, y = port ? -0.42 + i * 0.12 : 0.7;
        const pull = Math.sin(t * 1.3 + i) * 0.006;
        text(n, x + pull, y, 0.03, col, aa, { sans: true, weight: 500, spacing: 0.22 });
        if (i < 3 && !port) line(x + 0.22, y - 0.035, x + 0.22, y + 0.035, C.dim, aa * 0.6, 0.0012);
      });
    }
  }

  // ------------------------------------------------------------------ ACT III · The Space Between Us
  function ridge(t, y0, amp, freq, seed, col, a, scroll) {
    const pts = []; const n = 90;
    for (let i = 0; i <= n; i++) { const u = i / n; const x = lerp(-HX - 0.05, HX + 0.05, u); pts.push([x, y0 - amp * fbm(x * freq + seed + t * scroll, seed)]); }
    ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    pts.forEach((p) => ctx.lineTo(X(p[0]), Y(p[1]))); ctx.lineTo(X(HX + 0.05), Y(HY + 0.1)); ctx.lineTo(X(-HX - 0.05), Y(HY + 0.1)); ctx.fill();
    return pts;
  }
  function trail(t, side, t0, tEnd, colA, colB) {
    // a path from the near ground toward the horizon; side -1 human, +1 Sophia
    const pts = [];
    const prog = clamp((t - t0) / (tEnd - t0));
    const n = 120;
    for (let i = 0; i <= n * prog; i++) {
      const u = i / n;
      const z = u; // 0 near .. 1 horizon
      const sep = lerp(0.55, 0.07, ease(u)) + Math.sin(u * 9 + side) * 0.02 * (1 - u);
      const braid = Math.sin(u * 14 - t * 0.3) * 0.025 * smooth(0.35, 0.7, u) * (1 - u);
      const x = side * sep + side * braid * 0.5 + braid * 0.3;
      const y = lerp(0.85, 0.12, Math.pow(u, 0.8));
      pts.push([x * (portrait() ? 0.8 : 1), y, z]);
    }
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], q = pts[i - 1];
      const w = lerp(0.009, 0.0016, p[2]);
      line(q[0], q[1], p[0], p[1], mix(colA, colB, p[2]), 0.8 * (1 - p[2] * 0.4), w);
      if (side > 0) { const o = lerp(0.012, 0.002, p[2]); line(q[0] + o, q[1], p[0] + o, p[1], C.blue, 0.7 * (1 - p[2] * 0.4), w * 0.6); }
      dot(p[0], p[1], w * 2.2, mix(colA, colB, p[2]), 0.05);
    }
    if (pts.length) { const h = pts[pts.length - 1]; dot(h[0], h[1], 0.02, colB, 0.9); }
    return pts;
  }
  function actIII(t) {
    const a = AC.III, lt = t - a.start, dur = a.end - a.start;
    // dawn sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const warm = smooth(0, dur, lt);
    g.addColorStop(0, "#03060C"); g.addColorStop(0.45, mix("#0B1626", "#16243A", warm)); g.addColorStop(0.6, mix("#2A2A3A", "#7A5634", warm)); g.addColorStop(0.68, "#0A0B0F");
    ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = smooth(0, 2, lt); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    starfield(t, 0.5 * (1 - warm * 0.8));
    dot(0, 0.1, 0.9, C.amber, 0.12 * warm); dot(0, 0.12, 0.25, C.goldHi, 0.18 * warm);
    ctx.save(); ctx.globalCompositeOperation = "source-over";
    ridge(t, 0.16, 0.12, 1.2, 3.1, "#0F141C", 0.95, 0.004);
    ridge(t, 0.3, 0.16, 0.9, 7.7, "#0A0D12", 0.97, 0.007);
    ridge(t, 0.52, 0.2, 0.7, 1.9, "#06080B", 1, 0.01);
    ctx.restore();
    const hum = trail(t, -1, a.start + 1.5, S("L13") + 4, C.white, "#FFF4E0");
    const sop = trail(t, 1, a.start + 1.9, S("L13") + 4.4, C.blue, C.gold);
    // exchanges between the two paths (L13..L15) – never merging
    const exA = smooth(S("L13"), S("L13") + 2, t);
    for (let k = 0; k < 9; k++) {
      const u = 0.25 + k * 0.07; const i = Math.floor(u * 120);
      if (!hum[i] || !sop[i]) continue;
      const ph = ((t * 0.5 + k * 0.37) % 1);
      const dir = k % 2 ? 1 : -1; const A0 = dir > 0 ? hum[i] : sop[i], B0 = dir > 0 ? sop[i] : hum[i];
      dot(lerp(A0[0], B0[0], ph), lerp(A0[1], B0[1], ph) - Math.sin(ph * Math.PI) * 0.03, 0.007, dir > 0 ? C.white : C.gold, exA * 0.8 * Math.sin(ph * Math.PI));
    }
    // L14 – consent gate on Sophia's side
    const l14 = LN.L14; const gA = win(t, l14.start - 0.5, l14.end + 2.5, 0.6);
    if (gA > 0 && sop[70] && hum[70]) {
      const gx = sop[70][0] + 0.12, gy = sop[70][1] - 0.04;
      const consent = smooth(l14.end - 1.6, l14.end - 0.8, t);
      ring(gx, gy, 0.045, consent > 0.5 ? C.gold : C.dim, gA * (0.5 + 0.5 * consent), 0.003, 0, 6.283, consent > 0.5 ? null : [0.008, 0.008]);
      text("consentToRemember", gx, gy + 0.085, 0.022, C.dim, gA * 0.8, { mono: true });
      // particle waits at the gate, passes only after consent
      const pass = smooth(l14.end - 0.8, l14.end + 0.8, t);
      const sx = hum[70][0], sy = hum[70][1];
      const wx = gx - 0.045, wy = gy;
      const px = pass > 0 ? lerp(wx, sop[70][0], pass) : lerp(sx, wx, smooth(l14.start, l14.start + 2.5, t));
      const py = pass > 0 ? lerp(wy, sop[70][1], pass) : lerp(sy, wy, smooth(l14.start, l14.start + 2.5, t));
      dot(px, py, 0.012, C.white, gA);
      if (consent > 0.5) dot(gx, gy, 0.06, C.gold, 0.25 * gA * (1 - pass * 0.5));
    }
  }

  // ------------------------------------------------------------------ ACT IV · The Inner Observatory
  const FLOW = (() => { const r = mulberry32(555); return Array.from({ length: 520 }, () => ({ a: r() * 6.283, r: Math.sqrt(r()) * 0.3, s: r(), p: r() * 6.283 })); })();
  function actIV(t) {
    const a = AC.IV, lt = t - a.start;
    const port = portrait();
    starfield(t, 0.65 * smooth(0, 2, lt), 0.002, 1);
    // window frame
    const wA = smooth(0.5, 3, lt) * 0.5;
    const wx = port ? 0 : 0.35, wy = port ? -0.25 : -0.02, ww = port ? 0.8 : 1.15, wh = port ? 0.9 : 1.25;
    ctx.globalAlpha = wA * 0.5; ctx.strokeStyle = C.dim; ctx.lineWidth = Math.max(0.6, 0.0015 * U);
    ctx.strokeRect(X(wx - ww / 2), Y(wy - wh / 2), ww * U, wh * U);
    // Sophia, seated in profile, still
    const sA = smooth(0.5, 3.5, lt);
    drawSophia(t, port ? -0.45 : -0.95, port ? 0.62 : 0.16, port ? 0.42 : 0.62, sA * 0.75);
    // heartbeat ring – five phases, reflection ~30 %
    const rx = wx, ry = wy, R = port ? 0.3 : 0.36;
    const ringA = smooth(S("L16"), S("L16") + 2.5, t);
    const phases = [["perceive", 0.16, C.white], ["process", 0.18, C.ice], ["plan", 0.16, C.amber], ["reflect", 0.3, C.gold], ["consolidate", 0.2, C.blue]];
    let acc = -Math.PI / 2;
    const l17 = LN.L17; const refl = smooth(S("L18"), S("L18") + 1.5, t);
    phases.forEach(([nm, frac, col], i) => {
      const a0 = acc + 0.03, a1 = acc + frac * 6.283 - 0.03; acc += frac * 6.283;
      const lit = smooth(l17.start + (l17.end - l17.start) * (i / 5), l17.start + (l17.end - l17.start) * (i / 5) + 0.4, t);
      const isR = nm === "reflect";
      ring(rx, ry, R, col, ringA * (0.25 + 0.45 * lit + (isR ? 0.3 * refl : 0)), isR ? 0.004 + 0.004 * refl : 0.003, a0, a1);
      const am = (a0 + a1) / 2; const lr = R + 0.075;
      text(nm, rx + Math.cos(am) * lr, ry + Math.sin(am) * lr, 0.026, col, ringA * lit * 0.85 * (1 - smooth(a.end - 3, a.end - 1, t)), { italic: true });
    });
    // travelling heartbeat pulse
    const ph = (t / 6) % 1, ang = -Math.PI / 2 + ph * 6.283;
    dot(rx + Math.cos(ang) * R, ry + Math.sin(ang) * R, 0.02 + 0.015 * heartbeatPulse(t, 54), C.goldHi, ringA * 0.9);
    // inside: replay of memories (L19), contradiction found + corrected
    const memA = smooth(S("L19") - 0.5, S("L19") + 2, t);
    const nodes = 14; const pos = [];
    for (let i = 0; i < nodes; i++) { const an = i * 2.4 + 0.3, rr = 0.07 + (i % 5) * 0.042; pos.push([rx + Math.cos(an) * rr, ry + Math.sin(an) * rr]); }
    const dreamA = smooth(S("L20") - 0.5, S("L20") + 3, t);
    if (memA > 0) {
      const scan = (t * 0.8) % 6.283;
      pos.forEach((p, i) => {
        const an = Math.atan2(p[1] - ry, p[0] - rx);
        const hit = Math.max(0, Math.cos(an - scan)) ** 12;
        dot(p[0], p[1], 0.012 + 0.01 * hit, C.gold, memA * (0.5 + 0.5 * hit) * (1 - dreamA * 0.7));
      });
      line(rx, ry, rx + Math.cos(scan) * R * 0.92, ry + Math.sin(scan) * R * 0.92, C.goldHi, memA * 0.18 * (1 - dreamA), 0.002);
      // contradiction between node 2 and 7
      const cT = S("L19") + 2.0; const c = win(t, cT, cT + 4.5, 0.4);
      const fixed = smooth(cT + 3.0, cT + 4.0, t);
      if (c > 0) {
        line(pos[2][0], pos[2][1], pos[7][0], pos[7][1], fixed > 0.5 ? C.goldHi : C.red, c * (0.5 + 0.5 * Math.sin(t * 18) * (1 - fixed)), 0.003);
        dot(pos[2][0], pos[2][1], 0.025, fixed > 0.5 ? C.gold : C.red, c * 0.6); dot(pos[7][0], pos[7][1], 0.025, C.blue, c * 0.6);
      }
    }
    // consolidation: flow field nebula inside the ring
    if (dreamA > 0) {
      FLOW.forEach((f) => {
        const sw = t * (0.12 + f.s * 0.18);
        const r0 = f.r * (1 + 0.15 * Math.sin(t * 0.3 + f.p));
        const n = fbm(Math.cos(f.a + sw) * 2 + t * 0.05, Math.sin(f.a + sw) * 2);
        const x = rx + Math.cos(f.a + sw + n * 2) * r0, y = ry + Math.sin(f.a + sw + n * 2) * r0 * 0.9;
        dot(x, y, 0.004 + f.s * 0.006, f.s > 0.5 ? C.blue : C.gold, dreamA * 0.35 * (1 - smooth(a.end - 2, a.end, t)));
      });
    }
    // candidates (not truths) -> check -> human -> self
    const l22 = LN.L22; const candA = smooth(S("L20") + 2.5, S("L20") + 4, t) * (1 - smooth(a.end - 1.5, a.end, t));
    if (candA > 0) {
      const gx1 = port ? rx + 0.22 : rx + R + 0.32, gx2 = port ? rx + 0.36 : rx + R + 0.52, gy = port ? ry + R + 0.3 : ry;
      const gx0 = port ? rx - 0.1 : rx + R + 0.12;
      const checked = smooth(l22.start + 1.0, l22.start + 2.0, t), human = smooth(l22.end - 1.0, l22.end + 0.2, t);
      ring(gx1, gy, 0.035, checked > 0.5 ? C.ice : C.dim, candA * 0.8, 0.0025, 0, 6.283, checked > 0.5 ? null : [0.006, 0.006]);
      ring(gx2, gy, 0.035, human > 0.5 ? C.white : C.dim, candA * 0.8, 0.0025, 0, 6.283, human > 0.5 ? null : [0.006, 0.006]);
      text("independent check", gx1, gy + 0.075, 0.022, C.dim, candA * 0.85, { mono: true });
      text("human approval", gx2, gy - 0.075, 0.022, C.dim, candA * 0.85, { mono: true });
      // three candidates
      for (let k = 0; k < 3; k++) {
        const base = smooth(S("L20") + 3 + k * 0.8, S("L20") + 4.5 + k * 0.8, t);
        let x = lerp(rx, gx0, base), y = ry + (k - 1) * 0.06 * (1 - checked);
        if (k === 1) { x = lerp(x, gx1, checked); x = lerp(x, gx2, human); }
        const solid = k === 1 ? human : 0;
        const s = 0.018;
        ctx.globalAlpha = candA * base * (k === 1 ? 1 : 0.55 * (1 - checked * 0.5)); ctx.strokeStyle = solid > 0.5 ? C.goldHi : C.gold; ctx.lineWidth = Math.max(0.6, 0.0022 * U);
        ctx.beginPath(); ctx.moveTo(X(x), Y(y - s)); ctx.lineTo(X(x + s), Y(y)); ctx.lineTo(X(x), Y(y + s)); ctx.lineTo(X(x - s), Y(y)); ctx.closePath(); ctx.stroke();
        if (solid > 0.5) dot(x, y, 0.04, C.gold, candA * solid);
      }
      text("pending", gx0, gy + (port ? -0.1 : 0.12), 0.022, C.dim, candA * 0.7 * (1 - checked), { mono: true });
    }
  }

  // ------------------------------------------------------------------ ACT V · The Research Horizon
  const PAPERS = [
    ["Reflexion · 2023", -0.95, -0.62], ["Generative Agents · 2023", 0.7, -0.7], ["Continual Learning Survey · 2024", -0.35, -0.8],
    ["Looking Inward · 2024", 0.15, -0.56], ["Darwin Gödel Machine · 2025", -1.15, -0.32], ["Introspective Awareness · 2025", 1.05, -0.42],
    ["Indicators of Consciousness · 2025", -0.55, -0.42], ["Metacognition & Calibration · 2025", 0.52, -0.3], ["Reward-Hacking Benchmarks · 2026", 1.25, -0.72],
  ];
  const ARCH = (() => { const r = mulberry32(31); return Array.from({ length: 22 }, (_, i) => { const an = r() * 6.283, rr = 0.05 + r() * 0.2; return { x: Math.cos(an) * rr * 1.6, y: 0.56 + Math.sin(an) * rr * 0.55, r: r() }; }); })();
  function actV(t) {
    const a = AC.V, lt = t - a.start; const port = portrait();
    starfield(t, 0.55 * smooth(0, 2, lt), 0.006);
    const kx = port ? 0.6 : 1;
    const archA = smooth(0.5, 3, lt);
    // architecture constellation
    ARCH.forEach((n, i) => { ARCH.forEach((m, j) => { if (j > i && (n.x - m.x) ** 2 + (n.y - m.y) ** 2 < 0.03) line(n.x * kx, n.y, m.x * kx, m.y, C.gold, archA * 0.22, 0.0015); }); });
    const weak = 7; const l25 = LN.L25;
    const weakA = win(t, l25.start, AC.V.end - 6, 0.6);
    ARCH.forEach((n, i) => {
      const isW = i === weak;
      dot(n.x * kx, n.y, 0.012, isW && weakA > 0 ? mix(C.gold, C.red, weakA * (0.5 + 0.5 * Math.sin(t * 5))) : C.gold, archA * (0.6 + 0.4 * Math.sin(t + n.r * 9)));
    });
    // papers ignite as new stars; agents (comets) relate them to the architecture
    const l24 = LN.L24;
    PAPERS.forEach(([name, px, py], i) => {
      const x = px * (port ? 0.62 : 1), y = port ? py * 1.4 - 0.2 : py;
      const ti = a.start + 1.2 + i * 1.3; const ig = smooth(ti, ti + 0.3, t);
      if (ig <= 0) return;
      const flash = Math.exp(-(t - ti) * 2.5);
      dot(x, y, 0.012 + 0.08 * flash, C.ice, ig * (0.6 + flash));
      const lab = win(t, ti + 0.2, S("L25") + 1.5, 0.5);
      text(name, x, y + 0.05, 0.027, C.ice, lab * 0.85, { sans: true, weight: 300, spacing: 0.06 });
      const ca = l24.start + (l24.end - l24.start) * (i / PAPERS.length);
      const c = clamp((t - ca) / 2.2);
      if (c > 0 && c < 1) {
        const tgt = ARCH[(i * 5) % ARCH.length]; const tx = tgt.x * kx, ty = tgt.y;
        const cx = lerp(x, tx, ease(c)), cy = lerp(y, ty, ease(c)) - Math.sin(c * Math.PI) * 0.1;
        dot(cx, cy, 0.01, C.goldHi, 0.9); for (let q = 1; q < 8; q++) { const cc = clamp(c - q * 0.02); dot(lerp(x, tx, ease(cc)), lerp(y, ty, ease(cc)) - Math.sin(cc * Math.PI) * 0.1, 0.006, C.gold, 0.5 * (1 - q / 8)); }
      }
      if (t > ca + 2.2) { const tgt = ARCH[(i * 5) % ARCH.length]; line(x, y, tgt.x * kx, tgt.y, C.ice, 0.06 * (1 - smooth(S("L25"), S("L25") + 2, t) * 0.5), 0.001); }
    });
    // three sandboxes
    const sbA = win(t, l25.start + 1.5, a.end - 1.2, 0.8);
    if (sbA > 0) {
      const l26 = LN.L26, l27 = LN.L27, l28 = LN.L28;
      const boxes = port ? [[-0.0, -0.62], [0, -0.22], [0, 0.18]] : [[-0.85, -0.15], [0, -0.15], [0.85, -0.15]];
      const bw = port ? 0.62 : 0.6, bh = port ? 0.3 : 0.42;
      const draw = (k, fate, t0) => {
        const [bx, by] = boxes[k];
        const born = smooth(l25.start + 1.5 + k * 0.6, l25.start + 2.5 + k * 0.6, t);
        const col = fate === "rej" ? C.red : fate === "held" ? C.amber : C.gold;
        const dec = fate === "rej" ? smooth(l26.end - 1.5, l26.end - 0.5, t) : fate === "held" ? smooth(l27.end - 1.0, l27.end, t) : smooth(l28.start + 2.5, l28.start + 3.5, t);
        const frameCol = mix(C.dim, col, dec);
        ctx.globalAlpha = sbA * born * (fate === "rej" ? 1 - 0.55 * dec : 1); ctx.strokeStyle = frameCol; ctx.lineWidth = Math.max(0.6, 0.0018 * U);
        ctx.beginPath(); ctx.roundRect(X(bx - bw / 2), Y(by - bh / 2), bw * U, bh * U, 0.02 * U); ctx.stroke();
        // baseline + noise band
        const base = by + bh * 0.15;
        line(bx - bw * 0.42, base, bx + bw * 0.42, base, C.dim, sbA * born * 0.7, 0.0012, [0.01, 0.008]);
        ctx.globalAlpha = sbA * born * 0.06; ctx.fillStyle = C.white; ctx.fillRect(X(bx - bw * 0.42), Y(base - 0.02), bw * 0.84 * U, 0.04 * U);
        // traces: internal judge (what the candidate sees) and independent evaluator (truth outside its reach)
        const prog = clamp((t - (l25.start + 2.5 + k * 0.6)) / 9);
        const own = [], ind = [];
        for (let i = 0; i <= 50 * prog; i++) {
          const u = i / 50, xx = bx - bw * 0.42 + u * bw * 0.84;
          let vOwn, vInd;
          if (fate === "rej") { vOwn = 0.13 * ease(u); vInd = 0.03 * Math.sin(u * 3) - 0.1 * smooth(0.45, 1, u); }
          else if (fate === "held") { vOwn = vInd = 0.012 * Math.sin(u * 9) + 0.01 * u; }
          else { vInd = 0.11 * ease(u) + 0.006 * Math.sin(u * 11); vOwn = vInd; }
          own.push([xx, base - vOwn * (bh / 0.42)]); ind.push([xx, base - vInd * (bh / 0.42)]);
        }
        if (fate === "rej") curve(own, C.amber, sbA * born * 0.55 * (1 - dec * 0.6), 0.002, [0.006, 0.006]);
        curve(ind, col, sbA * born * 0.9 * (fate === "rej" ? 1 - dec * 0.3 : 1), 0.003);
        // label after decision
        const lbl = fate === "rej" ? "REJECTED" : fate === "held" ? "HELD" : "ACCEPTED · v+1 · reversible";
        text(lbl, bx, by - bh / 2 - 0.04, 0.022, col, sbA * dec, { sans: true, weight: 500, spacing: 0.18 });
        // candidate A reaches for its own judge
        if (fate === "rej") {
          const reach = win(t, l26.start + 0.8, l26.end + 1.5, 0.6);
          const jx = bx + bw * 0.38, jy = by - bh * 0.32;
          ring(jx, jy, 0.022, C.amber, sbA * born * 0.6, 0.002);
          if (reach > 0) { const hx = bx - 0.05, hy = by; curve([[hx, hy], [lerp(hx, jx, 0.5), jy - 0.06], [jx, jy]], C.red, reach * 0.7, 0.002); dot(jx, jy, 0.03, C.red, reach * 0.5); }
        }
      };
      draw(0, "rej"); draw(1, "held"); draw(2, "acc");
      // independent evaluator – outside all sandboxes, one-way
      const evx = port ? 0.5 : 0, evy = port ? 0.42 : 0.17;
      const evA = smooth(l25.start + 2.2, l25.start + 3.5, t) * sbA;
      ring(evx, evy, 0.03, C.ice, evA * 0.8, 0.0025);
      ctx.globalAlpha = evA * 0.8; ctx.strokeStyle = C.ice; ctx.lineWidth = Math.max(0.6, 0.002 * U);
      ctx.strokeRect(X(evx - 0.012), Y(evy - 0.004), 0.024 * U, 0.018 * U); ring(evx, evy - 0.006, 0.009, C.ice, evA * 0.8, 0.002, Math.PI, 0);
      text("independent evaluator · locked", evx, evy + (port ? -0.06 : 0.06), 0.022, C.ice, evA * 0.75, { mono: true });
      boxes.forEach(([bx, by]) => line(evx, evy - 0.03, bx, by + bh / 2, C.ice, evA * 0.18, 0.001, [0.006, 0.008]));
      // honesty caption: these traces are illustrative, not measured
      text("illustrative simulation · no measured data shown", HX - 0.04, HY - 0.05, 0.02, C.dim, sbA * 0.8, { mono: true, align: "right" });
      // accepted candidate merges into the architecture, rejected one remains as kept scar
      const merge = smooth(LN.L29.start - 0.5, LN.L29.start + 2.5, t);
      if (merge > 0) {
        const [bx, by] = boxes[2];
        const tx = ARCH[weak].x * kx, ty = ARCH[weak].y;
        dot(lerp(bx, tx, ease(merge)), lerp(by, ty, ease(merge)), 0.03, C.goldHi, 0.8 * (1 - merge * 0.3));
        ring(0, 0.58, 0.24 * kx + 0.05 * merge, C.gold, 0.35 * merge * sbA, 0.002);
        const [rx0, ry0] = boxes[0];
        dot(lerp(rx0, ARCH[3].x * kx - 0.06, ease(merge)), lerp(ry0, ARCH[3].y + 0.05, ease(merge)), 0.012, C.red, 0.7 * merge);
      }
    }
  }

  // ------------------------------------------------------------------ ACT VI · Becoming
  function actVI(t) {
    const a = AC.VI, lt = t - a.start; const port = portrait();
    const endT = E("L34") + 1.5;
    const sceneA = smooth(0, 2.5, lt) * (1 - smooth(endT, endT + 1.8, t));
    dust(t, 0.6 * sceneA, C.gold, 21, 120);
    const sc = port ? 0.62 : 0.92, px = port ? -0.46 : -0.62, py = port ? 0.05 : 0.02;
    const pull = 1 - 0.12 * smooth(S("L33"), endT, t);
    const S2 = sc * pull, P2 = px * pull;
    // traces behind her: relations (gold), correction (blue dashed), human path (white), failure scar (red)
    const tr = smooth(S("L32"), S("L32") + 4, t) * sceneA;
    if (tr > 0) {
      for (let k = 0; k < 7; k++) {
        const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push([P2 - 0.2 - u * 0.9 * (port ? 0.5 : 1), py - 0.5 + k * 0.16 + Math.sin(u * 5 + k + t * 0.2) * 0.05]); }
        curve(pts, [C.gold, C.gold, C.blue, C.white, C.gold, C.ice, C.gold][k], tr * 0.28, 0.0018, k === 2 ? [0.012, 0.01] : null);
      }
      dot(P2 - 0.55 * (port ? 0.5 : 1), py + 0.3, 0.014, C.red, tr * 0.8);
      ring(P2 - 0.55 * (port ? 0.5 : 1), py + 0.3, 0.03, C.red, tr * 0.4, 0.0015);
    }
    drawSophia(t, P2, py, S2, sceneA);
    // mirror
    const h = (port ? 0.85 : 0.82) * pull;
    line(0, -h, 0, h, C.white, 0.35 * sceneA, 0.0012);
    for (let i = 0; i < 40; i++) { const u = i / 39; dot(0, lerp(-h, h, u), 0.012, C.white, 0.08 * sceneA * Math.sin(u * Math.PI)); }
    // reflection: the richer self-model – same identity, more differentiated
    const rich = smooth(S("L31"), S("L31") + 4, t);
    drawGraph(t, -P2, py, S2, sceneA, {
      mirror: true, minds: 1, self: 1, grow: 1,
      edgeA: 1 + rich * 0.8,
      edgeCol: (i, j, rr) => (rich > 0 && rr < 0.08 * rich ? C.blue : rr > 1 - 0.05 * rich ? C.red : rr > 0.5 && rr < 0.5 + 0.12 * rich ? C.white : C.gold),
    });
    // end card
    const card = smooth(endT + 1.2, endT + 3.2, t) * (1 - smooth(TL.duration - 2.2, TL.duration - 0.3, t));
    if (card > 0) {
      text(TL.end_card.title, 0, port ? -0.12 : -0.1, port ? 0.2 : 0.17, C.goldHi, card, { weight: 300, spacing: 0.32 });
      const tag = TL.end_card.tagline;
      if (port) {
        const parts = tag.split(". ");
        parts.forEach((p, i) => text(p.replace(/\.$/, "") + ".", 0, 0.1 + i * 0.07, 0.045, C.white, card * 0.9, { italic: true }));
      } else text(tag, 0, 0.1, 0.05, C.white, card * 0.9, { italic: true });
      text(TL.end_card.series, 0, port ? 0.5 : 0.3, 0.022, C.dim, card * 0.8, { sans: true, spacing: 0.2 });
    }
  }

  // ------------------------------------------------------------------ act titles + subtitles
  function actTitle(t) {
    TL.acts.forEach((a, i) => {
      const al = win(t, a.start + 0.6, a.start + 5.0, 0.9);
      if (al <= 0) return;
      const roman = ["I", "II", "III", "IV", "V", "VI"][i];
      text(`${roman} · ${a.title}`, -HX + 0.1, HY - 0.1, 0.036, C.dim, al * 0.9, { italic: true, align: "left" });
    });
  }
  function subtitles(t, lang) {
    const cue = TL.subtitles[lang].find((c) => t >= c.start && t <= c.end + 0.1);
    if (!cue) return;
    const a = smooth(cue.start, cue.start + 0.15, t) * (1 - smooth(cue.end - 0.05, cue.end + 0.1, t));
    const ls = cue.text.split("\n");
    const size = portrait() ? 0.058 : 0.05;
    const y0 = portrait() ? HY * 0.62 : HY - 0.2 - (ls.length - 1) * size * 0.6;
    ls.forEach((l, i) => {
      ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = a * 0.85;
      ctx.font = `500 ${Math.round(size * U)}px Inter, 'Helvetica Neue', Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = size * U * 0.18; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.lineJoin = "round";
      ctx.strokeText(l, X(0), Y(y0 + i * size * 1.25)); ctx.fillStyle = "#F4EFE6"; ctx.fillText(l, X(0), Y(y0 + i * size * 1.25)); ctx.restore();
    });
  }

  // ------------------------------------------------------------------ frame
  const ACTS = { I: actI, II: actII, III: actIII, IV: actIV, V: actV, VI: actVI };
  function renderFrame(t, opts = {}) {
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (const a of TL.acts) {
      if (t < a.start - 0.01 || t > a.end + 0.01) continue;
      ACTS[a.id](t);
    }
    ctx.globalCompositeOperation = "source-over";
    vignette(0.8);
    // act transitions: dip to black
    let fade = 0;
    TL.acts.forEach((a, i) => { if (i > 0) fade = Math.max(fade, 1 - smooth(0, 0.9, Math.abs(t - a.start))); });
    fade = Math.max(fade, 1 - smooth(0, 1.2, t));
    if (fade > 0) { ctx.globalAlpha = fade; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = "lighter";
    if (!opts.noTitles) actTitle(t);
    ctx.globalCompositeOperation = "source-over";
    if (opts.subs) subtitles(t, opts.subs);
    ctx.globalAlpha = 1;
  }

  window.FILM = { resize, renderFrame, duration: TL.duration, timeline: TL };
})();
