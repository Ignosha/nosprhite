/*
 * The village: a 2.5D isometric pixel world, drawn at 320 x 224 and scaled
 * up with hard pixel edges, like an old handheld game. There are no image
 * files: tiles, buildings and villagers are drawn from small character maps
 * and filled polygons with no anti-aliasing.
 *
 * Everything on screen comes from the agent. A villager walks the paths to
 * the building for its job, plays that building's work animation, says the
 * current step in a bubble, jumps when it delivers to your inbox, and lies
 * down to sleep when the agent is off. The quest log in the corner shows
 * what each one is doing.
 */

/* ── the map ─────────────────────────────────────────────────────────── */

const W = 320;
const H = 224;
const TW = 16; // tile width in pixels
const TH = 8; // tile height in pixels
const COLS = 20;
const ROWS = 16;
const OX = 168;
const OY = 50;
const CLIFF = 16;

/** Grid to screen, with height z lifting a point straight up. */
function iso(gx: number, gy: number, z = 0): [number, number] {
  return [OX + ((gx - gy) * TW) / 2, OY + ((gx + gy) * TH) / 2 - z];
}

type Roof = "pyramid" | "spire" | "awning";
type Building = {
  key: string;
  label: string;
  bx: number;
  by: number;
  w: number;
  d: number;
  h: number;
  wall: string;
  wallDark: string;
  roof: string;
  roofType: Roof;
  icon: keyof typeof ICONS;
  chimney?: boolean;
};

export const BUILDINGS: Building[] = [
  { key: "board", label: "Workload board", bx: 2, by: 2, w: 3, d: 2, h: 11, wall: "#f4e4c1", wallDark: "#d9c49a", roof: "#4f7ed8", roofType: "pyramid", icon: "board" },
  { key: "lab", label: "Idea lab", bx: 8, by: 1, w: 3, d: 3, h: 12, wall: "#e8f1e4", wallDark: "#c3d6bd", roof: "#55b86a", roofType: "pyramid", icon: "bulb", chimney: true },
  { key: "market", label: "Market", bx: 14, by: 2, w: 3, d: 2, h: 6, wall: "#c9915d", wallDark: "#a8744a", roof: "#f2c94c", roofType: "awning", icon: "coin" },
  { key: "library", label: "Library", bx: 2, by: 8, w: 3, d: 3, h: 13, wall: "#efe0d0", wallDark: "#cdb8a4", roof: "#d9534f", roofType: "pyramid", icon: "book" },
  { key: "tower", label: "Critic's tower", bx: 9, by: 7, w: 2, d: 2, h: 24, wall: "#d8d2e8", wallDark: "#b2a9cc", roof: "#7b5cc4", roofType: "spire", icon: "glass" },
  { key: "workshop", label: "Workshop", bx: 15, by: 8, w: 3, d: 2, h: 10, wall: "#e9d6bf", wallDark: "#c7ae91", roof: "#e8913a", roofType: "pyramid", icon: "hammer", chimney: true },
  { key: "inbox", label: "Your inbox", bx: 7, by: 12, w: 2, d: 2, h: 9, wall: "#e6e6ea", wallDark: "#c2c2cc", roof: "#5a6170", roofType: "pyramid", icon: "letter" },
  { key: "home", label: "Houses", bx: 12, by: 12, w: 4, d: 2, h: 9, wall: "#f6e7cf", wallDark: "#d8c3a2", roof: "#c94f4b", roofType: "pyramid", icon: "heart", chimney: true },
];

const BY_KEY = new Map(BUILDINGS.map((b) => [b.key, b]));

/** The tile in front of each building's door, where its villager stands. */
export function doorTile(b: Building): [number, number] {
  return [b.bx + Math.floor(b.w / 2), b.by + b.d];
}

const TREES: Array<[number, number]> = [[0, 0], [6, 0], [12, 0], [19, 0], [0, 6], [19, 6], [0, 13], [5, 15], [11, 5], [18, 12], [6, 9], [13, 6]];
const WATER = (gx: number, gy: number) => gx >= 17 && gy >= 13;

/** Walkable unless a building, a tree, water, or off the island. */
export function walkable(gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return false;
  if (WATER(gx, gy)) return false;
  if (TREES.some(([x, y]) => x === gx && y === gy)) return false;
  return !BUILDINGS.some((b) => gx >= b.bx && gx < b.bx + b.w && gy >= b.by && gy < b.by + b.d);
}

/** Shortest walk on the grid (breadth-first, four directions). Pure, so it can be tested. */
export function findPath(from: [number, number], to: [number, number]): Array<[number, number]> {
  const key = (x: number, y: number) => y * COLS + x;
  const prev = new Map<number, number>();
  const start = key(from[0], from[1]);
  const goal = key(to[0], to[1]);
  const queue = [start];
  prev.set(start, -1);
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === goal) break;
    const cx = cur % COLS;
    const cy = Math.floor(cur / COLS);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = key(nx, ny);
      if (prev.has(k) || (!walkable(nx, ny) && k !== goal)) continue;
      prev.set(k, cur);
      queue.push(k);
    }
  }
  if (!prev.has(goal)) return [to];
  const path: Array<[number, number]> = [];
  for (let k = goal; k !== start && k !== -1; k = prev.get(k)!) path.unshift([k % COLS, Math.floor(k / COLS)]);
  return path;
}

/** Paths drawn on the ground: from every door to the crossroads. */
const PATH_TILES = (() => {
  const set = new Set<number>();
  const hub: [number, number] = [11, 11];
  for (const b of BUILDINGS) for (const [x, y] of findPath(doorTile(b), hub)) set.add(y * COLS + x);
  for (const b of BUILDINGS) set.add(doorTile(b)[1] * COLS + doorTile(b)[0]);
  return set;
})();

/* ── pixel art ───────────────────────────────────────────────────────── */

const PAL: Record<string, string> = {
  O: "#2b2238", S: "#f7d1ae", E: "#2b2238", P: "#f3a0b4", B: "#4a4e69", K: "#3b2f2f",
  L: "#a8e6a1", G: "#5fbf6a", D: "#3c8a4c", W: "#ffffff", Y: "#ffd84a", R: "#e0564f",
  N: "#8a5a3b", A: "#9aa3b5", M: "#5a6170",
};

const HEAD = ["....LL....", "...LGGL...", "....DD....", "..OOOOOO..", ".OSSSSSSO."];
const FACE_FRONT = [".OSESSESO.", ".OSPSSPSO.", "..OSSSSO.."];
const FACE_BACK = [".OSSSSSSO.", ".OSSSSSSO.", "..OSSSSO.."];
const FACE_SIDE = [".OSSSSESO.", ".OSSSSPSO.", "..OSSSSO.."];
const BODY = ["..OCCCCO..", ".OSCCCCSO.", "..OCccCO..", "..OBBBBO.."];
const BODY_SIDE = ["..OCCCCO..", "..OCCSCO..", "..OCcSCO..", "..OBBBBO.."];
const ARMS_UP = ["S.OCCCCO.S", "SOCCCCCCOS", "..OCccCO..", "..OBBBBO.."];
const LEGS = {
  stand: ["..OB..BO..", "..OK..KO.."],
  stepA: ["..OB...BO.", "..OK...KO."],
  stepB: [".OB...BO..", ".OK...KO.."],
};

type Facing = "down" | "up" | "right" | "left";

export function frame(facing: Facing, legs: keyof typeof LEGS, armsUp = false): string[] {
  const face = facing === "down" ? FACE_FRONT : facing === "up" ? FACE_BACK : FACE_SIDE;
  const body = armsUp ? ARMS_UP : facing === "down" || facing === "up" ? BODY : BODY_SIDE;
  return [...HEAD, ...face, ...body, ...LEGS[legs]];
}

const SLEEPER = [
  ".OOOO..........",
  "OSSSSOCCCCCCCCO",
  "OOSOSOCCCCCCCCC",
  "OSSSSOCcccccccO",
  ".OOOOOOOOOOOOO.",
];

const ICONS = {
  board: ["NNNNNNN", "NMMMMMN", "NMWMWMN", "NMMWMMN", "NMWMMMN", "NNNNNNN", ".N...N."],
  bulb: ["..YYY..", ".YYWYY.", ".YYYYY.", ".YYYYY.", "..YYY..", "..AAA..", "..AAA.."],
  coin: ["..YYY..", ".YNNNY.", "YYNYYYY", "YYYNYYY", "YYYYNYY", ".YNNNY.", "..YYY.."],
  book: ["RRRRRRR", "RWWRWWR", "RWWRWWR", "RWWRWWR", "RWWRWWR", "RRRRRRR", "......."],
  glass: ["..AAA..", ".AWWWA.", ".AWWWA.", ".AWWWA.", "..AAA..", "....NN.", ".....NN"],
  hammer: ["AAAAA..", "AAAAA..", "..NN...", "..NN...", "..NN...", "..NN...", "......."],
  letter: ["WWWWWWW", "WMWWWMW", "WWMWMWW", "WWWMWWW", "WWWWWWW", ".......", "......."],
  heart: [".RR.RR.", "RRRRRRR", "RRRRRRR", ".RRRRR.", "..RRR..", "...R...", "......."],
  zz: ["OOOO", "..O.", ".O..", "OOOO"],
};

/* ── drawing helpers (no anti-aliasing anywhere) ─────────────────────── */

type Ctx = CanvasRenderingContext2D;

function fillPoly(c: Ctx, pts: Array<[number, number]>, colour: string) {
  c.fillStyle = colour;
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y < y1; y++) {
    const sy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.round(xs[k]);
      const xb = Math.round(xs[k + 1]);
      if (xb > xa) c.fillRect(xa, y, xb - xa, 1);
    }
  }
}

function sprite(c: Ctx, art: string[], x: number, y: number, swap: Record<string, string> = {}, flip = false) {
  const w = art[0].length;
  for (let j = 0; j < art.length; j++) {
    for (let i = 0; i < w; i++) {
      const ch = art[j][flip ? w - 1 - i : i];
      const colour = swap[ch] ?? PAL[ch];
      if (!colour || ch === ".") continue;
      c.fillStyle = colour;
      c.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
    }
  }
}

function blob(c: Ctx, cx: number, cy: number, r: number, colour: string) {
  c.fillStyle = colour;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    c.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1);
  }
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** A parallelogram on a building face: u along the face (0..1), z up the wall. */
function onFace(c: Ctx, a: [number, number], b: [number, number], u0: number, u1: number, z0: number, z1: number, colour: string) {
  const at = (u: number, z: number): [number, number] => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - z];
  fillPoly(c, [at(u0, z0), at(u1, z0), at(u1, z1), at(u0, z1)], colour);
}

/* ── villagers ───────────────────────────────────────────────────────── */

export const VILLAGERS = [
  { name: "Pip", colour: "#4f7ed8", home: "board" },
  { name: "Fern", colour: "#55b86a", home: "lab" },
  { name: "Coin", colour: "#e5b33a", home: "market" },
  { name: "Bolt", colour: "#e8913a", home: "workshop" },
  { name: "Owl", colour: "#7b5cc4", home: "tower" },
];

type Mode = "idle" | "walk" | "work" | "sleep" | "cheer";

type Villager = {
  name: string;
  colour: string;
  homeKey: string;
  gx: number;
  gy: number;
  path: Array<[number, number]>;
  at: string;
  mode: Mode;
  arrive: Mode;
  facing: Facing;
  say: string;
  sayUntil: number;
  task: string;
  cheerUntil: number;
  phase: number;
};

/** Moves a point toward a target by at most `speed`. Pure, so it can be tested. */
export function step(v: { x: number; y: number }, target: { x: number; y: number }, speed: number): { x: number; y: number; arrived: boolean } {
  const dx = target.x - v.x;
  const dy = target.y - v.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= speed) return { x: target.x, y: target.y, arrived: true };
  return { x: v.x + (dx / dist) * speed, y: v.y + (dy / dist) * speed, arrived: false };
}

const SLEEP_SPOTS: Array<[number, number]> = [[10, 15], [12, 15], [14, 15], [16, 15], [8, 15]];

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; colour: string; kind: "dot" | "zz" | "smoke" | "star" };

/* ── the world ───────────────────────────────────────────────────────── */

export class World {
  private off: HTMLCanvasElement;
  private o: Ctx;
  private ground: HTMLCanvasElement;
  private ctx: Ctx;
  private scale = 3;
  private villagers: Villager[];
  private particles: Particle[] = [];
  private awake = false;
  private toast: { text: string; until: number } | null = null;
  private last = performance.now();
  private t = 0;
  private butterflies = [0, 1, 2].map((i) => ({ gx: 4 + i * 5, gy: 6 + (i % 2) * 5, seed: i * 7 }));

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.off = document.createElement("canvas");
    this.off.width = W;
    this.off.height = H;
    this.o = this.off.getContext("2d")!;
    this.ground = this.bakeGround();
    this.villagers = VILLAGERS.map((v, i) => ({
      name: v.name,
      colour: v.colour,
      homeKey: v.home,
      gx: SLEEP_SPOTS[i][0],
      gy: SLEEP_SPOTS[i][1],
      path: [],
      at: "home",
      mode: "sleep",
      arrive: "sleep",
      facing: "down",
      say: "",
      sayUntil: 0,
      task: "Asleep",
      cheerUntil: 0,
      phase: i * 1.3,
    }));
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      this.scale = Math.max(2, Math.floor((canvas.clientWidth * dpr) / W));
      canvas.width = W * this.scale;
      canvas.height = H * this.scale;
      this.ctx.imageSmoothingEnabled = false;
    };
    resize();
    new ResizeObserver(resize).observe(canvas);
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      this.update(dt, now);
      this.draw(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ── what the agent tells the world ─────────────────────────────── */

  setAwake(awake: boolean) {
    this.awake = awake;
    this.villagers.forEach((v, i) => {
      if (awake) {
        this.walkTo(v, v.homeKey, "idle");
        this.speak(v, "Morning!", 4000);
        v.task = `Heading to the ${BY_KEY.get(v.homeKey)!.label.toLowerCase()}`;
      } else {
        this.walkToTile(v, SLEEP_SPOTS[i], "sleep");
        v.say = "";
        v.task = "Going to bed";
      }
    });
  }

  event(name: string, building: string, say: string) {
    const v = this.villagers.find((x) => x.name === name);
    if (!v) return;
    if (building === "home") {
      if (!this.awake) return;
      this.walkTo(v, v.homeKey, "idle");
      this.speak(v, say, 8000);
      v.task = say;
      return;
    }
    const delivered = building === "inbox" && /^done/i.test(say);
    this.walkTo(v, building, delivered ? "cheer" : "work");
    this.speak(v, say, 12000);
    v.task = `${say.replace(/…$/, "")} · ${BY_KEY.get(building)?.label ?? building}`;
    if (delivered) this.toast = { text: `★ ${v.name} finished a job. Check your inbox!`, until: performance.now() + 6000 };
  }

  private speak(v: Villager, text: string, ms: number) {
    v.say = text;
    v.sayUntil = performance.now() + ms;
  }

  private walkTo(v: Villager, key: string, arrive: Mode) {
    const b = BY_KEY.get(key);
    if (!b) return;
    const [dx, dy] = doorTile(b);
    // Spread villagers at one door so they stand side by side.
    const slot = this.villagers.indexOf(v);
    const spot: [number, number] = walkable(dx + (slot % 3) - 1, dy) ? [dx + (slot % 3) - 1, dy] : [dx, dy];
    this.walkToTile(v, spot, arrive, key);
  }

  private walkToTile(v: Villager, tile: [number, number], arrive: Mode, at = "home") {
    v.path = findPath([Math.round(v.gx), Math.round(v.gy)], tile);
    v.mode = v.path.length ? "walk" : arrive;
    v.arrive = arrive;
    v.at = at;
    if (arrive === "cheer") v.cheerUntil = 0;
  }

  /* ── simulation ─────────────────────────────────────────────────── */

  private update(dt: number, now: number) {
    for (const v of this.villagers) {
      if (v.mode === "walk") {
        const next = v.path[0];
        const moved = step({ x: v.gx, y: v.gy }, { x: next[0], y: next[1] }, dt * 2.6);
        const ddx = next[0] - v.gx;
        const ddy = next[1] - v.gy;
        if (Math.abs(ddx) > Math.abs(ddy)) v.facing = ddx > 0 ? "right" : "up";
        else if (Math.abs(ddy) > 0.001) v.facing = ddy > 0 ? "down" : "left";
        v.gx = moved.x;
        v.gy = moved.y;
        if (moved.arrived) {
          v.path.shift();
          if (!v.path.length) {
            v.mode = v.arrive;
            v.facing = "down";
            if (v.mode === "cheer") v.cheerUntil = now + 2200;
            if (v.mode === "sleep") v.task = "Asleep";
            if (v.mode === "idle") v.task = `Waiting at the ${BY_KEY.get(v.at)?.label.toLowerCase() ?? "village"}`;
          }
        }
      }
      if (v.mode === "cheer" && now > v.cheerUntil) {
        v.mode = "idle";
        this.walkTo(v, v.homeKey, "idle");
      }
      // Work makes something happen at each building.
      if (v.mode === "work" && Math.random() < dt * 3) this.workParticles(v);
      if (v.mode === "cheer" && Math.random() < dt * 10) this.burst(v, 1, ["#ffd84a", "#ffffff", "#f3a0b4"], "star");
      if (v.mode === "sleep" && Math.random() < dt * 0.8) {
        const [x, y] = iso(v.gx + 0.5, v.gy + 0.5);
        this.particles.push({ x: x + 4, y: y - 8, vx: 4, vy: -7, life: 2.4, max: 2.4, colour: "#ffffff", kind: "zz" });
      }
    }
    // Chimneys smoke while the village is awake.
    if (this.awake) {
      for (const b of BUILDINGS) {
        if (!b.chimney || Math.random() > dt * 2) continue;
        const [x, y] = this.chimneyTop(b);
        this.particles.push({ x, y, vx: 2 + Math.random() * 2, vy: -6 - Math.random() * 3, life: 2.5, max: 2.5, colour: "#e9e9ee", kind: "smoke" });
      }
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.kind === "dot" || p.kind === "star") p.vy += 30 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0).slice(-300);
  }

  private workParticles(v: Villager) {
    const kinds: Record<string, [string[], Particle["kind"]]> = {
      workshop: [["#ffd84a", "#ff9a3c", "#ffffff"], "dot"],
      lab: [["#ffffff", "#a8e6a1", "#ffd84a"], "star"],
      market: [["#ffd84a", "#e5b33a"], "dot"],
      library: [["#ffffff", "#efe0d0"], "dot"],
      tower: [["#d8d2e8", "#ffffff"], "star"],
      board: [["#ffffff", "#9aa3b5"], "dot"],
    };
    const [colours, kind] = kinds[v.at] ?? [["#ffffff"], "dot"];
    this.burst(v, 2, colours, kind);
  }

  private burst(v: Villager, n: number, colours: string[], kind: Particle["kind"]) {
    const [x, y] = iso(v.gx + 0.5, v.gy + 0.5);
    for (let i = 0; i < n; i++) {
      this.particles.push({ x: x + (Math.random() - 0.5) * 8, y: y - 18, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 20, life: 0.9, max: 0.9, colour: colours[i % colours.length], kind });
    }
  }

  private chimneyTop(b: Building): [number, number] {
    const [x, y] = iso(b.bx + b.w * 0.75, b.by + b.d * 0.3, b.h + 12);
    return [x, y];
  }

  /* ── drawing ────────────────────────────────────────────────────── */

  /** The ground never changes, so it is drawn once. */
  private bakeGround(): HTMLCanvasElement {
    const g = document.createElement("canvas");
    g.width = W;
    g.height = H;
    const c = g.getContext("2d")!;
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const top = iso(gx, gy);
        const right = iso(gx + 1, gy);
        const bottom = iso(gx + 1, gy + 1);
        const left = iso(gx, gy + 1);
        const noise = (gx * 7 + gy * 13) % 5;
        let colour = (gx + gy) % 2 ? "#7cc65b" : "#76bf55";
        if (PATH_TILES.has(gy * COLS + gx)) colour = noise === 0 ? "#cfb886" : "#dac591";
        if (WATER(gx, gy)) colour = "#4aa3df";
        fillPoly(c, [top, right, bottom, left], colour);
        if (!WATER(gx, gy) && !PATH_TILES.has(gy * COLS + gx)) {
          c.fillStyle = "#68ad4b";
          if (noise === 1) c.fillRect(top[0] - 3, top[1] + 3, 1, 1);
          if (noise === 3) c.fillRect(top[0] + 2, top[1] + 4, 1, 1);
          if (noise === 2 && (gx + gy) % 3 === 0) {
            c.fillStyle = ["#ffffff", "#ffd84a", "#f3a0b4"][(gx + gy) % 3];
            c.fillRect(top[0] - 1, top[1] + 4, 1, 1);
            c.fillRect(top[0] + 3, top[1] + 3, 1, 1);
          }
        }
        // Cliff faces where the island ends.
        if (gy === ROWS - 1) {
          fillPoly(c, [left, bottom, [bottom[0], bottom[1] + CLIFF], [left[0], left[1] + CLIFF]], "#9b6b43");
          fillPoly(c, [left, bottom, [bottom[0], bottom[1] + 2], [left[0], left[1] + 2]], "#5c9a3f");
          c.fillStyle = "#86593a";
          c.fillRect(left[0] + 4, left[1] + 9 + (gx % 2), 6, 1);
        }
        if (gx === COLS - 1) {
          fillPoly(c, [bottom, right, [right[0], right[1] + CLIFF], [bottom[0], bottom[1] + CLIFF]], "#7f5636");
          fillPoly(c, [bottom, right, [right[0], right[1] + 2], [bottom[0], bottom[1] + 2]], "#4f8a36");
          c.fillStyle = "#6b4630";
          c.fillRect(bottom[0] + 3, bottom[1] + 6 - (gy % 2), 5, 1);
        }
      }
    }
    return g;
  }

  private drawSky(c: Ctx, night: number) {
    const grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, night > 0.5 ? "#1b2240" : "#8fd3f4");
    grad.addColorStop(1, night > 0.5 ? "#2d3a64" : "#d7f0fa");
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
    if (night > 0.5) {
      for (let i = 0; i < 40; i++) {
        const twinkle = Math.sin(this.t * 2 + i) > 0.6;
        c.fillStyle = twinkle ? "#ffffff" : "#9aa7d4";
        c.fillRect((i * 53) % W, (i * 29) % 90, 1, 1);
      }
    }
    // Clouds drift past.
    for (let i = 0; i < 4; i++) {
      const x = ((this.t * (4 + i) + i * 97) % (W + 80)) - 60;
      const y = 10 + i * 17;
      const col = night > 0.5 ? "#3b4878" : "#ffffff";
      blob(c, x, y, 6, col);
      blob(c, x + 8, y - 3, 7, col);
      blob(c, x + 17, y, 5, col);
    }
  }

  private drawWater(c: Ctx) {
    c.fillStyle = "#bfe6ff";
    for (let gy = 13; gy < ROWS; gy++) {
      for (let gx = 17; gx < COLS; gx++) {
        const [x, y] = iso(gx + 0.5, gy + 0.5);
        const off = Math.round(Math.sin(this.t * 2 + gx + gy * 2) * 2);
        c.fillRect(x - 3 + off, y, 3, 1);
      }
    }
  }

  private drawBuilding(c: Ctx, b: Building, lit: boolean, now: number) {
    const E = iso(b.bx + b.w, b.by);
    const S = iso(b.bx + b.w, b.by + b.d);
    const Wp = iso(b.bx, b.by + b.d);
    const up = (p: [number, number], z: number): [number, number] => [p[0], p[1] - z];
    // Shadow.
    fillPoly(c, [[S[0], S[1]], [E[0] + 6, E[1] + 3], [S[0] + 6, S[1] + 3]], "rgba(0,0,0,0.12)");
    // Walls.
    fillPoly(c, [Wp, S, up(S, b.h), up(Wp, b.h)], b.wall);
    fillPoly(c, [S, E, up(E, b.h), up(S, b.h)], b.wallDark);
    // Door and windows (windows glow at night).
    if (b.roofType !== "awning") {
      onFace(c, Wp, S, 0.42, 0.58, 0, Math.min(8, b.h - 2), "#7a4d2e");
      onFace(c, Wp, S, 0.44, 0.56, 1, Math.min(7, b.h - 3), "#5f3a22");
      const win = lit ? "#ffd84a" : "#7fb6e0";
      onFace(c, Wp, S, 0.14, 0.3, b.h - 7, b.h - 3, win);
      onFace(c, Wp, S, 0.7, 0.86, b.h - 7, b.h - 3, win);
      onFace(c, S, E, 0.3, 0.5, b.h - 7, b.h - 3, shade(win, 0.85));
      if (b.h > 18) for (let k = 1; k <= 2; k++) onFace(c, Wp, S, 0.42, 0.58, b.h - 7 - k * 6, b.h - 3 - k * 6, win);
    } else {
      // A market stall: counter, crates of goods, posts and a striped awning.
      onFace(c, Wp, S, 0.1, 0.9, b.h - 2, b.h, "#8a5a3b");
      for (let k = 0; k < 4; k++) onFace(c, Wp, S, 0.15 + k * 0.2, 0.25 + k * 0.2, b.h, b.h + 2, ["#e0564f", "#ffd84a", "#55b86a", "#f39c4a"][k]);
      for (const u of [0.04, 0.96]) onFace(c, Wp, S, u - 0.02, u + 0.02, b.h, b.h + 10, "#6b4630");
    }
    // Roofs.
    const o = 0.3;
    const rN = up(iso(b.bx - o, b.by - o), b.h);
    const rE = up(iso(b.bx + b.w + o, b.by - o), b.h);
    const rS = up(iso(b.bx + b.w + o, b.by + b.d + o), b.h);
    const rW = up(iso(b.bx - o, b.by + b.d + o), b.h);
    if (b.roofType === "awning") {
      const z = 10;
      const lift = (p: [number, number]): [number, number] => [p[0], p[1] - z];
      for (let s = 0; s < b.w * 2; s++) {
        const a = s / (b.w * 2);
        const bb = (s + 1) / (b.w * 2);
        const lerp = (p: [number, number], q: [number, number], u: number): [number, number] => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
        fillPoly(c, [lift(lerp(rN, rE, a)), lift(lerp(rN, rE, bb)), lift(lerp(rW, rS, bb)), lift(lerp(rW, rS, a))], s % 2 ? "#ffffff" : b.roof);
      }
      fillPoly(c, [lift(rW), lift(rS), [rS[0], rS[1] - z + 3], [rW[0], rW[1] - z + 3]], shade(b.roof, 0.8));
    } else {
      const rh = b.roofType === "spire" ? 22 : 9 + b.w;
      const apex = up(iso(b.bx + b.w / 2, b.by + b.d / 2), b.h + rh);
      fillPoly(c, [rN, rW, apex], shade(b.roof, 0.9));
      fillPoly(c, [rN, rE, apex], shade(b.roof, 0.75));
      fillPoly(c, [rW, rS, apex], b.roof);
      fillPoly(c, [rS, rE, apex], shade(b.roof, 0.7));
      // Shingle lines.
      c.fillStyle = shade(b.roof, 0.6);
      for (let k = 1; k < 3; k++) {
        const u = k / 3;
        const a1: [number, number] = [rW[0] + (apex[0] - rW[0]) * u, rW[1] + (apex[1] - rW[1]) * u];
        const a2: [number, number] = [rS[0] + (apex[0] - rS[0]) * u, rS[1] + (apex[1] - rS[1]) * u];
        fillPoly(c, [a1, a2, [a2[0], a2[1] + 1], [a1[0], a1[1] + 1]], shade(b.roof, 0.8));
      }
      if (b.roofType === "spire") {
        c.fillStyle = "#ffd84a";
        c.fillRect(apex[0], apex[1] - 4, 1, 4);
        c.fillRect(apex[0] + 1, apex[1] - 4, 3, 2);
      }
    }
    if (b.chimney) {
      const [x, y] = this.chimneyTop(b);
      c.fillStyle = "#8c4a3a";
      c.fillRect(x - 2, y, 4, 7);
      c.fillStyle = "#6e3a2e";
      c.fillRect(x - 2, y, 4, 1);
    }
    // Sign with the building's icon, bobbing gently when someone works there.
    const busy = this.villagers.some((v) => v.at === b.key && v.mode === "work");
    const [sx, sy] = iso(b.bx + 0.2, b.by + b.d + 0.2, b.h + 4);
    const bob = busy ? Math.round(Math.sin(now / 150) * 1) : 0;
    c.fillStyle = "#6b4630";
    c.fillRect(sx - 5, sy - 5 + bob, 11, 11);
    c.fillStyle = "#f6e7cf";
    c.fillRect(sx - 4, sy - 4 + bob, 9, 9);
    sprite(c, ICONS[b.icon], sx - 3, sy - 3 + bob);
  }

  private drawTree(c: Ctx, gx: number, gy: number, night: number) {
    const [x, y] = iso(gx + 0.5, gy + 0.5);
    const sway = Math.round(Math.sin(this.t * 1.5 + gx * 2 + gy) * 0.8);
    blob(c, x + 2, y + 1, 4, "rgba(0,0,0,0.12)");
    c.fillStyle = "#6b4630";
    c.fillRect(x - 1, y - 7, 3, 8);
    blob(c, x + sway, y - 13, 7, night > 0.5 ? "#2e6b39" : "#3f9a4f");
    blob(c, x - 2 + sway, y - 15, 5, night > 0.5 ? "#3a7d45" : "#55b86a");
    blob(c, x - 3 + sway, y - 17, 2, night > 0.5 ? "#4b8f54" : "#7fd08a");
  }

  private drawVillager(c: Ctx, v: Villager, now: number) {
    const [x, y] = iso(v.gx + 0.5, v.gy + 0.5);
    const shirt = { C: v.colour, c: shade(v.colour, 0.75) };
    if (v.mode === "sleep") {
      // A little bedroll and a blanket in the villager's colour.
      c.fillStyle = "#e6d3b3";
      c.fillRect(x - 9, y - 4, 18, 6);
      sprite(c, SLEEPER, x - 8, y - 5, shirt);
      return;
    }
    blob(c, x, y, 3, "rgba(0,0,0,0.18)");
    let legs: keyof typeof LEGS = "stand";
    let bob = 0;
    let armsUp = false;
    if (v.mode === "walk") {
      const f = Math.floor(now / 140 + v.phase * 3) % 4;
      legs = f === 1 ? "stepA" : f === 3 ? "stepB" : "stand";
      bob = f % 2 ? -1 : 0;
    } else if (v.mode === "work") {
      armsUp = Math.floor(now / 260 + v.phase) % 2 === 0;
      bob = armsUp ? -1 : 0;
    } else if (v.mode === "cheer") {
      armsUp = true;
      bob = -Math.round(Math.abs(Math.sin(now / 160)) * 6);
    } else {
      bob = Math.sin(now / 500 + v.phase) > 0.7 ? -1 : 0;
    }
    const art = frame(v.facing, legs, armsUp);
    // Blink now and then.
    const blinking = (now / 1000 + v.phase) % 4 < 0.12 && v.facing !== "up";
    const swap: Record<string, string> = { ...shirt, ...(blinking ? { E: "#f7d1ae" } : {}) };
    sprite(c, art, x - 5, y - 16 + bob, swap, v.facing === "left");
    // The tool for the job floats above a worker.
    if (v.mode === "work") {
      const b = BY_KEY.get(v.at);
      if (b) sprite(c, ICONS[b.icon], x - 3, y - 27 + Math.round(Math.sin(now / 200) * 1.5));
    }
  }

  private drawParticles(c: Ctx) {
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.max);
      c.globalAlpha = p.kind === "smoke" ? a * 0.7 : a;
      if (p.kind === "zz") sprite(c, ICONS.zz, p.x, p.y, { O: "#ffffff" });
      else if (p.kind === "smoke") blob(c, p.x, p.y, 1 + Math.round((1 - a) * 3), p.colour);
      else if (p.kind === "star") {
        c.fillStyle = p.colour;
        c.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 3);
        c.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 1);
      } else {
        c.fillStyle = p.colour;
        c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    }
    c.globalAlpha = 1;
  }

  private drawLife(c: Ctx, night: number) {
    if (night > 0.5) {
      // Fireflies by night.
      for (let i = 0; i < 12; i++) {
        const gx = (i * 37) % COLS;
        const gy = (i * 23) % ROWS;
        const [x, y] = iso(gx + 0.5 + Math.sin(this.t * 0.7 + i) * 0.8, gy + 0.5 + Math.cos(this.t * 0.5 + i) * 0.8, 6 + Math.sin(this.t * 2 + i) * 3);
        if (Math.sin(this.t * 3 + i * 2) > 0) {
          c.fillStyle = "#fff6a0";
          c.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
      }
    } else {
      // Butterflies by day.
      for (const f of this.butterflies) {
        const [x, y] = iso(f.gx + Math.sin(this.t * 0.6 + f.seed) * 2, f.gy + Math.cos(this.t * 0.4 + f.seed) * 2, 8 + Math.sin(this.t * 3 + f.seed) * 2);
        const open = Math.floor(this.t * 8 + f.seed) % 2 === 0;
        c.fillStyle = ["#f3a0b4", "#ffd84a", "#ffffff"][f.seed % 3];
        if (open) {
          c.fillRect(Math.round(x) - 2, Math.round(y), 2, 2);
          c.fillRect(Math.round(x) + 1, Math.round(y), 2, 2);
        } else c.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
        c.fillStyle = "#2b2238";
        c.fillRect(Math.round(x), Math.round(y), 1, 2);
      }
    }
  }

  /** 0 by day, 1 by night, from your computer's clock. */
  private nightness(): number {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 21 || h < 5) return 1;
    if (h >= 19) return (h - 19) / 2;
    if (h < 7) return 1 - (h - 5) / 2;
    return 0;
  }

  private draw(now: number) {
    const c = this.o;
    const night = this.nightness();
    this.drawSky(c, night);
    c.drawImage(this.ground, 0, 0);
    this.drawWater(c);

    // Everything that stands up, drawn back to front.
    type Thing = { key: number; draw: () => void };
    const things: Thing[] = [];
    for (const b of BUILDINGS) things.push({ key: b.bx + b.by + (b.w + b.d) / 2, draw: () => this.drawBuilding(c, b, night > 0.4, now) });
    for (const [gx, gy] of TREES) things.push({ key: gx + gy + 1, draw: () => this.drawTree(c, gx, gy, night) });
    for (const v of this.villagers) things.push({ key: v.gx + v.gy + 1.1, draw: () => this.drawVillager(c, v, now) });
    things.sort((a, b) => a.key - b.key).forEach((t) => t.draw());
    this.drawParticles(c);
    this.drawLife(c, night);

    // Evening and night tint over the whole world.
    if (night > 0) {
      c.fillStyle = `rgba(20, 24, 70, ${0.42 * night})`;
      c.fillRect(0, 0, W, H);
      // Lit windows glow through the tint.
      if (night > 0.4) {
        for (const b of BUILDINGS) {
          if (b.roofType === "awning") continue;
          const [x, y] = iso(b.bx + b.w * 0.3, b.by + b.d, b.h - 5);
          c.fillStyle = "rgba(255, 216, 74, 0.25)";
          blob(c, x, y, 4, "rgba(255, 216, 74, 0.18)");
        }
      }
    }

    // Scale up with hard edges, then draw text at full resolution so it stays readable.
    const d = this.ctx;
    d.imageSmoothingEnabled = false;
    d.drawImage(this.off, 0, 0, W * this.scale, H * this.scale);
    this.drawLabels(d);
    this.drawBubbles(d, now);
    this.drawHud(d, night, now);
  }

  private text(d: Ctx, size: number, weight = 700) {
    d.font = `${weight} ${Math.round(size)}px ui-monospace, "SF Mono", Menlo, monospace`;
    d.textBaseline = "middle";
  }

  private panel(d: Ctx, x: number, y: number, w: number, h: number, fill = "rgba(255,248,236,0.95)") {
    const p = Math.max(2, Math.round(this.scale / 1.5));
    d.fillStyle = "#2b2238";
    d.fillRect(x - p, y, w + 2 * p, h);
    d.fillRect(x, y - p, w, h + 2 * p);
    d.fillStyle = fill;
    d.fillRect(x, y, w, h);
  }

  private drawLabels(d: Ctx) {
    const s = this.scale;
    this.text(d, 3.2 * s, 600);
    d.textAlign = "center";
    for (const b of BUILDINGS) {
      const [x, y] = iso(b.bx + b.w / 2 + 0.4, b.by + b.d + 0.9);
      d.fillStyle = "rgba(43,34,56,0.55)";
      d.fillText(b.label, x * s + 1, y * s + 1);
      d.fillStyle = "#fffaf0";
      d.fillText(b.label, x * s, y * s);
    }
  }

  private drawBubbles(d: Ctx, now: number) {
    const s = this.scale;
    this.text(d, 3.6 * s);
    d.textAlign = "center";
    for (const v of this.villagers) {
      if (!v.say || now > v.sayUntil || v.mode === "sleep") continue;
      const [x, y] = iso(v.gx + 0.5, v.gy + 0.5);
      const text = v.say.length > 34 ? `${v.say.slice(0, 33)}…` : v.say;
      const w = d.measureText(text).width + 4 * s;
      const h = 7 * s;
      const bx = Math.min(Math.max(4, x * s - w / 2), W * s - w - 4);
      const by = (y - 34) * s - h;
      this.panel(d, bx, by, w, h, "#ffffff");
      d.fillStyle = "#2b2238";
      d.fillRect(x * s - s, by + h + s, 2 * s, 2 * s);
      d.fillStyle = "#2b2238";
      d.fillText(text, bx + w / 2, by + h / 2 + 1);
    }
  }

  private drawHud(d: Ctx, night: number, now: number) {
    const s = this.scale;
    // Clock and state, top left.
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    this.text(d, 3.6 * s);
    d.textAlign = "left";
    const head = `${night > 0.5 ? "☾" : "☀"} ${time} · ${this.awake ? "Village awake" : "Asleep"}`;
    const hw = d.measureText(head).width + 6 * s;
    this.panel(d, 3 * s, 3 * s, hw, 8 * s);
    d.fillStyle = "#2b2238";
    d.fillText(head, 6 * s, 7 * s + 1);

    // Quest log, top right: what each villager is doing now.
    this.text(d, 3.1 * s, 600);
    const rows = this.villagers.map((v) => `${v.name}: ${v.task}`);
    const lw = Math.min(W * s * 0.46, Math.max(...rows.map((r) => d.measureText(r).width)) + 12 * s);
    const lx = W * s - lw - 4 * s;
    this.panel(d, lx, 3 * s, lw, (rows.length * 6 + 9) * s);
    this.text(d, 3.3 * s);
    d.fillStyle = "#2b2238";
    d.fillText("QUEST LOG", lx + 3 * s, 7 * s);
    this.text(d, 3.1 * s, 600);
    this.villagers.forEach((v, i) => {
      const ry = (13 + i * 6) * s;
      d.fillStyle = v.colour;
      d.fillRect(lx + 3 * s, ry - 1.5 * s, 3 * s, 3 * s);
      d.fillStyle = v.mode === "sleep" ? "#7a7f8c" : "#2b2238";
      let row = rows[i];
      while (d.measureText(row).width > lw - 10 * s && row.length > 4) row = `${row.slice(0, -2)}…`;
      d.fillText(row, lx + 8 * s, ry + 1);
    });

    // A toast when a job is done.
    if (this.toast && now < this.toast.until) {
      this.text(d, 4 * s);
      d.textAlign = "center";
      const tw = d.measureText(this.toast.text).width + 8 * s;
      const rise = Math.min(1, (this.toast.until - now) / 400);
      const ty = H * s - (14 * s) * Math.min(1, (6000 - (this.toast.until - now)) / 300) * rise;
      this.panel(d, (W * s - tw) / 2, ty, tw, 9 * s, "#fff6a0");
      d.fillStyle = "#2b2238";
      d.fillText(this.toast.text, W * s / 2, ty + 4.5 * s + 1);
    }
  }
}
