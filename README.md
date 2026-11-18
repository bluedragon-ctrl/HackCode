# HackCode

An educational browser game about assembly language. You program a robot in **Blue-11
assembly** — a dialect of PDP-11 Macro-11 — and guide it through a dungeon: scan, drive,
shoot monsters, collect loot, reach the exit.

- **Lessons** teach the language step by step on hand-made maps.
- **Expeditions** send the robot into procedurally generated dungeons.

Status: pre-alpha. The current page is a Blue-11 console (editor, run, output, registers).
See [`docs/DESIGN.md`](docs/DESIGN.md) for the game design and
the [`blue11`](https://github.com/bluedragon-ctrl/Blue11/blob/main/packages/blue11/README.md) package (npm) for the CPU and assembler
library, which lives in its own repository, [Blue11](https://github.com/bluedragon-ctrl/Blue11).

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # output in dist/
```

Pushes to `main` deploy to GitHub Pages (enable it once: Settings → Pages → Source:
GitHub Actions).
