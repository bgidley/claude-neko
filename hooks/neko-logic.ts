/**
 * What the cat reacts to: is Claude busy, where the caret is, an edit counter, the
 * pointer's column over the band (null when it is elsewhere) with a move counter,
 * and a counter of strokes.
 */
export type NekoProps = {
  isWorking: boolean
  col: number
  seq: number
  pointer?: number | null
  pointerSeq?: number
  strokeSeq?: number
}

export type Pose = 'run' | 'alert' | 'sit' | 'scratch' | 'yawn' | 'sleep' | 'caught' | 'purr'

export type Mouse = { x: number; dir: 1 | -1 }

/** How many columns the cat and the mouse take in a style. */
export type Geometry = { cat: number; mouse: number }

export type Neko = {
  x: number
  dir: 1 | -1
  pose: Pose
  goal: number
  tick: number
  // Ticks since the cat last moved, since the last keystroke and pointer move, and left to stay startled.
  still: number
  sinceTyped: number
  sincePointed: number
  alert: number
  // Ticks with no typing and no work, and left to look pleased after a catch.
  idle: number
  fed: number
  // Ticks left purring since the last stroke.
  purr: number
  mouse: Mouse | null
  seq: number
  pointerSeq: number
  strokeSeq: number
  seed: number
}

export const TICK_MS = 100
export const ASCII: Geometry = { cat: 9, mouse: 5 }
// The ASCII cat's colours. The black cat is drawn light grey, so it shows on a dark terminal.
export const CAT_COLORS: Record<'tabby' | 'black', string> = { tabby: '#f0a35e', black: '#9a9aaa' }
export const MOUSE_COLOR = '#aab0b8'
export const MOUSE_AT = 300 // a mouse turns up after 30s with nothing happening
const CHASE_TICKS = 40 // follow the caret or pointer for 4s after it last moved
const STARTLE_AFTER = 10 // a cat resting this long startles before it runs
const ALERT_TICKS = 3
const ROAM_PAUSE = 8 // while Claude works, sit this long, then run somewhere new
const SCRATCH_AT = 20
const SIT_AGAIN_AT = 32
const YAWN_AT = 60
const SLEEP_AT = 80
const FLEE_RANGE = 18 // the mouse runs once the cat is this close
const FED_TICKS = 30
export const PURR_TICKS = 30 // purr for 3s after the last stroke

export function initial(props: NekoProps): Neko {
  return {
    x: 0,
    dir: 1,
    pose: 'sit',
    goal: 0,
    tick: 0,
    still: 0,
    sinceTyped: CHASE_TICKS,
    sincePointed: CHASE_TICKS,
    alert: 0,
    idle: 0,
    fed: 0,
    purr: 0,
    mouse: null,
    seq: props.seq,
    pointerSeq: props.pointerSeq ?? 0,
    strokeSeq: props.strokeSeq ?? 0,
    seed: 1 + (props.seq % 9973),
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// How far the mouse's middle is from the cat's: positive when the mouse is to the right.
function gap(catX: number, mouse: Mouse, g: Geometry): number {
  return mouse.x + (g.mouse >> 1) - (catX + (g.cat >> 1))
}

function scurry(
  mouse: Mouse,
  catX: number,
  room: number,
  tick: number,
  seed: number,
  g: Geometry,
): Mouse {
  const between = gap(catX, mouse, g)
  if (Math.abs(between) < FLEE_RANGE) {
    const dir = between >= 0 ? 1 : -1
    return { x: clamp(mouse.x + dir, 0, room), dir }
  }
  // Out of reach it sniffs about, a step now and then.
  if (tick % 6 !== 0) return mouse
  const dir = seed % 2 === 0 ? 1 : -1
  return { x: clamp(mouse.x + dir, 0, room), dir }
}

/** One frame of xneko's state machine for a band `columns` wide. */
export function step(s: Neko, p: NekoProps, columns: number, g: Geometry = ASCII): Neko {
  const room = Math.max(0, columns - g.cat)
  const mouseRoom = Math.max(0, columns - g.mouse)
  const typed = p.seq !== s.seq
  const sinceTyped = typed ? 0 : s.sinceTyped + 1
  const pointerSeq = p.pointerSeq ?? 0
  const sincePointed = pointerSeq !== s.pointerSeq ? 0 : s.sincePointed + 1
  const strokeSeq = p.strokeSeq ?? 0
  const purr = strokeSeq !== s.strokeSeq ? PURR_TICKS : s.purr
  if (purr > 0) {
    // Being stroked it stays put, eyes closed, purring; even a sleeping cat skips the
    // startle, and any mouse takes the chance to slip away.
    return {
      ...s,
      x: clamp(s.x, 0, room),
      pose: 'purr',
      goal: clamp(s.x, 0, room),
      tick: s.tick + 1,
      still: 0,
      sinceTyped,
      sincePointed,
      alert: 0,
      idle: 0,
      fed: 0,
      purr: purr - 1,
      mouse: null,
      seq: p.seq,
      pointerSeq,
      strokeSeq,
    }
  }
  // Whichever moved last, the pointer or the caret, is the one to follow: the
  // pointer until the cat is under it, and for a while after it last moved.
  const pointer = p.pointer ?? null
  const underPointer = pointer === null ? s.x : clamp(pointer - (g.cat >> 1), 0, room)
  const isFollowingPointer =
    pointer !== null &&
    sincePointed <= sinceTyped &&
    (sincePointed < CHASE_TICKS || clamp(s.x, 0, room) !== underPointer)
  const isFollowingCaret = sinceTyped < CHASE_TICKS && !isFollowingPointer
  const isQuiet = !isFollowingCaret && !isFollowingPointer && !p.isWorking
  let { seed, goal, alert, still } = s
  const x = clamp(s.x, 0, room)
  let idle = isQuiet ? s.idle + 1 : 0
  let fed = isQuiet ? s.fed : 0
  // Typing or work scares the mouse off.
  let mouse =
    isQuiet && s.mouse !== null ? { ...s.mouse, x: clamp(s.mouse.x, 0, mouseRoom) } : null

  if (mouse === null && fed === 0 && idle >= MOUSE_AT && room > g.mouse) {
    // It turns up at the far end of the band from the cat.
    const fromRight = x + (g.cat >> 1) < columns >> 1
    mouse = { x: fromRight ? mouseRoom : 0, dir: fromRight ? -1 : 1 }
  }

  if (isFollowingPointer) {
    // Sit right under the pointer, as xneko does.
    goal = underPointer
  } else if (isFollowingCaret) {
    // Stand just behind the caret, facing it.
    const caret = columns > 0 ? p.col % columns : 0
    goal = clamp(caret - g.cat + 2, 0, room)
  } else if (p.isWorking) {
    if (still >= ROAM_PAUSE || goal > room) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      goal = seed % (room + 1)
    }
  } else if (mouse !== null) {
    goal = clamp(x + gap(x, mouse, g), 0, room)
  } else {
    goal = x
  }

  const wantsToMove = goal !== x
  const wasResting = s.pose !== 'run' && s.pose !== 'alert'
  if (wantsToMove && wasResting && s.still >= STARTLE_AFTER) {
    alert = ALERT_TICKS
  }

  let nextX = x
  let dir = s.dir
  let pose: Pose
  if (alert > 0) {
    pose = 'alert'
    alert -= 1
    still = 0
  } else if (wantsToMove) {
    // Hunting, it puts on a burst: two cells, then one.
    const speed = p.isWorking ? 2 : mouse !== null ? 2 - (s.tick % 2) : 1
    dir = goal > x ? 1 : -1
    nextX = dir === 1 ? Math.min(goal, x + speed) : Math.max(goal, x - speed)
    pose = 'run'
    still = 0
  } else {
    still += 1
    pose = 'sit'
    if (!p.isWorking) {
      if (still >= SLEEP_AT) pose = 'sleep'
      else if (still >= YAWN_AT) pose = 'yawn'
      else if (still >= SCRATCH_AT && still < SIT_AGAIN_AT) pose = 'scratch'
    }
  }

  if (mouse !== null) {
    // Caught once it is under the cat, which a cornered mouse always is.
    const reach = Math.max(2, (g.cat - g.mouse) >> 1)
    if (pose !== 'alert' && Math.abs(gap(nextX, mouse, g)) <= reach) {
      mouse = null
      fed = FED_TICKS
      idle = 0
    } else {
      seed = (seed * 1103515245 + 12345) % 2147483648
      mouse = scurry(mouse, nextX, mouseRoom, s.tick, seed, g)
    }
  }
  if (fed > 0) {
    pose = 'caught'
    fed -= 1
  }

  return {
    ...s,
    x: nextX,
    dir,
    pose,
    goal,
    tick: s.tick + 1,
    still,
    sinceTyped,
    sincePointed,
    alert,
    idle,
    fed,
    purr: 0,
    mouse,
    seq: p.seq,
    pointerSeq,
    strokeSeq,
    seed,
  }
}

/** Which of a pose's two frames shows: most flip every tick, snores and purrs every half second. */
export function frameOf(s: Neko): 0 | 1 {
  const n = s.pose === 'sleep' || s.pose === 'purr' ? Math.floor(s.tick / 5) : s.tick
  return n % 2 === 0 ? 0 : 1
}

// The ASCII style.

// Two frames a pose alternates between.
type Pair = [string[], string[]]

const RUN: Pair = [
  ['   /\\_/\\ ', ' ~( o.o) ', '  /\\  /\\ '],
  ['   /\\_/\\ ', ' ~( o.o) ', '   )_)_) '],
]
const SIT = ['  /\\_/\\  ', ' ( o.o ) ', '  > ^ <  ']
const ALERT = ['  /\\_/\\ !', ' ( O.O ) ', '  > ^ <  ']
const SCRATCH: Pair = [
  ['  /\\_/\\  ', ' ( >.< ) ', '  > ^ < /'],
  ['  /\\_/\\  ', ' ( >.< ) ', '  > ^ < \\'],
]
const YAWN = ['  /\\_/\\  ', ' ( -O- ) ', '  > ^ <  ']
const SLEEP: Pair = [
  ['  /\\_/\\ z', ' ( -.- ) ', '  (___)  '],
  ['  /\\_/\\  ', ' ( -.- )Z', '  (___)  '],
]
const CAUGHT = ['  /\\_/\\  ', ' ( ^.^ ) ', '  > ^ <~ ']
const PURR: Pair = [
  ['  /\\_/\\ \u2665', ' ( -.- ) ', '  > ^ <  '],
  ['  /\\_/\\  ', ' ( -.- )\u2665', '  > ^ <  '],
]
const MOUSE_LEFT = '<:3)~'
const MOUSE_RIGHT = '~(E:>'

const SWAP: Record<string, string> = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<' }

function mirror(row: string): string {
  return [...row]
    .reverse()
    .map(ch => SWAP[ch] ?? ch)
    .join('')
}

function pick(pair: Pair, i: 0 | 1): string[] {
  return i === 0 ? pair[0] : pair[1]
}

function asciiSprite(s: Neko): string[] {
  const frame = frameOf(s)
  switch (s.pose) {
    case 'run':
      return s.dir === -1 ? pick(RUN, frame).map(mirror) : pick(RUN, frame)
    case 'alert':
      return ALERT
    case 'scratch':
      return pick(SCRATCH, frame)
    case 'yawn':
      return YAWN
    case 'sleep':
      return pick(SLEEP, frame)
    case 'caught':
      return CAUGHT
    case 'purr':
      return pick(PURR, frame)
    default:
      return SIT
  }
}

/** A stretch of one ASCII row, so the cat and the mouse can take their own colours. */
export type Run = { text: string; isMouse: boolean }

/** The ASCII cat's three rows, the mouse on the bottom one. */
export function asciiRows(s: Neko): Run[][] {
  const pad = ' '.repeat(s.x)
  const drawn = asciiSprite(s).map(row => [...(pad + row)])
  const bottom = drawn[drawn.length - 1]
  const { mouse } = s
  const plain = (cells: string[]): Run[] => [{ text: cells.join(''), isMouse: false }]
  if (mouse === null || bottom === undefined) {
    return drawn.map(plain)
  }
  // The mouse shows only where the cat leaves a blank, so the cat stays in front.
  const sprite = [...(mouse.dir === 1 ? MOUSE_RIGHT : MOUSE_LEFT)]
  while (bottom.length < mouse.x + sprite.length) bottom.push(' ')
  const runs: Run[] = []
  bottom.forEach((ch, i) => {
    const glyph = sprite[i - mouse.x]
    const isMouse = glyph !== undefined && ch === ' '
    const text = isMouse ? glyph : ch
    const last = runs[runs.length - 1]
    if (last !== undefined && last.isMouse === isMouse) last.text += text
    else runs.push({ text, isMouse })
  })
  return [...drawn.slice(0, -1).map(plain), runs]
}

/** The ASCII rows as plain text. */
export function rows(s: Neko): string[] {
  return asciiRows(s).map(runs => runs.map(run => run.text).join(''))
}
