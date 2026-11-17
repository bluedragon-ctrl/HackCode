/**
 * The robot's BIOS: Blue-11 code in ROM at 140000 that gives beginners `EMT n` calls for
 * the devices (DESIGN.md §4 "BIOS"). It uses only the device registers, like any program,
 * and its source is shown to the player, so it is written to be read.
 */

import { assemble, type AssembleResult } from '../blue11';
import { MEMORY } from './constants';
import { SYMBOLS } from './symbols';

export const BIOS_SOURCE = `; Robot BIOS, in ROM from 140000. A program calls it with EMT:
;
;       MOV #3, R0
;       EMT MOVE            ; three cells forward
;
; call        in                        out (on success)
; EMT MOVE    R0 = cells forward        R0 = 0
; EMT BACK    R0 = cells back           R0 = 0
; EMT LEFT    -                         R0 = 0     turn left
; EMT RIGHT   -                         R0 = 0     turn right
; EMT FIRE    -                         R0 = distance of the hit, 0 = nothing hit
; EMT SCAN    R0 = buffer, R1 = length  R0 = buffer
; EMT GRAB    -                         R0 = inventory slot, or -1 for coins
; EMT DROP    R0 = slot                 R0 = 0
; EMT PRINT   R0 = text (.ASCIZ)        R0 = 0     on the console
; EMT AIM     R0 = DX | DY<<8           R0 = steps to the hit, 0 = nothing hit
; EMT CHARGE  R0 = energy, 0 = to full   R0 = energy gained  from the charger in front
;
; Success: C clear. Failure: C set and R0 = the error code (ER.BLK, ER.PWR, ...),
; so BCS right after the EMT catches it. Every other register is kept.
; A call waits until its device is done. It writes the device's CSR without IE,
; so that device's interrupts are off afterwards.
;
; The EMT instruction traps through the vector at 30, which points to ENTRY.
; The trap pushed the PSW and the return address (just after the EMT).

        . = 140000

ENTRY:  MOV R1, -(SP)           ; keep R1: now (SP) = R1, 2(SP) = PC, 4(SP) = PSW
        MOV 2(SP), R1           ; the return address...
        MOV -2(R1), R1          ; ...follows the EMT instruction: fetch it
        BIC #177400, R1         ; its low byte is the call number
        CMP R1, #NCALLS
        BHIS BADFN
        ASL R1                  ; 2 bytes per table entry
        JMP @TABLE(R1)

TABLE:  .WORD DOMOVE, DOBACK, DOLEFT, DORGHT, DOFIRE
        .WORD DOSCAN, DOGRAB, DODROP, DOPRNT, DOAIM
        .WORD DOCHRG
NCALLS = 11.

; Return to the caller: restore R1, set or clear C in the saved PSW, RTI.
OK:     MOV (SP)+, R1
        BIC #1, 2(SP)           ; C clear: success
        RTI
FAIL:   MOV (SP)+, R1
        BIS #1, 2(SP)           ; C set: R0 holds the error code
        RTI
BADFN:  MOV #ER.FN, R0          ; no such call
        BR FAIL

; ---------------------------------------------------------------- wheels

DOMOVE: MOV #WHLCSR, R1
        JSR PC, IDLE
        MOV R0, @#WHLCNT        ; cells to go
        MOV #WH.FWD, R0
        BR WHEELS
DOBACK: MOV #WHLCSR, R1
        JSR PC, IDLE
        MOV R0, @#WHLCNT
        MOV #WH.BAK, R0
        BR WHEELS
DOLEFT: MOV #WH.LFT, R0
        BR TURN
DORGHT: MOV #WH.RGT, R0
TURN:   MOV #WHLCSR, R1
WHEELS: JSR PC, RUN
        BCS FAIL
        CLR R0
        BR OK

; ---------------------------------------------------------------- laser

DOFIRE: MOV #LSRCSR, R1
        MOV #LS.FIR, R0
        JSR PC, RUN
        BCS FAIL
        MOV @#LSRDST, R0        ; how far the beam went
        BR OK

; Aim at a cell: R0 = DX | DY<<8, as in the scanner's records. It must be in
; the 90-degree arc ahead and within range (dx*dx + dy*dy <= 9.), else ER.ARG.
DOAIM:  MOV #LSRCSR, R1
        JSR PC, IDLE
        MOV R0, @#LSRTGT        ; the target
        MOV #LS.AIM, R0
        JSR PC, RUN
        BCS FAIL
        MOV @#LSRDST, R0        ; steps to the hit
        BR OK

; ---------------------------------------------------------------- scanner

DOSCAN: MOV #SCNCSR, R1
        JSR PC, IDLE
        MOV R0, @#SCNBUF
        MOV (SP), @#SCNLEN      ; the caller's R1, kept on the stack
        MOV #SC.ALL, R0
        JSR PC, RUN
        BCS FAIL
        MOV @#SCNBUF, R0        ; the buffer, for the caller to read
        BR OK

; ---------------------------------------------------------------- grabber

DOGRAB: MOV #GRBCSR, R1
        MOV @#STCOIN, -(SP)     ; coins before
        MOV #GR.GRB, R0
        JSR PC, RUN
        BCS 2$
        CMP (SP)+, @#STCOIN     ; more coins now?
        BNE 1$
        MOV @#GRBSLT, R0        ; no: an item, in this slot
        BR OK
1$:     MOV #-1, R0             ; yes: coins
        BR OK
2$:     TST (SP)+               ; drop the coin count
        BR FAIL

DODROP: MOV #GRBCSR, R1
        JSR PC, IDLE
        MOV R0, @#GRBSLT
        MOV #GR.DRP, R0
        JSR PC, RUN
        BCS FAIL
        CLR R0
        BR OK

; ---------------------------------------------------------------- console

DOPRNT: MOVB (R0)+, R1          ; next character
        BEQ 2$                  ; 0 ends the text
1$:     TSTB @#XCSR             ; transmitter ready?
        BPL 1$
        MOVB R1, @#XBUF
        BR DOPRNT
2$:     CLR R0
        BR OK

; ---------------------------------------------------------------- dock

; Charge from the charger in front: R0 = energy to take, 0 = until full.
; Returns the energy gained (less what the CPU used meanwhile).
DOCHRG: MOV #DCKCSR, R1
        JSR PC, IDLE
        MOV R0, @#DCKCNT        ; how much
        MOV @#STNRG, -(SP)      ; energy before
        MOV #DK.CHG, R0
        JSR PC, RUN
        BCS 1$
        MOV @#STNRG, R0
        SUB (SP)+, R0           ; gained
        JMP OK                  ; too far for BR
1$:     TST (SP)+               ; drop the energy before
        JMP FAIL

; ---------------------------------------------------------------- helpers

; Wait until the device whose CSR is at (R1) is ready (READY = bit 7,
; the sign of the low byte).
IDLE:   TSTB (R1)
        BPL IDLE
        RTS PC

; Start function R0 on the device at (R1) and wait for it to finish.
; Returns C clear, or C set and R0 = the device's error register.
RUN:    JSR PC, IDLE            ; a busy device ignores GO: wait first
        BIS #CS.GO, R0
        MOV R0, (R1)            ; GO
1$:     TSTB (R1)               ; wait for READY
        BPL 1$
        TST (R1)                ; ERROR = bit 15; TST also clears C
        BMI 2$
        RTS PC
2$:     MOV 2(R1), R0           ; the error register
        SEC
        RTS PC
`;

let cached: AssembleResult | null = null;

/** The assembled BIOS (assembled once). */
export function bios(): AssembleResult {
  if (!cached) {
    const a = assemble(BIOS_SOURCE, { symbols: SYMBOLS, origin: MEMORY.ROM_BASE });
    if (!a.ok) throw new Error(`bios: ${a.errors.map((e) => `${e.line}:${e.column} ${e.message}`).join('; ')}`);
    cached = a;
  }
  return cached;
}

/** Where the EMT vector points. */
export function biosEntry(): number {
  return bios().symbols.get('ENTRY')!;
}
