/**
 * The first playable map and two programs that solve it: one with BIOS calls (the
 * editor's default) and one with the raw wheel registers. Legend: src/core/maps.ts.
 * A patrol guards the coins in the room below the start, and a chaser waits in the
 * pocket at the bottom right. A sentry watches the passage south of the exit room.
 * None of them is on the route to the exit, nor in line with it within laser range.
 * A charger stands just south of the route's second turn: at (1, 5) the robot faces it.
 */

export const TEST_MAP = `
###############
#>....#.......#
#####.#.#####.#
#$....#.#...#.#
#.#####.#.E.#.#
#.......#...#.#
#+#####.##.##.#
#.#P..#.......#
#.#.3.#####.###
#.#...#.....#.#
#.##.##.###S#H#
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

/** The same route with BIOS calls: MOV the cell count to R0, then EMT. */
export const BIOS_PROGRAM = `; Drive to the exit with BIOS calls.
; EMT MOVE goes R0 cells forward; EMT LEFT / EMT RIGHT turn.
; A failed call sets C: BCS catches it.

        MOV #4, R0
        EMT MOVE
        EMT RIGHT
        MOV #2, R0
        EMT MOVE
        EMT RIGHT
        MOV #4, R0
        EMT MOVE
        EMT LEFT
        MOV #2, R0
        EMT MOVE
        EMT LEFT
        MOV #6, R0
        EMT MOVE
        EMT RIGHT
        MOV #2, R0
        EMT MOVE
        EMT LEFT
        MOV #3, R0
        EMT MOVE
        EMT LEFT
        MOV #3, R0
        EMT MOVE
        BCS OOPS
        HALT

OOPS:   MOV #MSG, R0
        EMT PRINT
        HALT
MSG:    .ASCIZ /BLOCKED!/
`;
