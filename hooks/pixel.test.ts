import { describe, expect, test } from 'claude-code/testing'

import { initial } from './neko-logic.ts'
import type { Neko } from './neko-logic.ts'
import { PIXEL, PIXEL_ROWS, SPRITES, pixelCells, pixels, toBase64 } from './pixel.ts'

const idle = { isWorking: false, col: 0, seq: 0 }

function decode(cells: string): number[] {
  const bin = atob(cells)
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0))
  return [...new Uint32Array(bytes.buffer)]
}

describe('pixel art', () => {
  test('every sprite is its geometry in size', async () => {
    for (const sprite of SPRITES.cats) {
      expect(sprite.length).toBe(PIXEL_ROWS * 2)
      for (const row of sprite) expect(row.length).toBe(PIXEL.cat)
    }
    for (const sprite of SPRITES.mice) {
      for (const row of sprite) expect(row.length).toBe(PIXEL.mouse)
    }
  })

  test('encodes one half-block cell per column and row', async () => {
    const s: Neko = { ...initial(idle), x: 4 }
    const words = decode(pixelCells(s, 40))
    expect(words.length).toBe(40 * PIXEL_ROWS * 3)
    // Top-left is see-through: a blank in the terminal's own colours.
    expect(words.slice(0, 3)).toEqual([0x20, 0x01000000, 0x01000000])
    const glyphs = new Set(words.filter((_, i) => i % 3 === 0))
    expect([...glyphs].sort()).toEqual([0x20, 0x2580, 0x2584])
  })

  test('draws the cat over the mouse', async () => {
    const s: Neko = { ...initial(idle), x: 10, mouse: { x: 12, dir: -1 } }
    const grid = pixels(s, 40)
    const bottomRow = grid.slice(11 * 40, 12 * 40)
    // The cat's white paws at columns 13-14 win over the mouse beneath them.
    expect(bottomRow[13]).toBe(0xf5f0e6)
  })

  test('base64 matches the standard alphabet and padding', async () => {
    for (const text of ['', 'f', 'fo', 'foo', 'neko!']) {
      const bytes = Uint8Array.from(text, ch => ch.charCodeAt(0))
      expect(toBase64(bytes)).toBe(btoa(text))
    }
  })
})
