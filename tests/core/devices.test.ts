/** Robot devices (DESIGN.md §5): common CSR behaviour, then each device. */
import { describe, expect, it } from 'vitest';
import {
  CHARGE_RATE, COST, CSR, ENERGY_MAX, ERR, FLAG, LASER_DAMAGE, loot, LOOT, OBJECTS, record, REG, TICKS, TYPE, VECTOR,
} from '../../src/core';
import { load, world } from './helpers';

/** Poll a CSR until READY, then halt. R0 = CSR, R1 = error register. */
const poll = (csr: string, err: string) => `
1$:     MOV @#${csr}, R0
        BIT #CS.RDY, R0
        BEQ 1$
        MOV @#${err}, R1
        HALT`;

describe('common CSR layout', () => {
  it('is READY with no error after power-up', () => {
    const w = world();
    for (const a of [REG.WHLCSR, REG.LSRCSR, REG.SCNCSR, REG.GRBCSR]) {
      expect(w.robot.machine.read(a, false)).toBe(CSR.READY);
      expect(w.robot.machine.read(a + 2, false)).toBe(0);
    }
  });

  it('GO clears READY; the action completes after its ticks; GO reads as 0', () => {
    const w = load(` MOV #WH.LFT!CS.GO, @#WHLCSR\n` + poll('WHLCSR', 'WHLERR'));
    expect(w.runTick().reason).toBe('tick');
    expect(w.robot.machine.read(REG.WHLCSR, false)).toBe(0o2); // function kept, not READY
    const r = w.run(10);
    expect(r.reason).toBe('halt');
    expect(w.tick).toBe(TICKS.TURN);
    expect(w.robot.cpu.r[0]).toBe(CSR.READY | 0o2);
    expect(w.robot.heading).toBe(0); // east → north
  });

  it('an action started in tick t completes at the end of tick t + K - 1', () => {
    // Start the turn late in the first tick: it still completes after TICKS.TURN boundaries.
    const w = load(`
        MOV #50., R2
2$:     SOB R2, 2$
        MOV #WH.RGT!CS.GO, @#WHLCSR` + poll('WHLCSR', 'WHLERR'));
    w.run(10);
    expect(w.tick).toBe(TICKS.TURN);
    expect(w.robot.heading).toBe(2);
  });

  it('GO while busy is ignored; IE can still change', () => {
    const w = load(`
        MOV #WH.LFT!CS.GO, @#WHLCSR
        MOV #WH.RGT!CS.GO!CS.IE, @#WHLCSR
        MOV @#WHLCSR, R0
        MOV #340, @#177776
1$:     BR 1$`);
    w.run(5);
    expect(w.robot.cpu.r[0]).toBe(0o2 | CSR.IE);
    expect(w.robot.heading).toBe(0); // one left turn only
  });

  it('interrupts at its vector when IE is set, at level 4', () => {
    const w = load(`
        MOV #DONE, @#WHLVEC
        MOV #340, @#WHLVEC+2
        MOV #WH.LFT!CS.GO!CS.IE, @#WHLCSR
        WAIT
        HALT
DONE:   MOV #1, R5
        MOV @#STHDG, R4
        RTI`);
    expect(w.run(10).reason).toBe('halt');
    expect(w.robot.cpu.r[5]).toBe(1);
    expect(w.robot.cpu.r[4]).toBe(0);
    expect(w.tick).toBe(TICKS.TURN);
    expect(VECTOR.WHEELS).toBe(0o300);
  });

  it('setting IE while READY requests an interrupt at once; clearing IE withdraws it', () => {
    const w = load(`
        MOV #340, @#177776     ; priority 7: hold interrupts
        MOV #DONE, @#SCNVEC
        MOV #340, @#SCNVEC+2
        MOV #CS.IE, @#SCNCSR
        CLR @#SCNCSR
        CLR @#177776           ; nothing pending any more
        MOV #CS.IE, @#SCNCSR   ; requested again, taken now
        HALT
DONE:   INC R5
        RTI`);
    w.run(2);
    expect(w.robot.cpu.r[5]).toBe(1);
  });

  it('a WAIT with nothing that can wake the robot freezes the world', () => {
    const w = load(' WAIT\n HALT');
    expect(w.run(10).reason).toBe('wait');
    expect(w.tick).toBe(0);
  });

  it('the error register and the CSR high byte take no writes; byte writes to the low byte work', () => {
    const w = load(`
        MOV #7, @#WHLERR
        MOVB #377, @#WHLCSR+1
        MOVB #WH.LFT!CS.GO, @#WHLCSR
        HALT`);
    w.run(1);
    expect(w.robot.machine.read(REG.WHLERR, false)).toBe(0);
    expect(w.robot.machine.read(REG.WHLCSR, false)).toBe(0o2);
  });

  it('a bad function fails at once with ERROR', () => {
    const w = load(` MOV #16!CS.GO, @#LSRCSR\n` + poll('LSRCSR', 'LSRERR'));
    w.run(1);
    expect(w.tick).toBe(0);
    expect(w.robot.cpu.r[0]).toBe(CSR.READY | CSR.ERROR | 0o16);
    expect(w.robot.cpu.r[1]).toBe(ERR.FUNCTION);
  });

  it('refuses with ERROR "no power" without enough energy; a new GO clears ERROR', () => {
    const w = load(` MOV #LS.FIR!CS.GO, @#LSRCSR\n` + poll('LSRCSR', 'LSRERR'), { robot: { x: 2, y: 2, heading: 1, energy: COST.LASER - 1 } });
    w.run(1);
    expect(w.robot.cpu.r[1]).toBe(ERR.POWER);
    expect(w.robot.cpu.r[0] & CSR.ERROR).toBeTruthy();
    expect(w.robot.energy).toBe(COST.LASER - 1);
  });

  it('RESET aborts actions and makes devices READY', () => {
    const w = load(`
        MOV #WH.FWD!CS.GO, @#WHLCSR   ; count 0: fails at once…
        MOV #3, @#WHLCNT
        MOV #WH.FWD!CS.GO, @#WHLCSR   ; …this one runs
        RESET
        MOV @#WHLCSR, R0
1$:     BR 1$`);
    w.run(20);
    expect(w.robot.cpu.r[0]).toBe(CSR.READY);
    expect(w.robot.x).toBe(2);
  });
});

describe('wheels', () => {
  it('drives forward N cells, one cell every TICKS.MOVE ticks; WHLCNT counts down', () => {
    const w = load(`
        MOV #3, @#WHLCNT
        MOV #WH.FWD!CS.GO, @#WHLCSR` + poll('WHLCSR', 'WHLERR'));
    const xs: number[] = [];
    const counts: number[] = [];
    for (let t = 0; t < 3 * TICKS.MOVE; t++) {
      w.runTick();
      xs.push(w.robot.x);
      counts.push(w.robot.machine.read(REG.WHLCNT, false));
    }
    expect(xs).toEqual([2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5]);
    expect(counts).toEqual([3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 0]);
    expect(w.runTick().reason).toBe('halt');
    expect(w.robot.cpu.r[1]).toBe(0);
    expect(w.robot.energy).toBe(ENERGY_MAX - 3 * COST.MOVE - w.robot.cpuEnergyUsed);
  });

  it('moves the robot record on the occupant layer', () => {
    const w = load(` MOV #1, @#WHLCNT\n MOV #WH.FWD!CS.GO, @#WHLCSR\n` + poll('WHLCSR', 'WHLERR'));
    w.run(10);
    expect(w.grid.typeAt('occupant', 2, 2)).toBe(0);
    expect(w.grid.get('occupant', 3, 2)).toEqual({ type: TYPE.ROBOT, hp: 100, flags: FLAG.MOBILE | FLAG.SOLID | FLAG.OPAQUE, loot: 0 });
  });

  it('stops with ERROR "blocked" at an occupant or the edge; WHLCNT keeps the cells left', () => {
    const w = load(` MOV #5, @#WHLCNT\n MOV #WH.FWD!CS.GO, @#WHLCSR\n` + poll('WHLCSR', 'WHLERR'));
    w.grid.set('occupant', 4, 2, OBJECTS.wall());
    w.run(50);
    expect(w.robot.x).toBe(3);
    expect(w.robot.cpu.r[1]).toBe(ERR.BLOCKED);
    expect(w.robot.machine.read(REG.WHLCNT, false)).toBe(4);
    expect(w.tick).toBe(2 * TICKS.MOVE);

    const e = load(` MOV #5, @#WHLCNT\n MOV #WH.FWD!CS.GO, @#WHLCSR\n` + poll('WHLCSR', 'WHLERR'), { robot: { x: 10, y: 2, heading: 1 } });
    e.run(50);
    expect(e.robot.x).toBe(11);
    expect(e.robot.cpu.r[1]).toBe(ERR.BLOCKED);
  });

  it('floor items do not block', () => {
    const w = load(` MOV #2, @#WHLCNT\n MOV #WH.FWD!CS.GO, @#WHLCSR\n` + poll('WHLCSR', 'WHLERR'));
    w.grid.set('floor', 3, 2, OBJECTS.coins(1));
    w.run(50);
    expect(w.robot.x).toBe(4);
  });

  it('backs up without turning', () => {
    const w = load(` MOV #2, @#WHLCNT\n MOV #WH.BAK!CS.GO, @#WHLCSR\n` + poll('WHLCSR', 'WHLERR'));
    w.run(50);
    expect([w.robot.x, w.robot.heading]).toEqual([0, 1]);
  });

  it('turns left and right through all headings', () => {
    const w = load(`
        MOV #4, R3
1$:     MOV #WH.RGT!CS.GO, @#WHLCSR
2$:     TSTB @#WHLCSR
        BPL 2$
        MOV @#STHDG, (R4)+
        SOB R3, 1$
        HALT`);
    w.robot.cpu.r[4] = 0o2000;
    w.run(50);
    const m = w.robot.machine;
    expect([0, 2, 4, 6].map((o) => m.read(0o2000 + o, false))).toEqual([2, 3, 0, 1]);
  });

  it('count 0 is a bad argument', () => {
    const w = load(` MOV #WH.FWD!CS.GO, @#WHLCSR\n` + poll('WHLCSR', 'WHLERR'));
    w.run(1);
    expect(w.robot.cpu.r[1]).toBe(ERR.ARGUMENT);
  });

  it('runs out of power mid-move', () => {
    // Interrupt-driven, so the CPU drains (almost) nothing while waiting.
    const w = load(`
        MOV #DONE, @#WHLVEC
        MOV #340, @#WHLVEC+2
        MOV #5, @#WHLCNT
        MOV #WH.FWD!CS.GO!CS.IE, @#WHLCSR
        WAIT
        HALT
DONE:   MOV @#WHLERR, R1
        RTI`, { robot: { x: 2, y: 2, heading: 1, energy: 2 * COST.MOVE + 1 } });
    w.run(50);
    expect(w.robot.x).toBe(4);
    expect(w.robot.cpu.r[1]).toBe(ERR.POWER);
  });
});

describe('laser', () => {
  const fire = ` MOV #LS.FIR!CS.GO, @#LSRCSR\n` + poll('LSRCSR', 'LSRERR') + '\n';

  it('hits the first solid object within 3 cells and reports its distance', () => {
    const w = load(fire + ' ');
    w.grid.set('occupant', 4, 2, record(0o40, 100, FLAG.SOLID | FLAG.HOSTILE));
    w.grid.set('occupant', 5, 2, OBJECTS.wall());
    w.run(10);
    expect(w.tick).toBe(TICKS.LASER);
    expect(w.robot.machine.read(REG.LSRDST, false)).toBe(2);
    expect(w.grid.get('occupant', 4, 2).hp).toBe(100 - LASER_DAMAGE);
    expect(w.grid.get('occupant', 5, 2).hp).toBe(255);
    expect(w.robot.energy).toBe(ENERGY_MAX - COST.LASER - w.robot.cpuEnergyUsed);
  });

  it('misses beyond 3 cells (distance 0) and is stopped by the edge', () => {
    const w = load(fire);
    w.grid.set('occupant', 6, 2, OBJECTS.wall());
    w.run(10);
    expect(w.robot.machine.read(REG.LSRDST, false)).toBe(0);
    expect(w.robot.cpu.r[1]).toBe(0);
    expect(w.grid.get('occupant', 6, 2).hp).toBe(255);
  });

  it('destroys what reaches 0 HP and drops its loot on the floor', () => {
    const w = load(fire);
    w.grid.set('occupant', 3, 2, record(0o40, LASER_DAMAGE, FLAG.SOLID, loot(LOOT.COINS, 4)));
    w.run(10);
    expect(w.grid.typeAt('occupant', 3, 2)).toBe(0);
    expect(w.grid.get('floor', 3, 2)).toEqual(OBJECTS.coins(4));
  });

  it('stops at opaque objects too', () => {
    const w = load(fire);
    w.grid.set('occupant', 3, 2, record(0o41, 50, FLAG.OPAQUE));
    w.grid.set('occupant', 4, 2, record(0o40, 50, FLAG.SOLID));
    w.run(10);
    expect(w.grid.get('occupant', 3, 2).hp).toBe(50 - LASER_DAMAGE);
    expect(w.grid.get('occupant', 4, 2).hp).toBe(50);
  });
});

describe('laser, aimed', () => {
  /** Aim at LSRTGT = tgt (octal word), then halt with R0 = CSR, R1 = error. */
  const aim = (tgt: string) => ` MOV #${tgt}, @#LSRTGT\n MOV #LS.AIM!CS.GO, @#LSRCSR\n` + poll('LSRCSR', 'LSRERR') + '\n';
  const monster = () => record(0o40, 100, FLAG.SOLID | FLAG.HOSTILE);

  it('hits a target off the heading line: DX | DY<<8, signed bytes', () => {
    // Robot at (2,2) facing east; DX = 2, DY = -2 → (4,0), on the edge of the arc.
    const w = load(aim('177002'));
    w.grid.set('occupant', 4, 0, monster());
    w.run(10);
    expect(w.robot.cpu.r[1]).toBe(0);
    expect(w.tick).toBe(TICKS.LASER);
    expect(w.robot.machine.read(REG.LSRDST, false)).toBe(2);
    expect(w.grid.get('occupant', 4, 0).hp).toBe(100 - LASER_DAMAGE);
    expect(w.robot.energy).toBe(ENERGY_MAX - COST.LASER - w.robot.cpuEnergyUsed);
  });

  it('the first solid object on the Bresenham line takes the hit', () => {
    // DX = 2, DY = 1: the line passes (3,2), then (4,3).
    const w = load(aim('000402'));
    w.grid.set('occupant', 3, 2, OBJECTS.wall());
    w.grid.set('occupant', 4, 3, monster());
    w.run(10);
    expect(w.robot.machine.read(REG.LSRDST, false)).toBe(1);
    expect(w.grid.get('occupant', 3, 2).hp).toBe(255 - LASER_DAMAGE);
    expect(w.grid.get('occupant', 4, 3).hp).toBe(100);
  });

  it('the beam ends at the target cell', () => {
    const w = load(aim('1'));
    w.grid.set('occupant', 4, 2, monster());
    w.run(10);
    expect(w.robot.machine.read(REG.LSRDST, false)).toBe(0);
    expect(w.robot.cpu.r[1]).toBe(0);
    expect(w.grid.get('occupant', 4, 2).hp).toBe(100);
  });

  it('follows the heading: facing north, DX = -2, DY = -2 is in the arc', () => {
    const w = load(aim('177376'), { robot: { x: 5, y: 5, heading: 0 } });
    w.grid.set('occupant', 3, 3, monster());
    w.run(10);
    expect(w.robot.machine.read(REG.LSRDST, false)).toBe(2);
    expect(w.grid.get('occupant', 3, 3).hp).toBe(100 - LASER_DAMAGE);
  });

  it('a target outside the 90° arc or the range is a bad argument, at once and free', () => {
    // Facing east: (1,2) too far aside, (-1,0) behind, (0,0) the robot, (3,1) beyond range.
    for (const tgt of ['001001', '377', '0', '000403']) {
      const w = load(aim(tgt), { robot: { x: 5, y: 5, heading: 1 } });
      w.run(1);
      expect(w.robot.cpu.r[1], tgt).toBe(ERR.ARGUMENT);
      expect(w.tick, tgt).toBe(0);
      expect(w.robot.energy, tgt).toBe(ENERGY_MAX - w.robot.cpuEnergyUsed);
    }
  });

  it('LSRTGT reads back and takes byte writes; LSRDST is read-only', () => {
    const w = load(' MOV #1234, @#LSRTGT\n MOVB #377, @#LSRTGT+1\n MOV #7, @#LSRDST\n HALT');
    w.run(1);
    expect(w.robot.machine.read(REG.LSRTGT, false)).toBe(0o177634);
    expect(w.robot.machine.read(REG.LSRDST, false)).toBe(0);
  });

  it('takes the DX/DY word of a scanner record as it is', () => {
    const w = load(`
        MOV #BUF, @#SCNBUF
        MOV #20., @#SCNLEN
        MOV #SC.NWL!CS.GO, @#SCNCSR
1$:     TSTB @#SCNCSR
        BPL 1$
        MOV BUF+4, @#LSRTGT
        MOV #LS.AIM!CS.GO, @#LSRCSR
2$:     TSTB @#LSRCSR
        BPL 2$
        HALT
BUF:    .BLKW 10.`);
    w.grid.set('occupant', 3, 1, monster());
    w.run(20);
    expect(w.robot.machine.read(REG.LSRDST, false)).toBe(1);
    expect(w.grid.get('occupant', 3, 1).hp).toBe(100 - LASER_DAMAGE);
  });
});

describe('scanner', () => {
  const scan = (fn = 'SC.ALL', buf = 'BUF', len = '62.') => `
        MOV #${buf}, @#SCNBUF
        MOV #${len}, @#SCNLEN
        MOV #${fn}!CS.GO, @#SCNCSR` + poll('SCNCSR', 'SCNERR') + `
BUF:    .BLKW 40.`;

  /** The records in the buffer up to the TYPE 0 terminator: [type, hp, flags, loot, dx, dy]. */
  function records(w: ReturnType<typeof world>, at: number) {
    const m = w.robot.machine;
    const out: number[][] = [];
    for (let a = at; ; a += 6) {
      const b = (o: number) => m.read(a + o, true);
      if (b(0) === 0) break;
      const s = (v: number) => (v << 24) >> 24;
      out.push([b(0), b(1), b(2), b(3), s(b(4)), s(b(5))]);
    }
    return out;
  }

  it('writes 6-byte records nearest first, with absolute DX, DY; TYPE 0 terminates', () => {
    const w = load(scan());
    w.grid.set('occupant', 2, 5, record(0o40, 30, FLAG.SOLID | FLAG.HOSTILE | FLAG.MOBILE)); // dy +3
    w.grid.set('floor', 1, 2, OBJECTS.coins(2)); // dx -1
    w.grid.set('occupant', 4, 1, OBJECTS.wall()); // dx +2, dy -1
    w.run(10);
    expect(w.tick).toBe(TICKS.SCAN);
    expect(w.robot.cpu.r[1]).toBe(0);
    const buf = w.robot.symbols.get('BUF')!;
    expect(records(w, buf)).toEqual([
      [TYPE.COIN, 1, FLAG.COLLECTIBLE, 0x12, -1, 0],
      [TYPE.WALL, 255, 0o14, 0, 2, -1],
      [0o40, 30, 0o7, 0, 0, 3],
    ]);
  });

  it('sees nothing beyond its range or behind opaque objects', () => {
    const w = load(scan());
    w.grid.set('occupant', 8, 2, OBJECTS.wall()); // dx 6: out of range
    w.grid.set('occupant', 4, 2, OBJECTS.wall()); // dx 2
    w.grid.set('floor', 5, 2, OBJECTS.coins(1)); // behind the wall
    w.grid.set('occupant', 2, 4, record(0o40, 9, FLAG.SOLID)); // dy 2, visible (not opaque)
    w.grid.set('occupant', 2, 5, record(0o40, 8, FLAG.SOLID)); // behind it: still visible
    w.run(10);
    const buf = w.robot.symbols.get('BUF')!;
    expect(records(w, buf).map((r) => [r[0], r[4], r[5]])).toEqual([[TYPE.WALL, 2, 0], [0o40, 0, 2], [0o40, 0, 3]]);
  });

  it('lists the occupant before the floor item of the same cell, and the floor under the robot', () => {
    const w = load(scan());
    w.grid.set('floor', 2, 2, OBJECTS.chip());
    w.grid.set('floor', 3, 2, OBJECTS.coins(1));
    w.grid.set('occupant', 3, 2, record(0o40, 9, FLAG.SOLID));
    w.run(10);
    const buf = w.robot.symbols.get('BUF')!;
    expect(records(w, buf).map((r) => [r[0], r[4], r[5]])).toEqual([[TYPE.CHIP, 0, 0], [0o40, 1, 0], [TYPE.COIN, 1, 0]]);
  });

  it('SC.NWL leaves out walls', () => {
    const w = load(scan('SC.NWL'));
    w.grid.set('occupant', 3, 2, OBJECTS.wall());
    w.grid.set('occupant', 1, 2, record(0o40, 9, FLAG.SOLID));
    w.run(10);
    const buf = w.robot.symbols.get('BUF')!;
    expect(records(w, buf).map((r) => r[0])).toEqual([0o40]);
  });

  it('writes only what fits: (SCNLEN - 2) / 6 records and the terminator', () => {
    const w = load(scan('SC.ALL', 'BUF', '15.'));
    for (let x = 3; x < 7; x++) w.grid.set('floor', x, 2, OBJECTS.coins(1));
    const buf = w.robot.symbols.get('BUF')!;
    w.robot.machine.ram.fill(0o125, buf, buf + 80);
    w.run(10);
    expect(records(w, buf).map((r) => r[4])).toEqual([1, 2]);
    expect(w.robot.machine.read(buf + 12, false)).toBe(0);
    expect(w.robot.machine.read(buf + 14, true)).toBe(0o125); // untouched
  });

  it('rejects a buffer that is odd, too short, or not entirely in RAM', () => {
    for (const [buf, len] of [['1001', '10'], ['BUF', '1'], ['137770', '12'], ['140000', '10'], ['176400', '10']]) {
      const w = load(scan('SC.ALL', buf, len));
      w.run(2);
      expect(w.robot.cpu.r[1], `${buf} ${len}`).toBe(ERR.ADDRESS);
      expect(w.tick).toBe(0);
    }
  });

  it('an empty view is just the terminator', () => {
    const w = load(scan());
    const buf = w.robot.symbols.get('BUF')!;
    w.robot.machine.ram.fill(0o377, buf, buf + 10);
    w.run(10);
    expect(w.robot.machine.read(buf, false)).toBe(0);
    expect(w.robot.machine.read(buf + 2, false)).toBe(0o177777);
  });
});

describe('grabber', () => {
  const grab = (fn = 'GR.GRB') => ` MOV #${fn}!CS.GO, @#GRBCSR\n` + poll('GRBCSR', 'GRBERR');

  it('takes a collectible from the floor in front into the first free slot', () => {
    const w = load(grab());
    w.grid.set('floor', 3, 2, OBJECTS.chip());
    w.robot.inventory.set([TYPE.CHIP, 1, FLAG.COLLECTIBLE, 0], 0);
    w.run(10);
    expect(w.tick).toBe(TICKS.GRAB);
    expect(w.robot.cpu.r[1]).toBe(0);
    expect(w.grid.typeAt('floor', 3, 2)).toBe(0);
    expect(w.robot.machine.read(REG.GRBSLT, false)).toBe(1);
    const m = w.robot.machine;
    expect([m.read(REG.INV + 4, false), m.read(REG.INV + 6, false)]).toEqual([TYPE.CHIP | (1 << 8), FLAG.COLLECTIBLE]);
  });

  it('adds coins to the coin counter instead of a slot', () => {
    const w = load(grab());
    w.grid.set('floor', 3, 2, OBJECTS.coins(7));
    w.run(10);
    expect(w.robot.coins).toBe(7);
    expect(w.robot.machine.read(REG.STCOIN, false)).toBe(7);
    expect(w.robot.machine.read(REG.INV, false)).toBe(0);
  });

  it('takes a collectible occupant before the floor', () => {
    const w = load(grab());
    w.grid.set('occupant', 3, 2, record(0o50, 1, FLAG.COLLECTIBLE));
    w.grid.set('floor', 3, 2, OBJECTS.chip());
    w.run(10);
    expect(w.grid.typeAt('occupant', 3, 2)).toBe(0);
    expect(w.grid.typeAt('floor', 3, 2)).toBe(TYPE.CHIP);
    expect(w.robot.inventory[0]).toBe(0o50);
  });

  it('errors: nothing to take, inventory full', () => {
    const a = load(grab());
    a.grid.set('floor', 3, 2, OBJECTS.wall());
    a.run(10);
    expect(a.robot.cpu.r[1]).toBe(ERR.NOTHING);

    const b = load(grab());
    b.grid.set('floor', 3, 2, OBJECTS.chip());
    for (let i = 0; i < 4; i++) b.robot.inventory.set([TYPE.CHIP, 1, FLAG.COLLECTIBLE, 0], i * 4);
    b.run(10);
    expect(b.robot.cpu.r[1]).toBe(ERR.FULL);
    expect(b.grid.typeAt('floor', 3, 2)).toBe(TYPE.CHIP);
  });

  it('drops the item in slot GRBSLT on the floor in front', () => {
    const w = load(` MOV #2, @#GRBSLT\n` + grab('GR.DRP'));
    w.robot.inventory.set([TYPE.CHIP, 1, FLAG.COLLECTIBLE, 0], 8);
    w.run(10);
    expect(w.robot.cpu.r[1]).toBe(0);
    expect(w.grid.get('floor', 3, 2)).toEqual(OBJECTS.chip());
    expect(w.robot.inventory[8]).toBe(0);
  });

  it('drop errors: empty or bad slot, floor taken', () => {
    const a = load(` MOV #4, @#GRBSLT\n` + grab('GR.DRP'));
    a.run(10);
    expect(a.robot.cpu.r[1]).toBe(ERR.ARGUMENT);
    const b = load(` MOV #1, @#GRBSLT\n` + grab('GR.DRP'));
    b.run(10);
    expect(b.robot.cpu.r[1]).toBe(ERR.ARGUMENT);
    const c = load(grab('GR.DRP'));
    c.robot.inventory.set([TYPE.CHIP, 1, FLAG.COLLECTIBLE, 0], 0);
    c.grid.set('floor', 3, 2, OBJECTS.coins(1));
    c.run(10);
    expect(c.robot.cpu.r[1]).toBe(ERR.BLOCKED);
    expect(c.robot.inventory[0]).toBe(TYPE.CHIP);
  });
});

describe('status and inventory', () => {
  it('status reads HP, energy, X, Y, heading, coins', () => {
    const w = world({ robot: { x: 5, y: 7, heading: 3, energy: 1234, hp: 77 } });
    w.robot.coins = 9;
    const m = w.robot.machine;
    expect([REG.STHP, REG.STNRG, REG.STX, REG.STY, REG.STHDG, REG.STCOIN].map((a) => m.read(a, false)))
      .toEqual([77, 1234, 5, 7, 3, 9]);
  });

  it('status and inventory ignore writes', () => {
    const w = load(' MOV #1, @#STX\n MOV #1, @#INV\n HALT');
    expect(w.run(1).reason).toBe('halt');
    expect(w.robot.x).toBe(2);
    expect(w.robot.inventory[0]).toBe(0);
  });

  it('inventory slots are 4-byte records at INV + 4n', () => {
    const w = world();
    w.robot.inventory.set([1, 2, 3, 4], 12);
    expect(w.robot.machine.read(REG.INV + 12, false)).toBe(1 | (2 << 8));
    expect(w.robot.machine.read(REG.INV + 15, true)).toBe(4);
  });
});

describe('dock', () => {
  const dock = (count = 0) => ` MOV #${count.toString(8)}, @#DCKCNT\n MOV #DK.CHG!CS.GO, @#DCKCSR\n` + poll('DCKCSR', 'DCKERR');
  /** A world with a charger in front of the robot (east of 2,2). */
  const docked = (src: string, energy: number) => {
    const w = load(src, { robot: { x: 2, y: 2, heading: 1, energy } });
    w.grid.set('occupant', 3, 2, OBJECTS.charger());
    return w;
  };

  it('a charger is a solid, interactive occupant the scanner and laser see past', () => {
    expect(OBJECTS.charger()).toEqual(record(TYPE.CHARGER, 255, FLAG.SOLID | FLAG.INTERACTIVE));
    expect(REG.DCKCSR).toBe(0o176500);
    expect(VECTOR.DOCK).toBe(0o320);
  });

  it('charges CHARGE_RATE energy a tick from the charger in front until full', () => {
    const w = docked(dock(), ENERGY_MAX - 3 * CHARGE_RATE - 5);
    expect(w.run(20).reason).toBe('halt');
    expect(w.robot.cpu.r[1]).toBe(0);
    expect(w.robot.energy).toBe(ENERGY_MAX);
    expect(w.tick).toBe(4);
    expect(w.robot.machine.read(REG.DCKCNT, false)).toBe(0);
  });

  it('DCKCNT limits the energy taken and counts down; it keeps what is left when full first', () => {
    const w = docked(dock(100), 1000);
    w.run(20);
    // The CPU's polling drain comes off too: count what the dock gave.
    expect(w.robot.energy + w.robot.cpuEnergyUsed).toBe(1100);
    expect(w.tick).toBe(Math.ceil(100 / CHARGE_RATE));
    expect(w.robot.machine.read(REG.DCKCNT, false)).toBe(0);

    const v = docked(dock(1000), ENERGY_MAX - 10);
    v.run(20);
    expect(v.robot.energy).toBe(ENERGY_MAX);
    expect(v.robot.cpu.r[1]).toBe(0);
    expect(v.robot.machine.read(REG.DCKCNT, false)).toBe(990 - v.robot.cpuEnergyUsed);
  });

  it('nothing to charge from in front, or a bad function, fails at once', () => {
    const w = load(dock(), { robot: { x: 2, y: 2, heading: 1, energy: 100 } });
    w.grid.set('occupant', 3, 2, OBJECTS.wall());
    w.run(5);
    expect(w.tick).toBe(0);
    expect(w.robot.cpu.r[1]).toBe(ERR.NOTHING);
    const v = docked(` MOV #2!CS.GO, @#DCKCSR\n` + poll('DCKCSR', 'DCKERR'), 100);
    v.run(5);
    expect(v.robot.cpu.r[1]).toBe(ERR.FUNCTION);
  });

  it('a full robot gets ER.FUL', () => {
    const w = docked(dock(), ENERGY_MAX);
    w.run(5);
    expect(w.robot.cpu.r[1]).toBe(ERR.FULL);
  });

  it('stops with ER.NON when the robot turns away or the charger is destroyed', () => {
    const w = docked(`
        MOV #DK.CHG!CS.GO, @#DCKCSR
        MOV #WH.LFT!CS.GO, @#WHLCSR` + poll('DCKCSR', 'DCKERR'), 1000);
    w.run(20);
    expect(w.robot.cpu.r[1]).toBe(ERR.NOTHING);
    expect(w.tick).toBe(TICKS.TURN);
    expect(w.robot.energy + w.robot.cpuEnergyUsed).toBe(1000 + (TICKS.TURN - 1) * CHARGE_RATE - COST.TURN);

    const v = docked(dock(), 1000);
    v.run(3);
    v.grid.clear('occupant', 3, 2);
    v.run(5);
    expect(v.robot.cpu.r[1]).toBe(ERR.NOTHING);
  });

  it('interrupts when done, so the CPU can sleep in WAIT while it charges', () => {
    const w = docked(`
        MOV #DONE, @#DCKVEC
        MOV #340, @#DCKVEC+2
        MOV #DK.CHG!CS.GO!CS.IE, @#DCKCSR
        WAIT
        HALT
DONE:   MOV #1, R5
        RTI`, ENERGY_MAX - 10 * CHARGE_RATE);
    expect(w.run(50).reason).toBe('halt');
    expect(w.robot.cpu.r[5]).toBe(1);
    expect(w.tick).toBe(10);
    expect(w.robot.energy).toBe(ENERGY_MAX);
  });

  it('blocks the wheels and takes laser hits like a wall', () => {
    const w = docked(`
        MOV #1, @#WHLCNT
        MOV #WH.FWD!CS.GO, @#WHLCSR
3$:     TSTB @#WHLCSR
        BPL 3$
        MOV @#WHLERR, R3
        MOV #LS.FIR!CS.GO, @#LSRCSR` + poll('LSRCSR', 'LSRERR'), 1000);
    expect(w.run(20).reason).toBe('halt');
    expect(w.robot.cpu.r[3]).toBe(ERR.BLOCKED);
    expect(w.robot.x).toBe(2);
    expect(w.grid.get('occupant', 3, 2).hp).toBe(255 - LASER_DAMAGE);
  });
});
