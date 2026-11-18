/**
 * The lessons (src/ui/lessons/): every map parses, every starter assembles, every
 * solution keeps the rules and wins, the briefings' links resolve, and the mistakes a
 * lesson is about do not win.
 */
import { describe, expect, it } from 'vitest';
import { assemble } from 'blue11';
import { SYMBOLS } from '../../src/core';
import { HELP, parseInline } from '../../src/ui/help';
import { blockTexts } from '../../src/ui/help/model';
import { LESSONS, WAIT_ENERGY } from '../../src/ui/lessons/lessons';
import { checkRules, codeId, codeWords, mnemonics, type Lesson } from '../../src/ui/lessons/model';
import { Progress } from '../../src/ui/lessons/progress';
import { Session, type StepResult } from '../../src/ui/session';

const session = (l: Lesson) => new Session(l.map, { ...l.mapOptions, goal: l.goal, rules: l.rules });

/** Load `source` on the lesson's map and run up to `ticks` ticks. */
function play(l: Lesson, source: string, ticks = 3000): { s: Session; r: StepResult } {
  const s = session(l);
  expect(s.load(source).map((e) => e.message)).toEqual([]);
  return { s, r: s.run(ticks) };
}

const byId = (id: string) => LESSONS.find((l) => l.id === id)!;

describe('lessons', () => {
  it('are numbered in order, with unique ids', () => {
    expect(LESSONS.map((l) => l.number)).toEqual(LESSONS.map((_, i) => i));
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });

  it.each(LESSONS.map((l) => [l.title, l] as const))('%s: map, starter, hints', (_, l) => {
    expect(() => session(l)).not.toThrow();
    const asm = assemble(l.starter, { symbols: SYMBOLS });
    expect(asm.errors.map((e) => `${e.line}: ${e.message}`)).toEqual([]);
    expect(l.hints.length).toBeGreaterThan(0);
    expect(l.briefing.length).toBeGreaterThan(0);
  });

  it.each(LESSONS.map((l) => [l.title, l] as const))('%s: the solution wins', (_, l) => {
    const { s, r } = play(l, l.solution);
    expect(s.failure).toBeNull();
    expect(r.stop).toBe('won');
  });

  it.each(LESSONS.map((l) => [l.title, l] as const))('%s: the starter does not win', (_, l) => {
    const s = session(l);
    if (s.load(l.starter).length) return; // breaks a rule: fine
    expect(s.run(3000).stop).not.toBe('won');
  });

  it('briefing and hint links lead to help sections and anchors', () => {
    for (const l of LESSONS) {
      const texts = [...l.briefing.flatMap(blockTexts), ...l.hints, l.goal.text];
      for (const t of texts) {
        for (const s of parseInline(t)) {
          if (s.kind !== 'link') continue;
          const target = HELP.section(s.section);
          expect(target, `${l.id}: link to ${s.section}`).toBeDefined();
          if (s.anchor) {
            const there = target!.blocks.some((b) => b.kind === 'entries' && b.entries.some((e) => e.anchor === s.anchor));
            expect(there, `${l.id}: link to ${s.section}#${s.anchor}`).toBe(true);
          }
        }
      }
    }
  });

  it('briefing code assembles', () => {
    for (const l of LESSONS) {
      for (const b of l.briefing) {
        if (b.kind !== 'code') continue;
        const asm = assemble(b.text, { symbols: SYMBOLS });
        expect(asm.errors.map((e) => `${l.id} ${e.line}: ${e.message}`)).toEqual([]);
      }
    }
  });
});

describe('what the lessons teach', () => {
  it('0: 12 is octal, so MOV #12 stops two cells short', () => {
    const l = byId('octal');
    const wrong = l.solution.replace('#14', '#12');
    const { s, r } = play(l, wrong);
    expect(r.stop).not.toBe('won');
    expect(s.world.robot.x).toBe(11);
    // decimal with a dot works
    expect(play(l, l.solution.replace('#14', '#12.')).r.stop).toBe('won');
  });

  it('1: R0 holds the BIOS result, so a second EMT MOVE without setting it fails', () => {
    const { s } = play(byId('registers'), byId('registers').starter);
    expect(s.world.robot.x).toBe(4);
    expect(s.world.robot.y).toBe(1);
  });

  it('2: the spiral written out is too long', () => {
    const l = byId('loops');
    const lengths = [14, 14, 14, 12, 12, 10, 10, 6, 6, 4, 4, 2, 2];
    const long = lengths.map((n) => `MOV #${n}, R0\nEMT MOVE\nEMT RIGHT`).join('\n') + '\nHALT';
    const errs = session(l).load(long);
    expect(errs[0].message).toMatch(/words of instructions/);
  });

  it('3: the solution survives the sentries with HP to spare', () => {
    expect(play(byId('bits'), byId('bits').solution).s.world.robot.hp).toBeGreaterThanOrEqual(40);
  });

  it('3: walking without shooting gets the robot nowhere', () => {
    const l = byId('bits');
    const { r } = play(l, 'LOOP: MOV #1, R0\nEMT MOVE\nBR LOOP');
    expect(r.stop).not.toBe('won');
  });

  it('5: without a subroutine the rules say so', () => {
    const l = byId('subroutines');
    expect(session(l).load('EMT LEFT\nHALT').map((e) => e.message)).toEqual([
      'this lesson asks you to use JSR', 'this lesson asks you to use RTS']);
  });

  it('6: no EMT', () => {
    const l = byId('devices');
    expect(session(l).load(byId('registers').solution)[0].message).toBe('this lesson does not allow EMT');
  });

  it(`7: polling reaches the exit with less than ${WAIT_ENERGY}. energy; WAIT with more`, () => {
    const l = byId('interrupts');
    const installed = l.starter.replace('        MOV #PATH, R1', '        MOV #DRIVE, @#34\n        CLR @#36\n        MOV #PATH, R1');
    const poll = play(l, installed);
    expect(poll.r.stop).toBe('failed');
    expect(poll.s.failure).toMatch(/Exit reached with \d+\. energy/);
    const bios = play(l, 'MOV #X, @#34\nCLR @#36\nTRAP 0\nMOV #14, R0\nEMT MOVE\nEMT RIGHT\nMOV #14, R0\nEMT MOVE\nEMT RIGHT\nMOV #14, R0\nEMT MOVE\nHALT\nX: RTI');
    expect(bios.r.stop).toBe('failed');
    const wait = play(l, l.solution);
    expect(wait.r.stop).toBe('won');
    // margins both ways, so tuning the costs does not quietly break the lesson
    expect(poll.s.world.robot.energy).toBeLessThan(WAIT_ENERGY - 100);
    expect(wait.s.world.robot.energy).toBeGreaterThan(WAIT_ENERGY + 50);
  });

  it('7: the starter stops at its TRAP, with no handler at 34', () => {
    const l = byId('interrupts');
    const { s, r } = play(l, l.starter);
    expect(r.stop).toBe('trap');
    expect(s.world.robot.x).toBe(1);
    expect(session(l).load(byId('devices').solution)[0].message).toBe('this lesson asks you to use TRAP');
  });

  it('7: a DRIVE at priority 7 cannot be woken by the wheels', () => {
    const l = byId('interrupts');
    const { s, r } = play(l, l.solution.replace('CLR @#36', 'MOV #340, @#36'));
    expect(r.stop).toBe('wait'); // the first leg is driven, its interrupt never taken
    expect([s.world.robot.x, s.world.robot.y]).toEqual([13, 1]);
  });
});

describe('rules', () => {
  it('mnemonics skips labels, comments and symbol definitions', () => {
    expect([...mnemonics('A: B: mov r0, r1 ; EMT\nX = 3\n  ; HALT\nC: .WORD 1\nMOVB #\';, R0')].sort())
      .toEqual(['.WORD', 'MOV', 'MOVB']);
  });

  it('counts only instruction words', () => {
    const asm = assemble('MOV #1, R0\nHALT\nBUF: .BLKW 100', { symbols: SYMBOLS });
    expect(codeWords(asm)).toBe(3);
    expect(checkRules({ maxWords: 2 }, '', asm)).toEqual(['the program has 3 words of instructions; this lesson allows 2']);
  });
});

describe('progress', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('keeps completed lessons, code and the current lesson', () => {
    const s = store();
    const p = new Progress(s);
    expect(p.done.size).toBe(0);
    expect(p.current).toBeNull();
    p.complete('octal');
    p.complete('octal');
    p.saveCode('octal', 'HALT');
    p.current = 'loops';
    const q = new Progress(s);
    expect([...q.done]).toEqual(['octal']);
    expect(q.code('octal')).toBe('HALT');
    expect(q.code('loops')).toBeNull();
    expect(q.current).toBe('loops');
  });

  it('survives a broken or missing store', () => {
    const s = store();
    s.m.set('hackcode.done', '{not json');
    expect(new Progress(s).done.size).toBe(0);
    const p = new Progress(null);
    p.complete('x');
    expect(p.done.size).toBe(0);
    const throwing = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    expect(() => new Progress(throwing).saveCode('a', 'b')).not.toThrow();
    expect(new Progress(throwing).code('a')).toBeNull();
  });
});

describe('saved programs', () => {
  it('a lesson revised past 1 saves under a new key, so old programs do not open in it', () => {
    expect(codeId({ id: 'loops' })).toBe('loops');
    expect(codeId({ id: 'x', revision: 1 })).toBe('x');
    expect(codeId(byId('interrupts'))).toBe('interrupts.r2');
  });
});

describe('session goals', () => {
  it('a robot destroyed on the exit has lost, not won', () => {
    // The patrol steps into the exit cell in the tick the robot gets there: a bite at 10 HP.
    const map = `
#####
#>.E#
###.#
###P#
#####`;
    const t = new Session(map, { robot: { hp: 10 } });
    expect(t.load('MOV #1, R1\n1$: SOB R1, 1$\nMOV #2, R0\nEMT MOVE\n2$: BR 2$')).toEqual([]);
    const r = t.run(300);
    expect(t.world.atExit).toBe(true);
    expect(t.world.robot.hp).toBe(0);
    expect(r.stop).toBe('destroyed');
  });

  it('a failed goal ends the run until it is reset', () => {
    const l = byId('bits');
    const goal = { text: '', won: () => false, failed: () => 'nope' };
    const t = new Session(l.map, { goal });
    expect(t.load('HALT')).toEqual([]);
    expect(t.run(5).stop).toBe('failed');
    expect(t.failure).toBe('nope');
    expect(t.over).toBe(true);
    expect(t.canContinue('HALT')).toBe(false);
    t.reset();
    expect(t.failure).toBeNull();
    expect(t.over).toBe(false);
  });
});
