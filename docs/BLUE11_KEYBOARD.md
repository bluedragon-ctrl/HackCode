# Blue-11 keyboard: keys for games (spec, not built)

Status: **draft for the owner's review** (2026-11-18). This device is part of the Blue-11
library and moves with it to its own repository (ROADMAP.md §1). Its first user is the
standalone simulator, together with the display ([`BLUE11_DISPLAY.md`](BLUE11_DISPLAY.md)).

## 1. Goals

The DL11 console already receives **typed text**: characters as the keyboard layout makes
them, one at a time, with auto-repeat. That is right for a command line, but games need two
things it cannot give:

- **Which keys are held down right now**, for example to move while an arrow key is held and
  stop when it is let go. The *key map* gives this, one byte per key (§4).
- **Every press and release, in order, so none is missed between two checks**: two keys
  pressed together, a short tap, letting go. The *event queue* gives this, with an interrupt
  (§5).

What it teaches:

- Polling versus interrupts.
- A queue and what happens when it overflows.
- The DEC register pattern again (`DONE`, `IE`, a buffer that is read once).
- Sign bits as flags: `BMI` means "released".
- The difference between a key (a position on the keyboard) and a character (what the layout
  makes of it).

The device follows the library's rules: deterministic, integers only, no DOM, and its state
survives JSON. The host turns browser events into calls on the device (§7).

**Not goals:** auto-repeat (the program decides itself what holding a key means), keyboard
layouts (the console handles typed text), and the mouse (perhaps a later device).

## 2. It departs from the original machine

DEC's terminals sent characters over a serial line, so there was no key-up and no "key held"
state. This is a **teaching device** in DEC's style: a CSR with `DONE` in bit 7, `IE` in bit 6
and an error bit in bit 15, plus a buffer register. It is listed in the library README's
"Where it departs from the real machine".

## 3. Key codes

A key code is 7 bits (`1`–`177`). It names a **key**, meaning a position on a US keyboard, not
the character the key types. For example, `Z` on a German keyboard has the code of `Y`, so
`WASD` controls stay in the same place on every layout. Code `0` means "no key".

Letters and digits have the codes of their ASCII characters, so the assembler's `'A` gives the
code of the A key.

| Code | Key | Code | Key |
| :--- | :--- | :--- | :--- |
| `0` | no key | `40` | Space |
| `1` | ↑ up | `47` `54` `55` `56` `57` | `'` `,` `-` `.` `/` |
| `2` | ↓ down | `60`–`71` | `0`–`9` |
| `3` | ← left | `73` `75` | `;` `=` |
| `4` | → right | `101`–`132` | `A`–`Z` |
| `5` | Shift (left or right) | `133` `134` `135` | `[` `\` `]` |
| `6` | Ctrl (left or right) | `140` | `` ` `` |
| `7` | Alt (left or right) | `177` | Delete |
| `10` | Backspace | | |
| `11` | Tab | | |
| `15` | Enter | | |
| `33` | Esc | | |

All other codes are unused and kept for later keys (§9). A modifier key has a single code for
both its left and right keys. It counts as down while either one is down: it is pressed when the
first goes down and released when the last comes up.

**The simulator's names** (at most 6 characters): `K.UP`, `K.DOWN`, `K.LEFT`, `K.RGHT`, `K.SHFT`,
`K.CTRL`, `K.ALT`, `K.BS`, `K.TAB`, `K.ENT`, `K.ESC`, `K.SPC`, `K.DEL`. Letters and digits need
no names, because `'A` and `'7` already give their codes.

## 4. The key map: which keys are down

The key map is **one byte per key**, read-only, at `177000`–`177177`. The byte for key k is at
`177000 + k`, so in octal the address ends with the key's code: the A key (`101`) is at
`177101`.

| Byte | Meaning |
| :--- | :--- |
| `200` | the key is down |
| `0` | the key is up, or the code is unused |

Bit 7 is the sign bit of a byte, so `TSTB` and `BMI` test a key with no mask and no shifts:

```
; Each frame: move the dot with the arrow keys, as long as they are held.
LOOP:   JSR  PC, VSYNC              ; once a frame (BLUE11_DISPLAY.md §4)
        TSTB @#KBDKEY+K.LEFT        ; ← down?
        BPL  1$
        DEC  R2                     ; x - 1
1$:     TSTB @#KBDKEY+K.RGHT        ; → down?
        BPL  2$
        INC  R2                     ; x + 1
2$:     TSTB @#KBDKEY+'Q            ; Q quits
        BPL  LOOP
        HALT
```

- **Bytes, not bits.** A bitmap would fit in 8 words, but testing key k in it needs `k/20` and
  `k%20` and a mask. One byte per key is the first thing to try. A bitmap is a good exercise for
  the student to build *from the event queue*.
- A word read returns two keys: the even code in the low byte, the odd one in the high byte.
  Writes are ignored, with no trap, as for other read-only registers. Reading has no side
  effects.
- **The key map shows what is down at the moment it is read.** A tap that starts and ends
  between two reads is never seen there. That is what the event queue is for, and the lesson
  of §5.

## 5. The event queue: every press and release

| Address | Name | Access | |
| :--- | :--- | :--- | :--- |
| `176700` | `KBDCS` | read / write | control and status |
| `176702` | `KBDBUF` | read only | the oldest event |
| `176704`–`176777` | | | hole: bus error (trap 4) |

**`KBDCS`**

| Bit | Name | |
| :--- | :--- | :--- |
| 6 | `IE` | interrupt when an event is waiting in `KBDBUF` |
| 7 | `DONE` | an event is waiting in `KBDBUF`. Read-only, cleared by reading `KBDBUF` |
| 15 | `OVR` | the queue overflowed and events were lost. It stays set until it is written as 0 (`BIC #100000, @#KBDCS`). Writing 1 has no effect |
| others | | read as 0, writes ignored |

**`KBDBUF`**

| Bits | |
| :--- | :--- |
| 6–0 | the key code |
| 7 | **1: released**, 0: pressed |
| 15–8 | 0 |

- `MOVB @#KBDBUF, R0` sign-extends the byte, so **a release is negative**. `BMI` branches on a
  release, and `BIC #177600, R0` leaves only the code.
- Reading `KBDBUF` takes the event out of the queue. If another event is waiting, it moves into
  `KBDBUF` and `DONE` is set again at once. Reading with nothing waiting returns 0 ("no key").
  These are the DL11's `RBUF` rules. A byte read has the same effects, because the bus reads
  whole words.
- **The queue holds 16 events.** An event that arrives when the queue is full is dropped and
  `OVR` is set. The key map is always correct, even when events are lost.

```
; Wait for a key press and return its code in R0; releases are skipped.
GETKEY: TSTB @#KBDCS                ; DONE: an event waiting?
        BPL  GETKEY
        MOVB @#KBDBUF, R0           ; take it
        BMI  GETKEY                 ; a release: not what we want
        RTS  PC
```

**Interrupts** follow the DL11's receiver. Vector `330` and level 4 are the defaults and can be
changed.

- A request is made whenever `DONE` and `IE` are both set: when an event arrives, when `IE` is
  set while an event is already waiting, and when reading `KBDBUF` brings up the next event.
- The request is withdrawn when `KBDBUF` is read and nothing is left, or when `IE` is cleared.
- `WAIT` sleeps until the next event when `IE` is set (`canWake()` is `IE`).

```
; The handler at vector 330: count every press of Space.
KBDINT: MOVB @#KBDBUF, R0           ; taking the event withdraws the request
        CMPB R0, #K.SPC             ; Space pressed? (a release is 240, which differs)
        BNE  1$
        INC  COUNT                  ; COUNT: a word in the program
1$:     RTI                         ; if another event is waiting, it interrupts again
```

## 6. Reset

| | Power-up (`boot`) | `RESET` instruction |
| :--- | :--- | :--- |
| Key map | all up | kept: keys are still physically down |
| Queue, `DONE` | empty, clear | kept |
| `IE`, `OVR` | clear | `IE` cleared, `OVR` kept |
| Pending interrupt | withdrawn | withdrawn |

A key held down during power-up reads as up until it is released and pressed again. The host
sends no events for keys that were already down.

## 7. Host side

```ts
const kbd = new Keyboard({ base: 0o176700, map: 0o177000, vector: 0o330, level: 4, queue: 16 });
m.add(kbd.registers).add(kbd.map);         // two ranges, one state (like the display)

kbd.press(KEY.LEFT);                       // now, at m.cycles; also kbd.release(code)
kbd.at(cycle, code, down);                 // at a given cycle (replays and tests)
kbd.log;                                   // [{ cycle, code, down }], every event applied
keyCode('KeyA');                           // 0o101: a browser KeyboardEvent.code → key code, or 0
```

- **`keyCode` is a table of strings**, so it lives in the library without touching the DOM.
  Reading browser events (`keydown` / `keyup`) is the simulator's job.
- `press` of a key that is already down, and `release` of a key that is up, are ignored. The
  browser's auto-repeat `keydown` events (`event.repeat`) are never passed on.
- **Replays are exact.** An event takes effect at the first instruction boundary at or after its
  cycle, and `log` records the cycle at which it took effect. Live input arrives between runs, at
  `m.cycles`, which is an instruction boundary. Scheduling every logged event with `at` before a
  run therefore gives the same run, cycle for cycle. `nextEvent()` returns the cycles until the
  next scheduled event, so the CPU stops there. A sleeping CPU wakes there (`wakeIn()`). `at`
  with a cycle in the past throws, because that is a host mistake.
- `state()` and `load(state)` save and restore the key map, the queue, the registers and the
  scheduled events as plain data (library rule 3).

### 7.1 In the simulator page

- **Focus.** Keys go to the program only while the **screen or the console has focus**. This is
  shown by a highlighted frame and the label "keyboard → program". Clicking the editor, or the
  Pause button, gives the keys back to the page. While the program has focus, keys it uses are
  kept from the browser (`preventDefault`): arrows, Space, Tab, Backspace. Shortcuts with Ctrl
  or Meta (Cmd) stay with the browser, and the Meta key itself is never passed on.
- **Losing focus releases every key.** On blur, the page sends a release for each key that is
  down, so no key stays stuck down.
- **Both devices see a key.** A key that types a character goes to the DL11 console as that
  character (with the layout and auto-repeat), and also to the keyboard as a press and a
  release. A program uses whichever it needs: the console for text, the keyboard for play.
- **The input log** (key events and console characters, each with its cycle) is saved with a
  replay. Share links carry the program and the options, not the input.

## 8. Memory map (in the simulator)

| Addresses | What |
| :--- | :--- |
| `176700`–`176703` | `KBDCS`, `KBDBUF` |
| `176704`–`176777` | hole: bus error |
| `177000`–`177177` | `KBDKEY`: the key map |
| vector `330` | keyboard |

The rest of the map is in [`BLUE11_DISPLAY.md`](BLUE11_DISPLAY.md) §6. The simulator's names are
`KBDCS`, `KBDBUF`, `KBDKEY` = `177000`, `KBDVEC` = `330`, and the `K.` names of §3.

## 9. Open questions for the owner

1. **More keys:** F1–F10, Home, End, Page Up and Down, and Insert, in the free codes `141`–`176`?
   Browsers keep some of them for themselves (F5, F11, F12). *Recommendation:* not in v1. The keys
   above are enough for games and menus, and every one of them works in a browser.
2. **A byte per key** (this draft) or a bitmap of 8 words? *Recommendation:* bytes, for the
   reasons in §4.
3. **The queue's length:** 16 events? *Recommendation:* 16. It is small enough to overflow in an
   exercise and large enough for normal play at one read per frame.
4. **Console and keyboard both** receive a key (§7.1)? *Recommendation:* yes. The other choice, a
   switch between "text" and "game" input, is one more thing students would have to understand.
5. **A mouse** (position and buttons, in the same style)? *Recommendation:* later, as its own
   device, if students ask for it.

## 10. Tests (written first)

`tests/blue11/keyboard.test.ts`:

- **Codes.** `keyCode` maps every `KeyboardEvent.code` in §3 (both Shift, Ctrl and Alt keys to
  one code each) and returns 0 for anything else. `'A` equals `keyCode('KeyA')`.
- **The key map.** Press sets the byte to `200` and release sets it to 0. `TSTB` / `BMI` works on
  it. A word read gives two keys, writes are ignored, and reading has no side effects. A
  modifier stays down while either of its keys is down.
- **The queue.** Events come out in order with bit 7 set for releases. Reading `KBDBUF` clears
  `DONE`, or brings up the next event, and returns 0 when empty. The 17th event is dropped and
  sets `OVR`, and `OVR` is cleared only by writing 0. A repeated press or release is ignored.
  The hole is a bus error.
- **Interrupts.** A request is made on arrival with `IE`, on setting `IE` while `DONE` is set, and
  for the next event after a read. It is withdrawn when the queue empties or `IE` is cleared.
  `WAIT` wakes on an event.
- **Reset.** Power-up and `RESET` behave as in §6.
- **Replay.** A live run (events between runs) and a run with the same `log` scheduled by `at`
  give the same registers, memory and cycles. `at` in the past throws. `state()` →
  `JSON.stringify` → `load()` gives the same run.
- **Example programs** (`src/simulator/examples.ts`, driven by scheduled events):
  - A dot moved with the arrows, using the key map.
  - `GETKEY` printing key names to the console.
  - A Space counter, using the interrupt.
  - A tap shorter than a frame: missed by the key map, caught by the queue.
- **README.** `readme-examples.test.ts` runs the code blocks of the README's keyboard section.
