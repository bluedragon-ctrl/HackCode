/** A Canvas 2D renderer in a neon, cyberpunk vector look: walls, floor items, monsters and the robot. */

import { DX, DY, lootAmount, Monster, monsterKind, TYPE, type ObjectRecord, type World } from '../core';
import type { Renderer } from './index';

const COLOR = {
  bg: '#05070d',
  grid: '#0e1628',
  wall: '#39d0ff',
  wallFill: '#0b1a33',
  exit: '#4dff9a',
  coin: '#ffd23f',
  chip: '#ff4dd2',
  charger: '#4dff9a',
  chargerFill: '#06261a',
  robot: '#00f0ff',
  dead: '#ff5a5a',
  patrol: '#ffb000',
  chaser: '#ff2a5f',
  sentry: '#b36bff',
  /** The offset copies behind sprites (the colour split). */
  ghostCyan: '#00f0ff',
  ghostMagenta: '#ff2bd6',
  unknown: '#ff8a3d',
};

export class CanvasRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas: no 2D context');
    this.ctx = ctx;
  }

  draw(world: World): void {
    const { canvas, ctx } = this;
    const g = world.grid;
    // Square cells, as large as the parent's width and the rest of the window's height allow.
    const dpr = window.devicePixelRatio || 1;
    const box = canvas.parentElement;
    const pad = box ? parseFloat(getComputedStyle(box).paddingLeft) * 2 : 0;
    const availW = (box ? box.clientWidth - pad : canvas.clientWidth) || 600;
    const availH = window.innerHeight - canvas.getBoundingClientRect().top - 24;
    const cell = Math.max(8, Math.floor(Math.min(availW / g.width, availH / g.height)));
    const cssW = cell * g.width, cssH = cell * g.height;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= g.width; x++) { ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, cssH); }
    for (let y = 0; y <= g.height; y++) { ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(g.width * cell, y * cell + 0.5); }
    ctx.stroke();

    const headings = new Map<number, number>();
    for (const a of world.actors) {
      if (a instanceof Monster && !a.destroyed) headings.set(a.y * g.width + a.x, a.heading);
    }
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const px = x * cell, py = y * cell;
        const floor = g.get('floor', x, y);
        if (floor.type) this.floorItem(floor, px, py, cell);
        const occ = g.get('occupant', x, y);
        if (occ.type === TYPE.ROBOT) this.robot(world, x, y, cell);
        else if (monsterKind(occ.type)) {
          this.monster(occ, headings.get(y * g.width + x) ?? 0, world, x, y, cell);
        } else if (occ.type === TYPE.CHARGER) {
          this.charger(occ, px, py, cell, this.feeding(world, x, y));
        } else if (occ.type) this.occupant(occ, px, py, cell);
      }
    }
  }

  private glow(color: string, blur: number): void {
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = blur;
  }

  private floorItem(o: ObjectRecord, px: number, py: number, s: number): void {
    const ctx = this.ctx;
    const cx = px + s / 2, cy = py + s / 2;
    ctx.save();
    switch (o.type) {
      case TYPE.EXIT:
        this.glow(COLOR.exit, 10);
        ctx.strokeStyle = COLOR.exit;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + s * 0.15, py + s * 0.15, s * 0.7, s * 0.7);
        ctx.strokeRect(px + s * 0.32, py + s * 0.32, s * 0.36, s * 0.36);
        break;
      case TYPE.COIN: {
        this.glow(COLOR.coin, 8);
        ctx.strokeStyle = COLOR.coin;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.22, 0, 2 * Math.PI);
        ctx.stroke();
        const n = lootAmount(o.loot);
        if (n > 1) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = COLOR.coin;
          ctx.font = `${Math.floor(s * 0.3)}px ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.toString(8), cx, cy + 1);
        }
        break;
      }
      case TYPE.CHIP:
        this.glow(COLOR.chip, 8);
        ctx.strokeStyle = COLOR.chip;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + s * 0.3, py + s * 0.3, s * 0.4, s * 0.4);
        break;
      default:
        this.unknown(px, py, s);
    }
    ctx.restore();
  }

  private occupant(o: ObjectRecord, px: number, py: number, s: number): void {
    const ctx = this.ctx;
    ctx.save();
    if (o.type === TYPE.WALL) {
      ctx.fillStyle = COLOR.wallFill;
      ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
      this.glow(COLOR.wall, 6);
      ctx.strokeStyle = COLOR.wall;
      // Damaged walls dim with their HP.
      ctx.globalAlpha = 0.35 + 0.65 * (o.hp / 255);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 3, py + 3, s - 6, s - 6);
    } else {
      this.unknown(px, py, s);
    }
    ctx.restore();
  }

  /** The robot's dock is charging from the charger at (x, y). */
  private feeding(world: World, x: number, y: number): boolean {
    const r = world.robot;
    return r.dock.charging && r.x + DX[r.heading] === x && r.y + DY[r.heading] === y;
  }

  /** A charging pylon: a socket with a bolt; it glows brighter, pulsing, while it feeds the robot. */
  private charger(o: ObjectRecord, px: number, py: number, s: number, feeding: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = COLOR.chargerFill;
    ctx.fillRect(px + s * 0.12, py + s * 0.12, s * 0.76, s * 0.76);
    const alpha = 0.4 + 0.6 * (o.hp / 255);
    ctx.globalAlpha = alpha;
    this.glow(COLOR.charger, feeding ? 18 : 6);
    ctx.strokeStyle = COLOR.charger;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + s * 0.12, py + s * 0.12, s * 0.76, s * 0.76);
    ctx.fillStyle = COLOR.charger;
    ctx.beginPath();
    ctx.moveTo(px + s * 0.56, py + s * 0.2);
    ctx.lineTo(px + s * 0.32, py + s * 0.54);
    ctx.lineTo(px + s * 0.48, py + s * 0.54);
    ctx.lineTo(px + s * 0.42, py + s * 0.8);
    ctx.lineTo(px + s * 0.68, py + s * 0.44);
    ctx.lineTo(px + s * 0.52, py + s * 0.44);
    ctx.closePath();
    if (feeding) ctx.fill();
    else ctx.stroke();
    ctx.restore();
  }

  /** A monster's sprite in its kind's color; hurt monsters dim with their HP. */
  private monster(o: ObjectRecord, heading: number, world: World, x: number, y: number, s: number): void {
    const kind = monsterKind(o.type);
    const [sprite, color] =
      o.type === TYPE.CHASER ? [sprites().chaser, COLOR.chaser]
      : o.type === TYPE.SENTRY ? [sprites().sentry, COLOR.sentry]
      : [sprites().patrol, COLOR.patrol];
    const alpha = 0.45 + 0.55 * Math.min(1, o.hp / (kind?.hp ?? 255));
    this.sprite(sprite, color, COLOR.ghostCyan, heading, alpha, glitch(world, x, y), x * s, y * s, s);
  }

  /**
   * Draws a sprite (authored facing east in a 40Ă—40 box) rotated to the heading, with a
   * faint offset copy in the ghost color behind it â€” the colour-split look. `glitchy`
   * widens the split for a tick.
   */
  private sprite(sprite: Sprite, color: string, ghost: string | null, heading: number,
    alpha: number, glitchy: boolean, px: number, py: number, s: number): void {
    const ctx = this.ctx;
    const k = s / SPRITE_BOX;
    const detail = s >= DETAIL_CELL;
    ctx.save();
    ctx.translate(px + s / 2, py + s / 2);
    ctx.rotate(Math.atan2(DY[heading], DX[heading]));
    ctx.scale(k, k);
    ctx.translate(-SPRITE_BOX / 2, -SPRITE_BOX / 2);
    ctx.lineWidth = (detail ? 1.6 : 2) / k;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    const pass = (c: string, a: number, dx: number, dy: number, blur: number): void => {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(dx, dy);
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      this.glow(c, blur);
      for (const part of sprite) {
        if (part.detail && !detail) continue;
        ctx.setLineDash(part.dash ? [1.5, 2] : []);
        if (part.fill) ctx.fill(part.path);
        else ctx.stroke(part.path);
      }
      ctx.restore();
    };
    if (ghost) {
      const off = glitchy ? 2.4 : 0.9;
      pass(ghost, alpha * (glitchy ? 0.7 : 0.45), -off, glitchy ? off * 0.5 : 0, 0);
    }
    pass(color, alpha, 0, 0, 10);
    ctx.restore();
  }

  private unknown(px: number, py: number, s: number): void {
    const ctx = this.ctx;
    const cx = px + s / 2, cy = py + s / 2, r = s * 0.3;
    this.glow(COLOR.unknown, 8);
    ctx.strokeStyle = COLOR.unknown;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.stroke();
  }

  /** The robot: an armoured chassis with its visor on the side it faces; red when destroyed. */
  private robot(world: World, x: number, y: number, s: number): void {
    const r = world.robot;
    if (r.destroyed) {
      this.sprite(sprites().robot, COLOR.dead, null, r.heading, 0.8, false, x * s, y * s, s);
    } else {
      this.sprite(sprites().robot, COLOR.robot, COLOR.ghostMagenta, r.heading, 1, glitch(world, x, y),
        x * s, y * s, s);
    }
  }
}

/** One stroke (or fill) of a sprite; `detail` parts are dropped in small cells. */
interface SpritePart { path: Path2D; fill?: boolean; dash?: boolean; detail?: boolean }
type Sprite = SpritePart[];

/** Sprites are authored in a 40Ă—40 box facing east (+x). */
const SPRITE_BOX = 40;
/** Cells smaller than this (in CSS px) get the simplified sprites. */
const DETAIL_CELL = 24;

type PartSpec = [d: string, opts?: Omit<SpritePart, 'path'>];
const FILL = { fill: true }, DETAIL = { detail: true }, DASH = { dash: true, detail: true };

const SPRITE_SPECS: Record<'robot' | 'patrol' | 'chaser' | 'sentry', PartSpec[]> = {
  // Armoured chassis, side fins, circuit traces, a solid wedge visor ahead.
  robot: [
    ['M10 8 L26 8 L32 14 L32 26 L26 32 L10 32 L6 28 L6 12 Z'],
    ['M3 12 L3 28 M36 16 L36 24'],
    ['M22 14 L30 17 L30 23 L22 26 Z', FILL],
    ['M10 14 L16 14 L18 16 M10 26 L16 26 L18 24 M10 20 L18 20', DETAIL],
  ],
  // Surveillance quad drone: diamond core, four rotors, a dashed scan cone ahead.
  patrol: [
    ['M20 10 L30 20 L20 30 L10 20 Z'],
    ['M13 9 A4 4 0 1 1 5 9 A4 4 0 1 1 13 9 M13 31 A4 4 0 1 1 5 31 A4 4 0 1 1 13 31 '
      + 'M35 9 A4 4 0 1 1 27 9 A4 4 0 1 1 35 9 M35 31 A4 4 0 1 1 27 31 A4 4 0 1 1 35 31'],
    ['M12 12 L15 15 M12 28 L15 25 M28 12 L25 15 M28 28 L25 25', DETAIL],
    ['M20 17 L24 20 L20 23 Z', FILL],
    ['M31 20 L38 16 M31 20 L38 24', DASH],
  ],
  // Mech spider: hex body, head with twin optics, jointed legs (four of them when small).
  chaser: [
    ['M14 15 L22 15 L26 20 L22 25 L14 25 L11 20 Z'],
    ['M26 17 L31 18 L33 20 L31 22 L26 23'],
    ['M28 18 h2 v1.5 h-2 Z M28 20.5 h2 v1.5 h-2 Z', FILL],
    ['M22 15 L27 8 L34 6 M15 15 L10 8 L5 7 M22 25 L27 32 L34 34 M15 25 L10 32 L5 33'],
    ['M18 15 L19 6 L15 2 M12 17 L5 14 L2 16 M18 25 L19 34 L15 38 M12 23 L5 26 L2 24', DETAIL],
  ],
  // ICE turret: octagon base with targeting brackets, a railgun barrel ahead.
  sentry: [
    ['M14 6 L26 6 L34 14 L34 26 L26 34 L14 34 L6 26 L6 14 Z'],
    ['M14 13 L26 13 L27 20 L26 27 L14 27 L12 20 Z'],
    ['M26 18 L39 18 L39 22 L26 22 Z', FILL],
    ['M19 17.5 A2.5 2.5 0 1 1 19 22.5 A2.5 2.5 0 1 1 19 17.5 Z', FILL],
    ['M5 5 L10 5 M5 5 L5 10 M35 35 L30 35 M35 35 L35 30', DETAIL],
  ],
};

/** Path2D is built on first use, so this module still loads where there is no canvas. */
let built: Record<keyof typeof SPRITE_SPECS, Sprite> | null = null;
function sprites(): Record<keyof typeof SPRITE_SPECS, Sprite> {
  built ??= Object.fromEntries(Object.entries(SPRITE_SPECS).map(([k, parts]) =>
    [k, parts.map(([d, opts]) => ({ path: new Path2D(d), ...opts }))])) as Record<keyof typeof SPRITE_SPECS, Sprite>;
  return built;
}

/** A brief, deterministic colour-split glitch: each actor flickers on its own beat. */
function glitch(world: World, x: number, y: number): boolean {
  return (world.tick + x * 5 + y * 3) % 13 === 0;
}
