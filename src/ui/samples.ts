/**
 * The first playable map and a program that solves it with the raw wheel registers
 * (no BIOS yet). Legend: src/core/maps.ts.
 */

export const TEST_MAP = `
###############
#>....#.......#
#####.#.#####.#
#$....#.#...#.#
#.#####.#.E.#.#
#.......#...#.#
#.#####.##.##.#
#.#...#.......#
#.#.3.#####.###
#.#...#.....#.#
#.##.##.###.#.#
#...........#.#
#.#########.#C#
#.......$.....#
###############
`;

export const TEST_PROGRAM = `; Drive to the exit with the raw wheel registers.
; PATH is a list of (cells, function) pairs; cells = 0 ends it.

        MOV #PATH, R1
NEXT:   MOV (R1)+, R0       ; cells to go (turns ignore it)
        BEQ DONE
        MOV R0, @#WHLCNT
        MOV (R1)+, R0       ; function
        BIS #CS.GO, R0
        MOV R0, @#WHLCSR    ; start the wheels
POLL:   TSTB @#WHLCSR       ; READY is bit 7, the sign of the low byte
        BPL POLL
        TST @#WHLCSR        ; ERROR is bit 15
        BMI DONE            ; blocked: give up
        BR NEXT
DONE:   HALT

PATH:   .WORD 4, WH.FWD, 1, WH.RGT, 2, WH.FWD, 1, WH.RGT
        .WORD 4, WH.FWD, 1, WH.LFT, 2, WH.FWD, 1, WH.LFT
        .WORD 6, WH.FWD, 1, WH.RGT, 2, WH.FWD, 1, WH.LFT
        .WORD 3, WH.FWD, 1, WH.LFT, 3, WH.FWD, 0
`;
