/**
 * The in-game help (src/ui/help/): every instruction and predefined symbol is described
 * exactly once, every link and anchor resolves, every example assembles with the prelude,
 * and the `run` examples run on the test map to a HALT of their own (not a trap's).
 */
import { describe, expect, it } from 'vitest';
import { assemble, INSTRUCTIONS } from '../../src/blue11';
import { SYMBOLS } from '../../src/core';
import { HELP, inComment, parseInline, SECTIONS, wordAt, type Block, type Entry } from '../../src/ui/help';
import { blockTexts } from '../../src/ui/help/model';
import { SYMBOL_HELP } from '../../src/ui/help/symbols';
import { loaded } from './helpers';

const blocks = (): Array<{ section: string; block: Block }> =>
  SECTIONS.flatMap((s) => s.blocks.map((block) => ({ section: s.id, block })));
const allEntries = (): Entry[] => blocks().flatMap(({ block }) => (block.kind === 'entries' ? block.entries : []));
const codeBlocks = () => blocks().flatMap(({ section, block }) => (block.kind === 'code' ? [{ section, ...block }] : []));

describe('help coverage', () => {
  it('describes every instruction exactly once', () => {
    const named = allEntries().filter((e) => e.anchor.startsWith('op-')).flatMap((e) => e.names);
    expect(new Set(named).size).toBe(named.length);
    expect(new Set(named)).toEqual(new Set(INSTRUCTIONS.map((i) => i.name)));
  });

  it('describes every predefined symbol, and shows it exactly once', () => {
    expect(Object.keys(SYMBOL_HELP).sort()).toEqual(Object.keys(SYMBOLS).sort());
    for (const [n, t] of Object.entries(SYMBOL_HELP)) expect(t, n).not.toBe('');
    const shown = allEntries().filter((e) => e.anchor.startsWith('sym-')).flatMap((e) => e.names);
    expect(shown.length).toBe(new Set(shown).size);
    expect(new Set(shown)).toEqual(new Set(Object.keys(SYMBOLS)));
  });

  it('has unique section ids and anchors', () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const anchors = allEntries().map((e) => e.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('every link leads to a section and an anchor in it', () => {
    for (const { section, block } of blocks()) {
      for (const text of blockTexts(block)) {
        for (const s of parseInline(text)) {
          if (s.kind !== 'link') continue;
          const target = HELP.section(s.section);
          expect(target, `${section}: link to ${s.section}`).toBeDefined();
          if (s.anchor) {
            const there = target!.blocks.some((b) => b.kind === 'entries' && b.entries.some((e) => e.anchor === s.anchor));
            expect(there, `${section}: link to ${s.section}#${s.anchor}`).toBe(true);
          }
        }
      }
    }
  });

  it('has no unclosed markup', () => {
    for (const { section, block } of blocks()) {
      for (const text of blockTexts(block)) {
        const plainText = parseInline(text).filter((s) => s.kind === 'text').map((s) => s.text).join('');
        expect(plainText, `${section}: ${text}`).not.toMatch(/`|\*\*|\]\(/);
      }
    }
  });
});

describe('help examples', () => {
  it.each(codeBlocks().map((c, i) => [`${c.section} #${i}`, c] as const))('%s assembles', (_, c) => {
    const asm = assemble(c.text, { symbols: SYMBOLS });
    expect(asm.errors.map((e) => `${e.line}: ${e.message}`)).toEqual([]);
  });

  it.each(codeBlocks().filter((c) => c.run).map((c, i) => [`${c.section} #${i}`, c] as const))('%s runs to its HALT', (_, c) => {
    const s = loaded(c.text);
    const r = s.run(200);
    expect(r.stop).toBe('halt');
    const at = s.world.robot.cpu.r[7] - 2;
    expect(s.program!.lineAt.has(at), `HALT at ${at.toString(8)} is not in the example`).toBe(true);
  });

  it('the documented results hold', () => {
    const run = (section: string, n = 0) => {
      const c = codeBlocks().filter((b) => b.section === section)[n];
      const s = loaded(c.text);
      s.run(200);
      return s.world.robot.cpu.r;
    };
    expect(run('addressing')[0]).toBe(6);
    expect(run('stack')[0]).toBe(6);
    const mem = run('memory');
    expect([mem[0], mem[2], mem[3]]).toEqual([1, 0o30, 'I'.charCodeAt(0)]);
    expect(run('traps')[1]).not.toBe(0);
  });
});

describe('help lookup', () => {
  it('finds the word under the cursor', () => {
    const line = '        MOV #WH.RGT!CS.GO, @#WHLCSR  ; turn';
    expect(wordAt(line, 9)).toBe('MOV');
    expect(wordAt(line, 11)).toBe('MOV'); // just after it
    expect(wordAt(line, 12)).toBe('');    // on the #
    expect(wordAt(line, 13)).toBe('WH.RGT');
    expect(wordAt(line, 19)).toBe('WH.RGT');
    expect(wordAt(line, 21)).toBe('CS.GO');
    expect(wordAt(line, 30)).toBe('WHLCSR');
    expect(wordAt('MSG: .ASCIZ /HI/', 7)).toBe('.ASCIZ');
    expect(wordAt('', 0)).toBe('');
  });

  it('F1 leads to instructions, byte forms, symbols, registers and directives', () => {
    expect(HELP.topicFor('mov')).toEqual({ section: 'instructions', anchor: 'op-MOV' });
    expect(HELP.topicFor('MOVB')).toEqual({ section: 'instructions', anchor: 'op-MOV' });
    expect(HELP.topicFor('BLO')).toEqual({ section: 'instructions', anchor: 'op-BCS' });
    expect(HELP.topicFor('WHLCSR')).toEqual({ section: 'devices', anchor: 'sym-WHLCSR' });
    expect(HELP.topicFor('MOVE')).toEqual({ section: 'bios', anchor: 'sym-MOVE' });
    expect(HELP.topicFor('SP')).toEqual({ section: 'registers', anchor: 'reg-SP' });
    expect(HELP.topicFor('R3')).toEqual({ section: 'registers', anchor: 'reg-R1' });
    expect(HELP.topicFor('.WORD')).toEqual({ section: 'assembler', anchor: 'dir-.WORD' });
    expect(HELP.topicFor('LOOP')).toBeNull();
  });

  it('hover: the entry for a name, and no help in comments', () => {
    const tip = HELP.entryFor('#WH.FWD');
    expect(tip?.entry.anchor).toBe('sym-WH.FWD');
    expect(tip?.section.id).toBe('devices');
    expect(HELP.entryFor('LOOP')).toBeNull();
    const line = "  CMPB R0, #';   ; MOV here is a comment";
    expect(inComment(line, 3)).toBe(false);
    expect(inComment(line, 12)).toBe(false); // the ';' is a character constant
    expect(inComment(line, 20)).toBe(true);
    // the assembler's rules: two-character constants and .ASCII text hold no comment
    expect(inComment('  CMP R0, #";A ; x', 13)).toBe(false);
    expect(inComment('  CMP R0, #";A ; x', 17)).toBe(true);
    expect(inComment('  .ASCIZ /a;b/ ; x', 13)).toBe(false);
    expect(inComment('  .ASCIZ /a;b/ ; x', 18)).toBe(true);
  });

  it('search puts the named entry first', () => {
    expect(HELP.search('sob')[0]).toMatchObject({ section: 'instructions', anchor: 'op-SOB' });
    expect(HELP.search('whl')[0]).toMatchObject({ section: 'devices' });
    expect(HELP.search('stack').some((h) => h.section === 'stack' && !h.anchor)).toBe(true);
    expect(HELP.search('   ')).toEqual([]);
  });
});
