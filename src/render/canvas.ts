/** A Canvas 2D renderer in the neon vector look: walls, floor items and the robot. */

import { DX, DY, lootAmount, TYPE, type ObjectRecord, type World } from '../core';
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
    // Fit the canvas to its box at the device's pixel density.
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cell = Math.max(4, Math.floor(cssW / g.width));
    const cssH = cell * g.height;
    canvas.style.height = `${cssH}px`;
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ox = Math.floor((cssW - cell * g.width) / 2);

    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= g.width; x++) { ctx.moveTo(ox + x * cell + 0.5, 0); ctx.lineTo(ox + x * cell + 0.5, cssH); }
    for (let y = 0; y <= g.height; y++) { ctx.moveTo(ox, y * cell + 0.5); ctx.lineTo(ox + g.width * cell, y * cell + 0.5); }
    ctx.stroke();

    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const px = ox + x * cell, py = y * cell;
        const floor = g.get('floor', x, y);
        if (floor.type) this.floorItem(floor, px, py, cell);
        const occ = g.get('occupant', x, y);
        if (occ.type === TYPE.ROBOT) this.robot(world, px, py, cell);
        else if (occ.type) this.occupant(occ, px, py, cell);
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
