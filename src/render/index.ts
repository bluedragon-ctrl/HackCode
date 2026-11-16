/**
 * Top-down renderers. They read the simulation state and never change it. Plain Canvas 2D
 * first; a PixiJS renderer can replace it later behind the same interface.
 */

import type { World } from '../core';

export interface Renderer {
  /** Draw the world as it is now. */
  draw(world: World): void;
}

export { CanvasRenderer } from './canvas';
