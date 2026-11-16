/** A Canvas 2D renderer in the neon vector look: walls, floor items, monsters and the robot. */

import { DX, DY, lootAmount, Monster, MONSTERS, TYPE, type ObjectRecord, type World } from '../core';
import type { Renderer } from './index';

const COLOR = {
  bg: '#05070d',
  grid: '#0e1628',
  wall: '#39d0ff',
  wallFill: '#0b1a33',
  exit: '#4dff9a',
  coin: '#ffd23f',
  chip: '#ff4dd2',
  robot: '#39d0ff',
  dead: '#ff5a5a',
  patrol: '#ff8a3d',
  chaser: '#ff3d6e',
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
        if (occ.type === TYPE.ROBOT) this.robot(world, px, py, cell);
        else if (occ.type === TYPE.PATROL || occ.type === TYPE.CHASER) {
          this.monster(occ, headings.get(y * g.width + x) ?? 0, px, py, cell);
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

  /** A patrol is a square, a chaser a spiked diamond; a tick on the side it faces. */
  private monster(o: ObjectRecord, heading: number, px: number, py: number, s: number): void {
    const ctx = this.ctx;
    const chaser = o.type === TYPE.CHASER;
    const color = chaser ? COLOR.chaser : COLOR.patrol;
    const full = (chaser ? MONSTERS.chaser : MONSTERS.patrol).hp;
    const cx = px + s / 2, cy = py + s / 2, r = s * 0.3;
    ctx.save();
    this.glow(color, 10);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    // Hurt monsters dim with their HP.
    ctx.globalAlpha = 0.45 + 0.55 * Math.min(1, o.hp / full);
    ctx.beginPath();
    if (chaser) {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4, k = i % 2 ? 0.55 : 1;
        ctx.lineTo(cx + Math.sin(a) * r * k * 1.15, cy - Math.cos(a) * r * k * 1.15);
      }
      ctx.closePath();
    } else {
      ctx.rect(cx - r, cy - r, 2 * r, 2 * r);
    }
    ctx.stroke();
    // Facing: a bar on that side.
    const dx = DX[heading], dy = DY[heading];
    ctx.fillRect(cx + dx * r * 0.75 - (dy ? r * 0.5 : 1.5), cy + dy * r * 0.75 - (dx ? r * 0.5 : 1.5),
      dy ? r : 3, dx ? r : 3);
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

  private robot(world: World, px: number, py: number, s: number): void {
    const ctx = this.ctx;
    const r = world.robot;
    const color = r.destroyed ? COLOR.dead : COLOR.robot;
    const cx = px + s / 2, cy = py + s / 2;
    const dx = DX[r.heading], dy = DY[r.heading];
    ctx.save();
    this.glow(color, 12);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.32, 0, 2 * Math.PI);
    ctx.stroke();
    // Heading: a triangle pointing the way the robot faces.
    const tip = s * 0.3, base = s * 0.14;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx + dx * tip, cy + dy * tip);
    ctx.lineTo(cx - dy * base - dx * base * 0.6, cy + dx * base - dy * base * 0.6);
    ctx.lineTo(cx + dy * base - dx * base * 0.6, cy - dx * base - dy * base * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
