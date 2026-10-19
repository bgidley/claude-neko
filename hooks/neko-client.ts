import type { ClientModule } from 'claude-code'

/** What the hooks module hands the cat: is Claude busy, where the caret is, an edit counter. */
export type NekoProps = { isWorking: boolean; col: number; seq: number }

export type Pose = 'run' | 'alert' | 'sit' | 'scratch' | 'yawn' | 'sleep' | 'caught'

export type Mouse = { x: number; dir: 1 | -1 }

export type Neko = {
  x: number
  dir: 1 | -1
  pose: Pose
  goal: number
  tick: number
  // Ticks since the cat last moved, since the last keystroke, and left to stay startled.
  still: number
  sinceTyped: number
  alert: number
  // Ticks with no typing and no work, and left to look pleased after a catch.
  idle: number
  fed: number
  mouse: Mouse | null
  seq: number
  seed: number
}

export const TICK_MS = 100
export const CAT_WIDTH = 9
export const MOUSE_WIDTH = 5
export const MOUSE_AT = 300 // a mouse turns up after 30s with nothing happening
const CHASE_TICKS = 40 // follow the caret for 4s after a keystroke
const STARTLE_AFTER = 10 // a cat resting this long startles before it runs
const ALERT_TICKS = 3
const ROAM_PAUSE = 8 // while Claude works, sit this long, then run somewhere new
const SCRATCH_AT = 20
const SIT_AGAIN_AT = 32
const YAWN_AT = 60
const SLEEP_AT = 80
const FLEE_RANGE = 18 // the mouse runs once the cat is this close
const CATCH_RANGE = 2
const FED_TICKS = 30

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
const MOUSE_LEFT = '<:3)~'
const MOUSE_RIGHT = '~(E:>'

function pick(pair: Pair, i: number): string[] {
  return i === 0 ? pair[0] : pair[1]
}

const SWAP: Record<string, string> = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<' }

function mirror(row: string): string {
  return [...row].reverse().map(ch => SWAP[ch] ?? ch).join('')
}

export function initial(props: NekoProps): Neko {
  return {
    x: 0,
    dir: 1,
    pose: 'sit',
    goal: 0,
    tick: 0,
    still: 0,
    sinceTyped: CHASE_TICKS,
    alert: 0,
    idle: 0,
    fed: 0,
    mouse: null,
    seq: props.seq,
    seed: 1 + (props.seq % 9973),
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// How far the mouse's middle is from the cat's: positive when the mouse is to the right.
function gap(catX: number, mouse: Mouse): number {
  return mouse.x + (MOUSE_WIDTH >> 1) - (catX + (CAT_WIDTH >> 1))
}

function scurry(mouse: Mouse, catX: number, room: number, tick: number, seed: number): Mouse {
  const g = gap(catX, mouse)
  if (Math.abs(g) < FLEE_RANGE) {
    const dir = g >= 0 ? 1 : -1
    return { x: clamp(mouse.x + dir, 0, room), dir }
  }
  // Out of reach it sniffs about, a step now and then.
  if (tick % 6 !== 0) return mouse
  const dir = seed % 2 === 0 ? 1 : -1
  return { x: clamp(mouse.x + dir, 0, room), dir }
}

/** One frame of xneko's state machine for a band `columns` wide. */
export function step(s: Neko, p: NekoProps, columns: number): Neko {
  const room = Math.max(0, columns - CAT_WIDTH)
  const mouseRoom = Math.max(0, columns - MOUSE_WIDTH)
  const typed = p.seq !== s.seq
  const sinceTyped = typed ? 0 : s.sinceTyped + 1
  const isFollowingCaret = sinceTyped < CHASE_TICKS
  const isQuiet = !isFollowingCaret && !p.isWorking
  let { seed, goal, alert, still } = s
  const x = clamp(s.x, 0, room)
  let idle = isQuiet ? s.idle + 1 : 0
  let fed = isQuiet ? s.fed : 0
  // Typing or work scares the mouse off.
  let mouse = isQuiet && s.mouse !== null ? { ...s.mouse, x: clamp(s.mouse.x, 0, mouseRoom) } : null

  if (mouse === null && fed === 0 && idle >= MOUSE_AT && room > MOUSE_WIDTH) {
    // It turns up at the far end of the band from the cat.
    const fromRight = x + (CAT_WIDTH >> 1) < columns >> 1
    mouse = { x: fromRight ? mouseRoom : 0, dir: fromRight ? -1 : 1 }
  }

  if (isFollowingCaret) {
    // Stand just behind the caret, facing it.
    const caret = columns > 0 ? p.col % columns : 0
    goal = clamp(caret - CAT_WIDTH + 2, 0, room)
  } else if (p.isWorking) {
    if (still >= ROAM_PAUSE || goal > room) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      goal = seed % (room + 1)
    }
  } else if (mouse !== null) {
    goal = clamp(x + gap(x, mouse), 0, room)
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
    if (pose !== 'alert' && Math.abs(gap(nextX, mouse)) <= CATCH_RANGE) {
      mouse = null
      fed = FED_TICKS
      idle = 0
    } else {
      seed = (seed * 1103515245 + 12345) % 2147483648
      mouse = scurry(mouse, nextX, mouseRoom, s.tick, seed)
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
    alert,
    idle,
    fed,
    mouse,
    seq: p.seq,
    seed,
  }
}

// Draws `sprite` into `row` at `at`, only over blank cells so the cat stays in front.
function overlay(row: string, at: number, sprite: string): string {
  const cells = [...row.padEnd(at + sprite.length)]
  ;[...sprite].forEach((ch, i) => {
    if (cells[at + i] === ' ') cells[at + i] = ch
  })
  return cells.join('')
}

/** The cat's three rows, padded to its column, with the mouse on the bottom row. */
export function rows(s: Neko): string[] {
  const flip = s.tick % 2
  const slow = Math.floor(s.tick / 5) % 2
  let sprite: string[]
  switch (s.pose) {
    case 'run':
      sprite = pick(RUN, flip)
      if (s.dir === -1) sprite = sprite.map(mirror)
      break
    case 'alert':
      sprite = ALERT
      break
    case 'scratch':
      sprite = pick(SCRATCH, flip)
      break
    case 'yawn':
      sprite = YAWN
      break
    case 'sleep':
      sprite = pick(SLEEP, slow)
      break
    case 'caught':
      sprite = CAUGHT
      break
    default:
      sprite = SIT
  }
  const pad = ' '.repeat(s.x)
  const drawn = sprite.map(row => pad + row)
  const { mouse } = s
  if (mouse !== null) {
    const last = drawn.length - 1
    drawn[last] = overlay(drawn[last] ?? '', mouse.x, mouse.dir === 1 ? MOUSE_RIGHT : MOUSE_LEFT)
  }
  return drawn
}

const NekoClient: ClientModule<NekoProps, Neko> = (props, surface) => {
  const { Box, Text } = surface.elements
  let state = surface.state
  if (state === undefined) {
    state = initial(props)
    surface.setState(state)
    surface.every(TICK_MS, () => {
      const now = surface.state ?? initial(props)
      surface.setState(step(now, latest, surface.columns))
    })
  }
  latest = props

  return Box({
    flexDirection: 'column',
    children: rows(state).map(row =>
      Text({ children: surface.columns > 0 ? row.slice(0, surface.columns) : row, wrap: 'truncate' }),
    ),
  })
}

// The tick reads the newest props: a redraw hands them in without restarting the clock.
let latest: NekoProps = { isWorking: false, col: 0, seq: 0 }

export default NekoClient
