import { frameOf } from './neko-logic.ts'
import type { Geometry, Neko } from './neko-logic.ts'

/** The pixel style: a 16x12 cat and an 8x4 mouse, drawn two pixels to a cell. */
export const PIXEL: Geometry = { cat: 16, mouse: 8 }
export const PIXEL_ROWS = 6
const HEIGHT = PIXEL_ROWS * 2

/** The cats to pick from. */
export type CatName = 'tabby' | 'black'
export const CATS: readonly CatName[] = ['tabby', 'black']

// What every cat shares: the mouse, the snores and the startled "!".
const SHARED: Record<string, number> = {
  Y: 0xffdc50, // the startled "!"
  Z: 0xc8d2e6, // snores
  M: 0xaab0b8, // mouse
  m: 0x6e747c, // mouse's feet and tail
}

// Each cat's coat. The black cat is charcoal rather than black, so it shows on a dark terminal.
const COATS: Record<CatName, Record<string, number>> = {
  tabby: {
    O: 0xf0a35e, // fur
    D: 0xc47030, // stripes and ears
    W: 0xf5f0e6, // muzzle and paws
    K: 0x1e1e1e, // pupils and mouth
    E: 0x1e1e1e, // wide and happy eyes
    G: 0x78c878, // eyes
    P: 0xf08ca0, // nose
  },
  black: {
    O: 0x3a3a44,
    D: 0x5a5a6c, // a sheen, not a shadow: darker ears would vanish on a dark terminal
    W: 0x5e5e6c,
    K: 0x0c0c10,
    E: 0xf2d24a,
    G: 0xf2d24a,
    P: 0xf08ca0,
  },
}

/** Every colour key a sprite may use, for each cat. */
export function paletteOf(cat: CatName): Record<string, number> {
  return { ...SHARED, ...COATS[cat] }
}

// Each sprite is rows of palette letters; '.' is see-through.
const SIT = [
  '...D.........D..',
  '...DD.......DD..',
  '...DODDDDDDDOD..',
  '...OOOOOOOOOOO..',
  '...OGKOOOOOGKO..',
  '...OOOOOPOOOOO..',
  '....OOWWWWWOO...',
  '.....OOOOOOO....',
  '....OODOOODOO...',
  '...OOOOOOOOOOO..',
  '...OOOOOOOOOOOD.',
  '...WWOOOOOOWWDD.',
]
const BODY = SIT.slice(8)

const ALERT = [
  '...D.........D.Y',
  '...DD.......DD.Y',
  '...DODDDDDDDOD.Y',
  '...OOOOOOOOOOO..',
  '...OEEOOOOOEEO.Y',
  '...OEEOOPOOEEO..',
  ...SIT.slice(6),
]

const YAWN = [
  ...SIT.slice(0, 4),
  '...ODDOOOOODDO..',
  '...OOOOKKKOOOO..',
  '....OOOKPKOOO...',
  '.....OOKKKOO....',
  ...BODY,
]

const SCRATCH_BODY = [
  '...OOOOOPOOOOOO.',
  '....OOWWWWWOOO..',
  '.....OOOOOOOO...',
  '....OODOOODOO...',
  '...OOOOOOOOOOO..',
  '...OOOOOOOOOOOD.',
  '...WWOOOOOOO.DD.',
]
const SCRATCH: [string[], string[]] = [
  [
    '...D.........D..',
    '...DD.......DD..',
    '...DODDDDDDDODO.',
    '...OOOOOOOOOOOOW',
    '...ODDOOOOODDOOW',
    ...SCRATCH_BODY,
  ],
  [
    '...D.........D.W',
    '...DD.......DDOW',
    '...DODDDDDDDODO.',
    '...OOOOOOOOOOOO.',
    '...ODDOOOOODDOO.',
    ...SCRATCH_BODY,
  ],
]

const CURLED = [
  '................',
  '................',
  '...D....D.......',
  '...DO..OD..OOO..',
  '..OOOOOOOOOOOOO.',
  '..ODDOOODDOOOOOD',
  '.OOOOOPOOOOOOOOD',
  '.WWOOOOOOOOOODD.',
]
const SLEEP: [string[], string[]] = [
  ['..............Z.', '................', '............Z...', '................', ...CURLED],
  ['................', '.............Z..', '................', '...........Z....', ...CURLED],
]

const CAUGHT = [
  ...SIT.slice(0, 3),
  '...OOEOOOOOEOO..',
  '...OEOEOOOEOEO..',
  '...OOOOOPOOOOO..',
  '....OOWWWWWOOMM.',
  '.....OOOOOOO.M..',
  ...BODY,
]

const RUN_HEAD = [
  '................',
  '................',
  '..........D...D.',
  '..........DD.DD.',
]
const RUN: [string[], string[]] = [
  [
    ...RUN_HEAD,
    '.D........OOOOO.',
    '.D.......OOOGKO.',
    '..D......OOOOOOP',
    '..DOOOOOOOOOWW..',
    '...OOOOOOOOOO...',
    '...OODOOODOOO...',
    '..OO.......OO...',
    '.OO.........OO..',
  ],
  [
    ...RUN_HEAD,
    '..........OOOOO.',
    '.........OOOGKO.',
    '.DD......OOOOOOP',
    '...DOOOOOOOOWW..',
    '...OOOOOOOOOO...',
    '...OODOOODOOO...',
    '....OO...OO.....',
    '....O.O..O.O....',
  ],
]

const MOUSE_LEFT = ['..MM....', '.MMMMM..', 'PKMMMMMm', '.m..m..m']

function flip(sprite: string[]): string[] {
  return sprite.map(row => [...row].reverse().join(''))
}

const MOUSE_RIGHT = flip(MOUSE_LEFT)

/** Every sprite, for tests that hold them to their size. */
export const SPRITES = {
  cats: [SIT, ALERT, YAWN, ...SCRATCH, ...SLEEP, CAUGHT, ...RUN],
  mice: [MOUSE_LEFT, MOUSE_RIGHT],
}

function catSprite(s: Neko): string[] {
  const frame = frameOf(s)
  switch (s.pose) {
    case 'run':
      return s.dir === -1 ? flip(RUN[frame]) : RUN[frame]
    case 'alert':
      return ALERT
    case 'scratch':
      return SCRATCH[frame]
    case 'yawn':
      return YAWN
    case 'sleep':
      return SLEEP[frame]
    case 'caught':
      return CAUGHT
    default:
      return SIT
  }
}

/** The scene as one colour (or null, see-through) per pixel, row-major, `columns` wide. */
export function pixels(s: Neko, columns: number, cat: CatName = 'tabby'): (number | null)[] {
  const palette = paletteOf(cat)
  const grid: (number | null)[] = new Array(columns * HEIGHT).fill(null)
  const paint = (sprite: string[], x0: number, y0: number) => {
    sprite.forEach((row, r) => {
      ;[...row].forEach((key, c) => {
        const x = x0 + c
        const color = palette[key]
        if (color !== undefined && x >= 0 && x < columns) grid[(y0 + r) * columns + x] = color
      })
    })
  }
  // The mouse first, so the cat is drawn over it.
  if (s.mouse !== null) {
    paint(s.mouse.dir === 1 ? MOUSE_RIGHT : MOUSE_LEFT, s.mouse.x, HEIGHT - MOUSE_LEFT.length)
  }
  paint(catSprite(s), s.x, 0)
  return grid
}

/** A stretch of one row of half-blocks sharing a foreground and a background. */
export type ColorRun = { text: string; fg?: string; bg?: string }

const UPPER_HALF = '\u2580'
const LOWER_HALF = '\u2584'

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

/**
 * The scene as rows of coloured half-blocks, two pixels to a cell: the top pixel is
 * the glyph's colour and the bottom its background; see-through takes the terminal's.
 */
export function pixelRows(s: Neko, columns: number, cat: CatName = 'tabby'): ColorRun[][] {
  const grid = pixels(s, columns, cat)
  const rows: ColorRun[][] = []
  for (let r = 0; r < PIXEL_ROWS; r++) {
    const runs: ColorRun[] = []
    for (let c = 0; c < columns; c++) {
      const top = grid[2 * r * columns + c] ?? null
      const bottom = grid[(2 * r + 1) * columns + c] ?? null
      let cell: ColorRun
      if (top === null && bottom === null) cell = { text: ' ' }
      else if (top === null) cell = { text: LOWER_HALF, fg: hex(bottom ?? 0) }
      else if (bottom === null) cell = { text: UPPER_HALF, fg: hex(top) }
      else cell = { text: UPPER_HALF, fg: hex(top), bg: hex(bottom) }
      const last = runs[runs.length - 1]
      if (last !== undefined && last.fg === cell.fg && last.bg === cell.bg) last.text += cell.text
      else runs.push(cell)
    }
    rows.push(runs)
  }
  return rows
}
