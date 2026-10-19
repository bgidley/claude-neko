import { describe, expect, test } from 'claude-code/testing'

import { initial } from './neko-logic.ts'
import type { Neko } from './neko-logic.ts'
import { CATS, PIXEL, PIXEL_ROWS, SPRITES, paletteOf, pixelRows, pixels } from './pixel.ts'

const idle = { isWorking: false, col: 0, seq: 0 }

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

  test('draws two pixels to a cell, a row of half-blocks per band row', async () => {
    const s: Neko = { ...initial(idle), x: 4 }
    const rows = pixelRows(s, 40)
    expect(rows.length).toBe(PIXEL_ROWS)
    for (const runs of rows) expect(runs.map(run => run.text).join('').length).toBe(40)
    // See-through pixels take the terminal's own colours.
    expect(rows[0]?.[0]).toEqual({ text: ' '.repeat(4 + 3) })
    const glyphs = new Set(rows.flat().flatMap(run => [...run.text]))
    expect([...glyphs].sort()).toEqual([' ', '\u2580', '\u2584'])
    const colored = rows.flat().find(run => run.bg !== undefined)
    expect(colored?.fg).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('draws the cat over the mouse', async () => {
    const s: Neko = { ...initial(idle), x: 10, mouse: { x: 12, dir: -1 } }
    const grid = pixels(s, 40)
    const bottomRow = grid.slice(11 * 40, 12 * 40)
    // The cat's white paws at columns 13-14 win over the mouse beneath them.
    expect(bottomRow[13]).toBe(0xf5f0e6)
  })

  test('every cat has a colour for every letter the sprites use', async () => {
    const letters = new Set([...SPRITES.cats, ...SPRITES.mice].flat().join('').replaceAll('.', ''))
    for (const cat of CATS) {
      const palette = paletteOf(cat)
      for (const letter of letters) expect(palette[letter]).toBeDefined()
    }
  })

  test('the black cat wears its own coat', async () => {
    const s: Neko = { ...initial(idle), x: 0 }
    const tabby = new Set(pixels(s, 20, 'tabby'))
    const black = new Set(pixels(s, 20, 'black'))
    expect(tabby.has(0xf0a35e)).toBe(true)
    expect(black.has(0xf0a35e)).toBe(false)
    expect(black.has(0x3a3a44)).toBe(true)
  })
})
