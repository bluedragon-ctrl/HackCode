# Blue-11 display: a memory-mapped graphics device (spec, not built)

Status: **draft for the owner's review** (2026-11-18). Part of the Blue-11 library, not of
HackCode: it moves with the library to its own repository (ROADMAP.md §1). Its first user is
the standalone simulator for students. HackCode may add it later, but doesn't need it.

Companion devices, already built: the DL11 console and the KW11-L line clock
(`src/blue11/devices.ts`). The keyboard device is specified next (ROADMAP.md §1, step 2).

## 1. Goals

- **A first graphics lesson in a few lines:** a pixel is a byte in memory, so
  `MOVB #4, @#140000` draws one. The address gives the position without any arithmetic.
- **It teaches real ideas:** memory-mapped I/O, address arithmetic, row stride, word versus
  byte writes, little-endian order, waiting for vertical blank, double buffering, palettes,
  and the cost in cycles of filling a screen.
- **It is small:** one simple mode, so the whole device fits on one help page.
- **It follows the library's rules** (`src/blue11/AGENTS.md`): it is deterministic, uses only
  integers, has no DOM, and its state survives JSON. The library only keeps the pixels. The
  host draws them on a canvas.

**Not goals:** sprites, hardware scrolling, line drawing, a text mode, or blitting. A program
does these things itself, and that is the lesson.

## 2. It departs from the original machine

DEC had no simple framebuffer like this for the PDP-11. Its display (the VT11) was a vector
display processor and too complex for a first lesson. The Blue-11 display is a **teaching
device**: it only uses DEC's conventions (a CSR with `DONE` in bit 7 and `IE` in bit 6, a
vector, a bus level). When it is built, the library README's section "Where it departs from
the real machine" lists it (library rule 6).

## 3. The picture

| | |
| :--- | :--- |
| Resolution | **64 × 64** pixels (`100` × `100` octal) |
| Pixel | **one byte**, a palette index. Only its low 4 bits pick the colour: colour = `palette[value & 17]` |
| Rows | top to bottom; within a row, left to right |
| Address of (x, y) | `page + y*100 + x` (octal) |
| Page size | 4 KB (`10000` octal) |
| Pages | **2**: page 0 at `140000`–`147777`, page 1 at `150000`–`157777` |
| Palette | 16 entries, each **RGB 3-3-3**, one octal digit per colour channel |

**Why 64 × 64 at a byte per pixel.** Each coordinate is two octal digits, so in the octal
address the row and column can be read straight off:

```
        1 4 Y Y X X        page 0:  140000 + y*100 + x
        1 5 Y Y X X        page 1:  150000 + y*100 + x
```

Pixel (x = 12, y = 34) on page 0 is at `143412`. Going one row down adds `100`, and one
pixel to the right adds `1`. Drawing a diagonal is `ADD #101, R1` in a loop. This is the
best argument for octal the student will meet. One byte per pixel means `MOVB` draws a
pixel without any bit packing. Packing pixels is a later lesson, if a second mode is ever
added (§9).

**The cost is about right.** Clearing a page takes 2048 word writes. `CLR (R1)+` plus `SOB`
takes 3 cycles a word, about 6 K cycles in total, or roughly a third of a frame at the
default speed (§5). A student can feel that it is not free, but it still fits.

**Words are two pixels.** A word write fills pixels x and x+1 with the low byte (x) and the
high byte (x+1), because the bus is little-endian. To paint two pixels with colour 3,
`MOV #1403, (R1)+`, since `3*400 + 3 = 1403`. Two pixels with colour 17 are `MOV #7417`.

**The high 4 bits are stored, not shown.** A pixel byte reads back exactly what was written.
The display ignores the high 4 bits, so a program may use them as its own flags (such as
"visited" in a flood fill). If a later mode needs those bits, it is a new mode, and mode 0
keeps this rule.

## 4. Registers

Base `176600`, which is free in both HackCode and the simulator, and is configurable.
Vector `320`, level 4. Both are also configurable.

| Address | Name | Access | |
| :--- | :--- | :--- | :--- |
| `176600` | `DSPCS` | read / write | control and status (below) |
| `176602` | `DSPFRM` | read only | frame counter: +1 at every vertical blank, wraps at 16 bits |
| `176604`–`176616` | | | hole: bus error (trap 4) |
| `176620`–`176656` | `DSPPAL` | read / write | 16 palette words, entry *n* at `176620 + 2n` |

**`DSPCS`**

| Bit | Name | |
| :--- | :--- | :--- |
| 0 | `PAGE` | the page shown from the next vertical blank on (0 or 1) |
| 6 | `IE` | interrupt at every vertical blank |
| 7 | `DONE` | set at every vertical blank. Cleared by writing it as 0. Writing 1 leaves it as it is (as the KW11-L's `LKS`) |
| others | | read as 0, writes ignored. A write to the high byte is ignored |

`BIC #200, @#DSPCS` clears `DONE` and keeps `PAGE` and `IE`, so the usual wait is:

```
; VSYNC: wait for the next vertical blank.
VSYNC:  BIC  #200, @#DSPCS      ; forget the frame we may already have seen
1$:     TSTB @#DSPCS            ; DONE (bit 7 = sign of the low byte)?
        BPL  1$                 ; not yet
        RTS  PC
```

**Palette words.** Bits 8–6 are red, bits 5–3 green, and bits 2–0 blue, each 0–7. So a
palette value reads as three octal digits, `RGB`: `700` red, `070` green, `007` blue, `770`
yellow, `777` white. Bits 15–9 read as 0 and writes to them are ignored. A byte write to
the high byte changes only bit 8 (the top of red).

**Power-up palette:** a classic 16-colour set.

| Index | Colour | RGB | Index | Colour | RGB |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 0 | black | `000` | 10 | dark grey | `333` |
| 1 | blue | `003` | 11 | light blue | `337` |
| 2 | green | `030` | 12 | light green | `373` |
| 3 | cyan | `033` | 13 | light cyan | `377` |
| 4 | red | `300` | 14 | light red | `733` |
| 5 | magenta | `303` | 15 | light magenta | `737` |
| 6 | brown | `320` | 16 | yellow | `770` |
| 7 | light grey | `555` | 17 | white | `777` |

Index 0 is black, so a cleared screen is black.

## 5. Time: frames

- A **vertical blank** happens every `frameCycles` CPU cycles after power-up. The default is
  **20000** (60 frames a second at 1.2 M cycles a second, about the speed of the original
  /40 with one cycle per bus access).
- At each vertical blank, in this order:
  1. The device **latches the frame**: it copies the page that `PAGE` selects, together with
     the palette, into the picture the host shows.
  2. `DSPFRM` goes up by 1.
  3. `DONE` is set.
  4. If `IE` is set, it requests an interrupt at vector `320`, level 4 (as the KW11-L, only at
     the blank. Setting `IE` while `DONE` is already set doesn't interrupt). Clearing `IE`
     withdraws a request that has not been taken yet.
- **What the student sees is exactly the memory at the blank.** Writes made during a frame
  show at the next blank, all at once. There is no tearing. A real raster display would tear,
  but tearing would make the picture depend on the host, so it is left out on purpose.
- **Double buffering:** draw on the page that is not shown, then flip `PAGE` and wait for the
  blank. The flip takes effect at the next blank, never in the middle of a frame.

  ```
  ; FLIP: show the page we just drew; R1 = the page to draw on next.
  FLIP:   BIT  #1, @#DSPCS        ; showing page 1?
          BNE  1$
          BIS  #1, @#DSPCS        ; no: show page 1 from the next blank
          MOV  #140000, R1        ; and draw on page 0
          BR   VSYNC
  1$:     BIC  #1, @#DSPCS        ; yes: show page 0
          MOV  #150000, R1        ; and draw on page 1
          BR   VSYNC              ; returns from VSYNC to our caller
  ```

- **Device rules** (`Device` in `devices.ts`): `nextEvent()` returns the cycles until the next
  blank, so a program that polls sees `DONE` on time. `wakeIn()` returns the same cycles when
  `IE` is set, and Infinity otherwise. `canWake()` is `IE`.
- **The line clock in the simulator** ticks once a frame (`KW11L(frameCycles)`), so it runs at
  60 Hz, like a real line clock.
- **The simulator's speed slider** changes how many frames the host runs per second of wall
  time, never `frameCycles`. A program therefore behaves the same at every speed.

## 6. Memory and the bus

- Pixel memory is an ordinary read / write window of 8 KB at `140000`–`157777` (configurable).
  It always answers, byte and word, and costs 1 cycle per access like RAM, with no wait states.
  Odd word addresses trap in the CPU as everywhere.
- The device is **two `Device`s sharing one state**: `display.memory` (the pixel window) and
  `display.control` (the registers). They are two devices because one `Device` covers a single
  address range.
- **Simulator memory map**, with RAM up to `137777` (`memory: 0o140000`):

  | Addresses | What |
  | :--- | :--- |
  | `000000`–`000377` | vectors (`320`: display) |
  | `000400`–`137777` | RAM (48 KB in total from 0) |
  | `140000`–`147777` | display page 0 |
  | `150000`–`157777` | display page 1 |
  | `160000`–`176577` | nothing: bus error |
  | `176600`–`176657` | display registers |
  | `176700`–… | keyboard registers (next spec) |
  | `177546` | line clock `LKS` |
  | `177560`–`177567` | console (DL11) |
  | `177776` | `PSW` |

- **The simulator's predefined names** (at most 6 characters): `SCREEN` = `140000`, `PAGE1` =
  `150000`, `DSPCS`, `DSPFRM`, `DSPPAL`, `DSPVEC` = `320`.

## 7. Reset

| | Power-up (`boot`) | `RESET` instruction |
| :--- | :--- | :--- |
| Pixel memory | cleared to 0 | kept |
| Palette | the table in §4 | kept |
| `DSPCS` | 0: page 0, `IE` and `DONE` clear | `IE` cleared; `PAGE` and `DONE` kept |
| `DSPFRM`, cycles to the next blank | 0, `frameCycles` | kept (the beam does not stop) |
| Latched frame | all black | kept |
| Pending interrupt | withdrawn | withdrawn |

## 8. Host side (library API, a sketch)

```ts
const display = new Display({
  memory: 0o140000,       // pixel window base (8 KB)
  base: 0o176600,         // registers
  vector: 0o320, level: 4,
  frameCycles: 20000,
});
const m = new SimpleMachine({ memory: 0o140000, clockCycles: 20000 });
m.add(display.memory).add(display.control);

display.onFrame = (f) => draw(f);   // called at each vertical blank
// f.pixels:  Uint8Array(4096), colour indexes 0–17 (already masked), row by row
// f.palette: Uint16Array(16), RGB 3-3-3
// f.number:  the DSPFRM value
display.frame;                      // the last latched frame (the same object)
rgb333to888(0o770);                 // [255, 255, 0]: integer table 0,44,111,155,222,266,333,377 (octal)
```

- The host runs the machine one frame at a time (`m.run(frameCycles)` per animation frame, or
  several frames when sped up), and paints `display.frame` after each run.
- `display.state()` / `display.load(state)` save and restore it as plain data: registers,
  palette, pixel memory, the latched frame and the cycles until the next blank. Rule 3 says
  "states survive JSON".
- Mistakes by the host throw at setup: a window that is not 8 KB-aligned, or one that overlaps
  RAM. Faults in the program are traps, as with every device.
- **Possible `SimpleMachine` option:** `display: true` sets this map and these defaults, so
  simple hosts don't repeat it. It is general (no host-specific behaviour), so it is allowed by
  rule 5.

## 9. Open questions for the owner

1. **Resolution.** 64 × 64 at a byte per pixel (this draft) is the easiest to teach and keeps
   the octal YYXX trick. 128 × 128 at 4 bits per pixel also fills 8 KB, but loses the trick,
   the second page and `MOVB`-per-pixel. *Recommendation:* 64 × 64 now, and 128 × 128 at 4 bpp
   later as **mode 1** (a `DSPCS` bit), as the "packing pixels" lesson.
2. **Colours:** 16 from a palette (this draft) or 256 (a fixed RGB 3-3-2 byte, no palette).
   *Recommendation:* 16. A palette teaches indirection, and palette cycling makes cheap
   animation.
3. **Speed:** `frameCycles` = 20000 by default? A lower value makes the cost of drawing more
   visible. A higher value is more forgiving.
4. **Tearing:** left out on purpose (§5). Should there be an option to show it, as an advanced
   lesson?
5. **A text mode** (a character ROM, 8 × 8 cells): out of scope for now. The console stays the
   place for text. Should the simulator include a small 8 × 8 font as a *program* example,
   instead of in hardware?

## 10. Tests (written first)

`tests/blue11/display.test.ts`:

- The address of (x, y) is `page + y*100 + x`. Byte and word writes and reads are
  little-endian, and the high 4 bits are kept in memory but masked in the frame.
- The latch: a write after a blank is not in `frame` until the next blank. `PAGE` changes take
  effect at the blank. The palette is latched with the pixels.
- `DONE` is set at each blank and cleared only by writing it as 0. `DSPFRM` counts and wraps.
  The high-byte write to `DSPCS` is ignored. The hole at `176604`–`176616` is a bus error, and
  the palette masks to 9 bits.
- Interrupts: at the blank only with `IE` set, withdrawn when `IE` is cleared, and `WAIT` wakes
  at the blank. A polling `VSYNC` loop sees `DONE` in the cycle of the blank (`nextEvent`).
- Power-up and `RESET` behave as in §7.
- `state()` → `JSON.stringify` → `load()` gives the same run. Two runs with the same program
  give the same frames.
- Example programs (`src/simulator/examples.ts`, checked by their latched frame instead of
  console text): a diagonal, a filled rectangle, a bouncing pixel with double buffering, and
  palette cycling.
- `readme-examples.test.ts`: the README's display section, with its code blocks run.
