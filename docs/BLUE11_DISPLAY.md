# Blue-11 display: a memory-mapped graphics device (spec, not built)

Status: **decided, not built** (2026-11-18). This device is part of the Blue-11
library, not of HackCode, and moves with the library to its own repository (ROADMAP.md §1).
Its first user is the standalone simulator for students. HackCode may add it later but does
not need it.

**Owner decisions:**

- 2026-11-18: the display supports both 64 × 64 and 128 × 128 pixels: modes 0 and 1 (§3).
- 2026-11-18: 16 colours from a palette (§4), and 20000 cycles per frame (§5).
- 2026-11-18: tearing is available as an option, the *scanning beam* (§5.1).
- 2026-11-18: there is no text mode. Instead, an 8 × 8 font sits in the simulator's ROM, together
  with routines that draw characters, as readable source that students can study and copy (§11).

The companion devices are already built: the DL11 console and the KW11-L line clock
(`src/blue11/devices.ts`). The keyboard is specified in [`BLUE11_KEYBOARD.md`](BLUE11_KEYBOARD.md).

## 1. Goals

- **A first graphics lesson in a few lines:** a pixel is a byte in memory, so
  `MOVB #4, @#120000` draws one. The address gives the position without any arithmetic.
- **A second, harder resolution:** mode 1 has four times the pixels, two in each byte. Packing
  pixels with `BICB` / `BISB` and shifts becomes the lesson.
- **Ideas it teaches:** memory-mapped I/O, address arithmetic, row stride, word versus byte
  writes, little-endian order, waiting for vertical blank, double buffering, palettes, and
  what filling a screen costs in cycles.
- **Small:** two modes that follow the same rules, so the whole device fits on one help page.
- **It follows the library's rules** (`src/blue11/AGENTS.md`): deterministic, integers only, no
  DOM, and its state survives JSON. The library keeps only the pixels. The host draws them.

**Not goals:** sprites, hardware scrolling, line drawing, a hardware text mode, or blitting. A
program does these itself, and that is the lesson. For text, the simulator's ROM has a font and
the routines that draw it, written in Blue-11 so students can read them (§11).

## 2. Not like the original machine

DEC made no simple framebuffer for the PDP-11. Its display, the VT11, was a vector display
processor and too complex for a first lesson. The Blue-11 display is a **teaching device**
that only borrows DEC's conventions: a CSR with `DONE` in bit 7 and `IE` in bit 6, a vector,
and a bus level. When it is built, the library README lists it under "Where it departs from
the real machine" (library rule 6).

## 3. Modes

Pixel memory is one **16 KB window** at `120000`–`157777`. The window is divided into pages,
and each mode gives **every resolution at least two pages**, so double buffering works the
same way in both modes.

| Mode | Resolution | Pixel | Row | Page | Pages at |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | **64 × 64** (`100` × `100`) | 1 byte | `100` bytes | 4 KB | `120000`, `130000`, `140000`, `150000` |
| **1** | **128 × 128** (`200` × `200`) | 4 bits, two per byte | `100` bytes | 8 KB | `120000`, `140000` |

In both modes, a pixel's colour is `palette[index]`, with index 0–17 (§4). Rows run top to
bottom, and pixels left to right within a row.

### Mode 0: a byte per pixel

**Address of (x, y):** `page + y*100 + x`. Each coordinate is two octal digits, so the row
and column can be read straight off the octal address:

```
        1 2 Y Y X X        page 0: 120000 + y*100 + x
        1 3 Y Y X X        page 1: 130000 + …
```

Pixel (x = 12, y = 34) on page 0 is at `123412`. One row down adds `100`, one pixel right adds
`1`, so a diagonal is `ADD #101, R1` in a loop. This is the strongest argument for octal a
student will meet.

- **Only the low 4 bits pick the colour:** index = `byte & 17`. The high 4 bits are stored and
  read back as written, but the display ignores them. A program may use them as its own flags,
  such as "visited" in a flood fill.
- **Words are two pixels.** The bus is little-endian, so a word write fills pixel x with the
  low byte and pixel x+1 with the high byte. To paint two pixels with colour 3, use
  `MOV #1403, (R1)+`, because `3*400 + 3 = 1403`.
- **Cost:** clearing a page is 2048 word writes. `CLR (R1)+` with `SOB` takes 3 cycles a word,
  so about 6 K cycles, roughly a third of a frame at the default speed (§5).

### Mode 1: two pixels per byte

**Address of (x, y):** `page + y*100 + x/2`. A row is still `100` bytes, so going down a row
is still `ADD #100`. Within the byte, **even x is the low half** (bits 3–0) and **odd x is the
high half** (bits 7–4). This is the same little-endian rule as words: the lower address and
the lower bits come first.

```
; PLOT1: set pixel (R2 = x, R3 = y) to colour R0 (0–17) in mode 1, on the page at R1.
PLOT1:  MOV  R3, R4
        SWAB R4                 ; y * 400 (y is less than 200, so it fits)
        ASR  R4
        ASR  R4                 ; y * 100: the row's offset
        ADD  R1, R4             ; + the page
        MOV  R2, R5
        ASR  R5                 ; x / 2: the byte in the row
        ADD  R5, R4             ; R4 = the byte's address
        BIT  #1, R2             ; odd x?
        BNE  1$
        BICB #17, (R4)          ; even x: replace the low half
        BISB R0, (R4)
        RTS  PC
1$:     BICB #360, (R4)         ; odd x: replace the high half
        MOV  R0, R5
        ASL  R5
        ASL  R5
        ASL  R5
        ASL  R5                 ; the colour moved to bits 7–4
        BISB R5, (R4)
        RTS  PC
```

- **Fill one colour quickly:** a byte with the same colour in both halves is `c*21` (octal).
  Colour 3 is `063`, and a word of four such pixels is `MOV #31463, (R1)+`.
- **Cost:** clearing a page is 4096 word writes, about 12 K cycles, or 60 % of a frame. Four
  times the pixels cost four times the work. Students feel this, and it motivates word writes
  and drawing only what changed.

### Switching modes

`MODE` in `DSPCS` (§4) takes effect at the next vertical blank, like `PAGE`. **Memory is not
cleared:** the same bytes are simply read the other way. A picture drawn in mode 0 and shown
in mode 1 is a quick way to see how each mode lays out memory.

## 4. Registers

The registers start at `176600`, which is free in both HackCode and the simulator, and can be
moved. The vector is `320` and the level is 4; both can be changed.

| Address | Name | Access | |
| :--- | :--- | :--- | :--- |
| `176600` | `DSPCS` | read / write | control and status (below) |
| `176602` | `DSPFRM` | read only | frame counter: +1 at every vertical blank, wraps at 16 bits |
| `176604` | `DSPLIN` | read only | the beam: the row it reads next (0–77 or 0–177), or `177777` during the vertical blank (§5.1) |
| `176606`–`176616` | | | hole: bus error (trap 4) |
| `176620`–`176656` | `DSPPAL` | read / write | 16 palette words; entry *n* at `176620 + 2n` |

**`DSPCS`**

| Bits | Name | |
| :--- | :--- | :--- |
| 1–0 | `PAGE` | the page shown from the next vertical blank on. Mode 0: 0–3. Mode 1: 0–1 (bit 1 is stored but ignored) |
| 2 | `MODE` | 0: 64 × 64; 1: 128 × 128. Takes effect from the next vertical blank on |
| 3 | | kept for a later mode: reads as 0, writes ignored |
| 6 | `IE` | interrupt at every vertical blank |
| 7 | `DONE` | set at every vertical blank. Cleared by writing it as 0; writing 1 leaves it unchanged (like the KW11-L's `LKS`) |
| others | | read as 0, writes ignored. A byte write to the high byte is ignored |

`BIC #200, @#DSPCS` clears `DONE` and keeps everything else, so the usual wait is:

```
; VSYNC: wait for the next vertical blank.
VSYNC:  BIC  #200, @#DSPCS      ; forget a blank we may already have seen
1$:     TSTB @#DSPCS            ; DONE? (bit 7 is the sign of the low byte)
        BPL  1$                 ; not yet
        RTS  PC
```

**Palette words.** Bits 8–6 are red, 5–3 green and 2–0 blue, each 0–7, so a palette value reads
as three octal digits `RGB`: `700` is red, `070` green, `007` blue, `770` yellow, `777` white.
Bits 15–9 read as 0 and ignore writes. A byte write to the high byte changes only bit 8 (the top
bit of red). Both modes use the same 16 entries.

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

Index 0 is black, so a cleared screen is black in both modes.

## 5. Time: frames

- A **vertical blank** comes every `frameCycles` CPU cycles after power-up. The default is
  **20000**: 60 frames a second at 1.2 M cycles a second, about the speed of the original /40
  with one cycle per bus access. The rate is the same in both modes.
- At each vertical blank, in this order:
  1. The device **latches the frame**: it copies the page `PAGE` selects, read the way `MODE`
     says, together with the palette, into the picture the host shows.
  2. `DSPFRM` goes up by 1.
  3. `DONE` is set.
  4. If `IE` is set, the device requests an interrupt at vector `320`, level 4. As on the KW11-L,
     this happens only at the blank: setting `IE` while `DONE` is already set does not interrupt.
     Clearing `IE` withdraws a request that has not been taken yet.
- **By default, the student sees exactly what memory held at the blank** (the *instant* beam).
  Writes made during a frame all appear at the next blank, so there is no tearing. A real raster
  display tears; the *scanning* beam (§5.1) shows that, as an option.
- **Double buffering:** draw on a page that is not shown, flip `PAGE`, then wait for the blank.
  The flip takes effect at the blank, never in the middle of a frame. Mode 0 with pages 0 and 1:

  ```
  ; FLIP: show the page we just drew; R1 = the page to draw on next.
  FLIP:   BIT  #1, @#DSPCS        ; showing page 1?
          BNE  1$
          BIS  #1, @#DSPCS        ; no: show page 1 from the next blank on
          MOV  #120000, R1        ; and draw on page 0
          BR   VSYNC
  1$:     BIC  #1, @#DSPCS        ; yes: show page 0
          MOV  #130000, R1        ; and draw on page 1
          BR   VSYNC              ; VSYNC returns to our caller
  ```

  The same routine works in mode 1 with `140000` in place of `130000`, the size of its page.
- **Device rules** (`Device` in `devices.ts`): `nextEvent()` returns the cycles until the next
  blank, so a polling program sees `DONE` on time. `wakeIn()` returns the same number when `IE`
  is set, otherwise Infinity. `canWake()` is `IE`.
- **The line clock in the simulator** ticks once per frame (`KW11L(frameCycles)`), so it runs at
  60 Hz, like a real line clock.
- **The simulator's speed slider** changes how many frames the host runs per second of wall
  time, never `frameCycles`, so a program behaves the same at every speed.

### 5.1 The scanning beam: tearing, as an option

A real raster display reads memory row by row while the program goes on writing to it. If the
program draws on the page being shown, the top of the picture can come from one state and the
bottom from another: this is **tearing**. With the host option `beam: 'scan'` the device behaves
like that. The default, `beam: 'instant'`, does not tear.

- **The beam's timing is the same in both settings.** A frame of `frameCycles` cycles starts
  with the **vertical blank**, which lasts `blankCycles` cycles (default `frameCycles / 8`,
  2500). During the blank the beam reads nothing. After it, the beam reads the H rows (64 or 128)
  evenly over the rest of the frame: row r at cycle `blankCycles + floor(r * (frameCycles -
  blankCycles) / H)` after the start of the blank. `DSPLIN` shows where the beam is in either
  setting.
- **Instant beam (default):** the whole page and the palette are latched at the start of the
  blank (§5). `DSPLIN` is only information.
- **Scanning beam:** each row is latched **when the beam reads it**, with the palette as it is at
  that moment. The picture composed this way is handed to the host at the next blank. `PAGE`
  and `MODE` are still latched only at the blank, so a picture never mixes two pages.
- **What it teaches:**
  - *Draw during the blank.* After `VSYNC`, the program has `blankCycles` cycles before the beam
    reaches row 0. A small change done in that time never tears.
  - *Double buffering solves tearing.* Drawing on the hidden page never tears, however long it
    takes.
  - *Racing the beam.* Changing a palette entry when `DSPLIN` reaches a row gives a different
    colour from that row on, for sky gradients and stripes: a classic trick, and timing to the
    cycle.
- **Rules.** In the scanning setting, `nextEvent()` returns the cycles until the next row read,
  so the CPU stops for each row and the latch sees memory as it was at that cycle. The CPU only
  stops between instructions, so a row is latched up to one instruction late. Because of this,
  a picture depends only on the program and the options, never on the host. The machine stops
  once per row, at most 128 times a frame: cheap.
- **The setting is part of the machine,** like `frameCycles`. The simulator has a "Real beam
  (tearing)" switch, saved with the program, in share links and in replays.

## 6. Memory and the bus

- Pixel memory is an ordinary 16 KB read / write window at `120000`–`157777`, and its base can
  be moved. It always answers, to bytes and words, and costs 1 cycle per access, like RAM, with
  no wait states. Odd word addresses trap in the CPU, as everywhere else. The window is the same
  in every mode: only the way the display reads it changes.
- The device is **two `Device`s sharing one state**: `display.memory` (the pixel window) and
  `display.control` (the registers), because one `Device` covers only one address range.
- **The simulator's memory map**, with RAM up to `117777` (`memory: 0o120000`):

  | Addresses | What |
  | :--- | :--- |
  | `000000`–`000377` | vectors (`320`: display) |
  | `000400`–`117777` | RAM (40 KB in total from 0) |
  | `120000`–`157777` | display memory (mode 0: pages 0–3; mode 1: pages 0–1) |
  | `160000`–`167777` | ROM: the font and the drawing routines (§11). Writes trap to 4 |
  | `170000`–`176577` | nothing: bus error |
  | `176600`–`176657` | display registers |
  | `176700`–`176703` | keyboard registers ([`BLUE11_KEYBOARD.md`](BLUE11_KEYBOARD.md)) |
  | `177000`–`177177` | keyboard: one byte per key |
  | `177546` | line clock `LKS` |
  | `177560`–`177567` | console (DL11) |
  | `177776` | `PSW` |

- **The simulator's predefined names** (at most 6 characters): `SCREEN` = `120000`, `DSPCS`,
  `DSPFRM`, `DSPLIN`, `DSPPAL`, `DSPVEC` = `320`, and the ROM's names `FONT`, `DRAWCH`, `DRAWC1`
  (§11).

## 7. Reset

| | Power-up (`boot`) | `RESET` instruction |
| :--- | :--- | :--- |
| Pixel memory | cleared to 0 | kept |
| Palette | the table in §4 | kept |
| `DSPCS` | 0: mode 0, page 0, `IE` and `DONE` clear | `IE` cleared; `MODE`, `PAGE` and `DONE` kept |
| `DSPFRM`, the beam (`DSPLIN`) | 0; a new frame starts (in the blank) | kept (the beam doesn't stop) |
| Latched frame | all black, 64 × 64 | kept |
| Pending interrupt | withdrawn | withdrawn |

## 8. Host side (library API, a sketch)

```ts
const display = new Display({
  memory: 0o120000,       // pixel window base (16 KB, 16 KB-aligned)
  base: 0o176600,         // registers
  vector: 0o320, level: 4,
  frameCycles: 20000,
  blankCycles: 2500,      // default frameCycles / 8
  beam: 'instant',        // or 'scan': rows latched as the beam reads them (§5.1)
});
const m = new SimpleMachine({ memory: 0o120000, clockCycles: 20000 });
m.add(display.memory).add(display.control);

display.onFrame = (f) => draw(f);   // called at each vertical blank
// f.width, f.height: 64 or 128 (the mode latched with this frame)
// f.pixels:  Uint8Array(width * height), colour indexes 0–17, row by row
// f.palette: Uint16Array(16), RGB 3-3-3
// f.number:  the DSPFRM value
display.frame;                      // the last latched frame (the same object)
rgb333to888(0o770);                 // [255, 255, 0]; each 0–7 maps through 0,44,111,155,222,266,333,377 (octal)
```

- The host runs the machine one frame at a time (`m.run(frameCycles)` per animation frame, or
  several runs when sped up) and paints `display.frame` after each run. The canvas keeps the same
  size in both modes: a mode-0 pixel is drawn twice as large as a mode-1 pixel.
- `display.state()` and `display.load(state)` save and restore the device as plain data:
  registers, palette, pixel memory, the latched frame and the cycles until the next blank. This
  follows library rule 3, "states survive JSON".
- Mistakes by the host throw at setup, for example a window that is not aligned to 16 KB or one
  that overlaps RAM. Faults in the program are traps, as with every device.
- **A possible `SimpleMachine` option:** `display: true` sets this map and these defaults, so
  simple hosts need not repeat them. It is general and not host-specific, so rule 5 allows it.

## 9. Decisions

All answered by the owner on 2026-11-18:

- **Resolution:** both 64 × 64 and 128 × 128, as modes 0 and 1 (§3). **No third mode for now**
  (such as 128 × 128 at 1 bit per pixel). `MODE` keeps bit 3 free for one.
- **Colours:** 16 from a palette.
- **Speed:** 20000 cycles per frame.
- **Tearing:** available as an option (§5.1).
- **Text:** a font in ROM (§11).
- **RAM:** 40 KB in the simulator is enough. A host that wants more can put the window elsewhere.
- **The font's glyphs:** start from a public-domain 8 × 8 font. Its licence line goes in the ROM
  source. Nothing is copied from a proprietary ROM.
- **`DRAWCH`:** paints only the glyph's pixels. Clearing a cell first is an exercise.
- **The ROM:** only text. Plotting and lines are the students' own first programs.

## 10. Tests (written first)

`tests/blue11/display.test.ts`:

- **Addresses.** Mode 0: (x, y) is at `page + y*100 + x`, pages are `10000` apart, and the high 4
  bits are kept in memory but masked in the frame. Mode 1: (x, y) is at `page + y*100 + x/2`,
  even x in the low half, and pages are `20000` apart. Byte and word access is little-endian in
  both modes.
- **The latch.** A write after a blank is not in `frame` until the next blank. `PAGE` and `MODE`
  changes take effect at the blank. The palette is latched with the pixels. The same memory
  shown in mode 0 and then mode 1 gives the expected two pictures. In mode 1, bit 1 of `PAGE` is
  ignored.
- **The registers.** `DONE` is set at each blank and cleared only by writing it as 0. `DSPFRM`
  counts and wraps. Bit 3 and a write to the high byte of `DSPCS` are ignored. The hole at
  `176606`–`176616` is a bus error. Palette values are masked to 9 bits. `DSPLIN` reads
  `177777` during the blank and then the row the beam reads next, at the cycles of §5.1, in both
  modes.
- **Interrupts.** Only at the blank, only with `IE` set, and withdrawn when `IE` is cleared.
  `WAIT` wakes at the blank. A polling `VSYNC` loop sees `DONE` in the cycle of the blank
  (`nextEvent`).
- **The scanning beam.** A write to row r before the beam reaches it shows in this frame, and one
  after shows in the next. Drawing on the shown page while the beam passes gives the expected
  torn picture. A palette change at row r colours rows r onwards. A change made in the blank
  never tears. `PAGE` and `MODE` change only at the blank. The instant beam gives the same
  pictures as before for every example.
- **Reset.** Power-up and `RESET` behave as in §7.
- **State.** `state()` → `JSON.stringify` → `load()` gives the same run. Two runs of the same
  program give the same frames.
- **Example programs** (`src/simulator/examples.ts`), checked by their latched frame instead of
  console text: a diagonal and a filled rectangle in mode 0, a bouncing pixel with double
  buffering, `PLOT1` drawing a circle in mode 1, palette cycling, and a sky gradient by racing
  the beam (scanning beam).
- **README.** `readme-examples.test.ts` runs the code blocks in the README's display section.
- **`Rom`** (`tests/blue11/devices.test.ts`): reads what was loaded, a write is a bus error
  (trap 4), and a load that doesn't fit throws.
- **The simulator's ROM** (in the simulator's tests): it assembles without errors or warnings,
  and its jump table and `FONT` are at the addresses in §11. `DRAWCH` and `DRAWC1` draw `A`
  exactly as its glyph bits say, paint glyph pixels only, move R1 to the next cell and keep the
  other registers. Every printable character (`40`–`176`) except the space has at least one pixel
  set. The cycles for one character are pinned, so a change in cost is seen.

## 11. Text: an 8 × 8 font in ROM (the simulator)

There is no text mode in the hardware. The simulator has a **ROM** with a font and two short
routines that draw it. They are written in Blue-11 and their source is shown in the simulator
(a "ROM" tab with the listing), so students can see how text on a bitmap display works, call the
routines, and then copy them into their own programs and change them.

- **What goes where.** The library gets a general **`Rom` device**: read-only memory whose
  contents the host loads, where writes are bus errors (trap 4). This is HackCode's
  `Rom` (`src/core/robot.ts`) made general, with its base and size as options, and HackCode then
  uses it. The ROM's *contents* (the font and the routines) belong to the simulator, not the
  library (library rule 5): its source is `apps/simulator/rom.mac`, assembled when the page
  loads.
- **Layout** (`160000`–`167777`, 4 KB):

  | Address | Name | What |
  | :--- | :--- | :--- |
  | `160000` | `DRAWCH` | `JMP` to the mode 0 routine |
  | `160004` | `DRAWC1` | `JMP` to the mode 1 routine |
  | `160010`–`161777` | | the routines |
  | `162000`–`163777` | `FONT` | 128 characters × 8 bytes |
  | `164000`–`167777` | | free (kept for later) |

  The jump table keeps the entry points fixed even when the routines change.
- **The font.** Character c is at `FONT + c*10`: 8 bytes, the top row first, and **bit 7 is the
  leftmost pixel**. In octal, `c*10` is c with a 0 after it, so `A` (`101`) is at
  `162000 + 1010 = 163010`. Codes `40`–`176` are printable ASCII. Codes `0`–`37` and `177` are
  blank.
- **`DRAWCH`** (mode 0): R0 = the character, R1 = the address of the cell's top-left pixel, R2 =
  the colour. Only pixels where the glyph has a 1 are painted. On return, R1 points to the next
  cell to the right (+`10`), and the other registers are unchanged. A screen holds 8 × 8
  characters. This is the routine, as the ROM listing shows it:

  ```
  DRAWCH: MOV  R0, -(SP)
          MOV  R3, -(SP)
          MOV  R4, -(SP)
          MOV  R5, -(SP)
          BIC  #177600, R0        ; 0–177 only
          ASL  R0
          ASL  R0
          ASL  R0                 ; R0 * 10: the glyph's offset in the font
          ADD  #FONT, R0          ; R0 = the glyph's top row
          MOV  #10, R4            ; 8 rows
  1$:     MOVB (R0)+, R3          ; one row of the glyph: bit 7 is the leftmost pixel
          MOV  #10, R5            ; 8 pixels
  2$:     ASLB R3                 ; the next pixel into C
          BCC  3$                 ; 0: leave the pixel as it is
          MOVB R2, (R1)           ; 1: paint it
  3$:     INC  R1                 ; one pixel to the right
          SOB  R5, 2$
          ADD  #100-10, R1        ; one row down, back to the cell's left edge
          SOB  R4, 1$
          SUB  #1000-10, R1       ; back up 8 rows, and one cell to the right
          MOV  (SP)+, R5
          MOV  (SP)+, R4
          MOV  (SP)+, R3
          MOV  (SP)+, R0
          RTS  PC
  ```

  Calling it: `JSR PC, @#DRAWCH`. One character costs about 400 cycles (measured), so a full screen of 64
  characters takes about 1.3 frames. That is worth knowing, and a reason to redraw only the text
  that changed.
- **`DRAWC1`** (mode 1): the same arguments, but R1 is the address of the byte that holds the
  cell's top-left pixel (cells start at an even x). It has the same structure as `DRAWCH`, but
  each byte of the screen takes two glyph bits: the first goes into bits 3–0 and the second into
  bits 7–4. On return R1 has moved 4 bytes to the right. A screen holds 16 × 16 characters.
- **Showcase examples:**
  - *Hello* (`DRAWCH` in mode 0).
  - *Font viewer* (all 96 printable characters, mode 1).
  - *My own DRAWCH*: the routine copied into the program and changed to give every row of a
    glyph its own colour. It shows that the ROM is just code the student can read and rewrite.
- **The glyphs** are either drawn for Blue-11 or taken from a public-domain font, with the
  source and licence on the ROM source's first lines (§9). They are never copied
  from a proprietary ROM.
