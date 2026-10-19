import type { ClientModule } from 'claude-code'

/** What the hooks module hands the cat: is Claude busy, where the caret is, an edit counter. */
export type NekoProps = { isWorking: boolean; col: number; seq: number }

export type Pose = 'run' | 'alert' | 'sit' | 'scratch' | 'yawn' | 'sleep'

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
  seq: number
  seed: number
}

export const TICK_MS = 100
export const CAT_WIDTH = 9
const CHASE_TICKS = 40 // follow the caret for 4s after a keystroke
const STARTLE_AFTER = 10 // a cat resting this long startles before it runs
const ALERT_TICKS = 3
const ROAM_PAUSE = 8 // while Claude works, sit this long, then run somewhere new
const SCRATCH_AT = 20
const SIT_AGAIN_AT = 32
const YAWN_AT = 60
const SLEEP_AT = 80

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
    seq: props.seq,
    seed: 1 + (props.seq % 9973),
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** One frame of xneko's state machine for a band `columns` wide. */
export function step(s: Neko, p: NekoProps, columns: number): Neko {
  const room = Math.max(0, columns - CAT_WIDTH)
  const typed = p.seq !== s.seq
  const sinceTyped = typed ? 0 : s.sinceTyped + 1
  let { seed, goal, alert, still } = s
  const x = clamp(s.x, 0, room)

  if (sinceTyped < CHASE_TICKS) {
    // Stand just behind the caret, facing it.
    const caret = columns > 0 ? p.col % columns : 0
    goal = clamp(caret - CAT_WIDTH + 2, 0, room)
  } else if (p.isWorking) {
    if (still >= ROAM_PAUSE || goal > room) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      goal = seed % (room + 1)
    }
  } else {
    goal = x
  }

  const wantsToMove = goal !== x
  const wasResting = s.pose !== 'run' && s.pose !== 'alert'
  if (wantsToMove && wasResting && s.still >= STARTLE_AFTER) {
    alert = ALERT_TICKS
  }

  const base = { ...s, seed, goal, seq: p.seq, sinceTyped, tick: s.tick + 1 }

  if (alert > 0) {
    return { ...base, x, pose: 'alert', alert: alert - 1, still: 0 }
  }
  if (wantsToMove) {
    const speed = p.isWorking ? 2 : 1
    const dir = goal > x ? 1 : -1
    const next = dir === 1 ? Math.min(goal, x + speed) : Math.max(goal, x - speed)
    return { ...base, x: next, dir, pose: 'run', alert: 0, still: 0 }
  }

  still += 1
  let pose: Pose = 'sit'
  if (!p.isWorking) {
    if (still >= SLEEP_AT) pose = 'sleep'
    else if (still >= YAWN_AT) pose = 'yawn'
    else if (still >= SCRATCH_AT && still < SIT_AGAIN_AT) pose = 'scratch'
  }
  return { ...base, x, pose, alert: 0, still }
}

/** The cat's three rows, padded to its column. */
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
    default:
      sprite = SIT
  }
  const pad = ' '.repeat(s.x)
  return sprite.map(row => pad + row)
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
