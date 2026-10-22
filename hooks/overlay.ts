import { CAT_COLORS, MOUSE_COLOR, asciiRows } from './neko-logic.ts'
import type { Neko } from './neko-logic.ts'
import { pixelRows } from './pixel.ts'
import type { CatName } from './pixel.ts'

/** A stretch of one row over the transcript: cells to leave alone, or ones to paint. */
export type OverlayCell = { gap: number } | { text: string; color?: string; backgroundColor?: string }

/**
 * The scene as rows to draw over the transcript, `columns` wide: the empty cells are
 * gaps, drawn as nothing at all, so the text beneath shows through around the cat.
 */
export function overlayRows(
  s: Neko,
  columns: number,
  cat: CatName,
  style: 'pixel' | 'ascii',
): OverlayCell[][] {
  const rows: { text: string; color?: string; backgroundColor?: string }[][] =
    style === 'pixel'
      ? pixelRows(s, columns, cat).map(runs =>
          runs.map(run => ({ text: run.text, color: run.fg, backgroundColor: run.bg })),
        )
      : asciiRows(s).map(runs => {
          let room = columns
          return runs.map(run => {
            const text = run.text.slice(0, Math.max(0, room))
            room -= text.length
            return { text, color: run.isMouse ? MOUSE_COLOR : CAT_COLORS[cat] }
          })
        })

  return rows.map(runs => {
    const cells: OverlayCell[] = []
    for (const run of runs) {
      for (const part of run.text.split(/( +)/)) {
        if (part === '') continue
        if (part.trim() === '' && run.backgroundColor === undefined) {
          const last = cells[cells.length - 1]
          if (last !== undefined && 'gap' in last) last.gap += part.length
          else cells.push({ gap: part.length })
        } else {
          cells.push({ ...run, text: part })
        }
      }
    }
    // Nothing to paint after the last of the cat.
    while (cells.length > 0 && 'gap' in (cells[cells.length - 1] as OverlayCell)) cells.pop()
    return cells
  })
}
