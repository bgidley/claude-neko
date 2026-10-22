import type { Pose } from './neko-logic.ts'

// The ceiling cat: it lives in the top third of the fullscreen transcript, over the
// conversation, and moves in two dimensions. Positions are in cells from the top left
// of the transcript's viewport.

/** A word lifted out of the conversation, knocked about with a velocity in cells per tick. */
export type Toy = { word: string; x: number; y: number; vx: number; vy: number }

/** A word Claude wrote that shows in the top third, where it shows. */
export type Word = { key: string; text: string; x: number; y: number }

export type Mode = 'wander' | 'chase' | 'hunt' | 'pounce' | 'play' | 'stopped'

export type Ceiling = {
  x: number
  y: number
  dir: 1 | -1
  pose: Pose
  mode: Mode
  tick: number
  goal: { x: number; y: number }
  // The line of text it chases while the conversation scrolls, moving with it.
  target: { x: number; y: number } | null
  toy: Toy | null
  // Ticks since it last moved, since the conversation last scrolled, and left in a pose.
  still: number
  calm: number
  hold: number
  // Bats left before it tires of the toy, and the last word it caught.
  bats: number
  played: string | null
  seed: number
}

/** The cells the cat may use: the viewport's width and its top third. */
export type Room = { columns: number; rows: number }

/** How big the cat is in a style, in cells. */
export type Size = { cat: number; rows: number }

/** What the cat notices each tick. */
export type Sight = {
  // Rows the conversation moved up since the last tick (negative: down).
  scrolled: number
  isWorking: boolean
  // Claude was interrupted: it stops where it is until the next turn starts.
  isStopped: boolean
  word: Word | null
}

export const CALM_TICKS = 15 // the conversation still this long, it goes for a word
const BATS = 5
const ROAM_PAUSE = 25
const SCRATCH_AT = 20
const SIT_AGAIN_AT = 32
const YAWN_AT = 60
const SLEEP_AT = 80

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// A number in [0, n) that changes every tick, the same for the same cat and tick.
function chance(s: Ceiling, n: number, salt = 0): number {
  let h = (s.seed * 2654435761 + s.tick * 40503 + salt * 9973) >>> 0
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
  return h % Math.max(1, n)
}

/** The ceiling cat appears in the top right corner, sitting. */
export function ceilingStart(room: Room, size: Size, seed = 1): Ceiling {
  const x = Math.max(0, room.columns - size.cat)
  return {
    x,
    y: 0,
    dir: -1,
    pose: 'sit',
    mode: 'wander',
    tick: 0,
    goal: { x, y: 0 },
    target: null,
    toy: null,
    still: 0,
    calm: CALM_TICKS,
    hold: 0,
    bats: 0,
    played: null,
    seed,
  }
}

// Where the cat stands so that its paws are on a cell.
function standOn(cell: { x: number; y: number }, size: Size): { x: number; y: number } {
  return { x: cell.x - (size.cat >> 1), y: cell.y - size.rows + 1 }
}

/** One tick of the ceiling cat. */
export function ceilingStep(s: Ceiling, sight: Sight, room: Room, size: Size): Ceiling {
  const maxX = Math.max(0, room.columns - size.cat)
  const maxY = Math.max(0, room.rows - size.rows)
  const tick = s.tick + 1
  const at = { ...s, tick, x: clamp(s.x, 0, maxX), y: clamp(s.y, 0, maxY) }

  if (sight.isStopped) {
    return { ...at, mode: 'stopped', pose: 'sit', target: null, toy: null, goal: { x: at.x, y: at.y } }
  }

  let { mode, target, toy, calm, hold, bats, played } = at
  if (mode === 'stopped') mode = 'wander'

  if (sight.scrolled !== 0) {
    // The text is on the move: after it. A word in its paws is dropped.
    calm = 0
    toy = null
    if (target !== null) target = { ...target, y: target.y - sight.scrolled }
    if (target === null || target.y < 0 || target.y >= room.rows) {
      const fromBelow = sight.scrolled > 0
      target = { x: chance(at, room.columns, 1), y: fromBelow ? room.rows - 1 : 0 }
    }
    mode = 'chase'
  } else {
    calm += 1
    if (mode === 'chase' && calm > 3) {
      mode = 'wander'
      target = null
    }
  }

  // Once the conversation has settled, the newest word in reach is fair game.
  const word = sight.word
  if (
    calm >= CALM_TICKS &&
    word !== null &&
    word.key !== played &&
    (mode === 'wander' || mode === 'play')
  ) {
    mode = 'hunt'
    played = word.key
    toy = null
  }

  // The word went out of reach before it got there.
  if (mode === 'hunt' && word === null) mode = 'wander'

  let goal = at.goal
  let pose: Pose = at.pose
  if (mode === 'chase' && target !== null) {
    goal = standOn(target, size)
  } else if (mode === 'hunt' && word !== null) {
    goal = standOn({ x: word.x + (word.text.length >> 1), y: word.y }, size)
  } else if (mode === 'play' && toy !== null) {
    goal = standOn({ x: Math.round(toy.x) + (toy.word.length >> 1), y: Math.round(toy.y) }, size)
  } else if (mode === 'wander' && sight.isWorking && at.still >= ROAM_PAUSE) {
    goal = { x: chance(at, maxX + 1, 2), y: chance(at, maxY + 1, 3) }
  }
  goal = { x: clamp(goal.x, 0, maxX), y: clamp(goal.y, 0, maxY) }

  // The toy slides on, slowing, and bounces off the edges of the top third.
  if (toy !== null) {
    let { x, y, vx, vy } = toy
    x += vx
    y += vy
    const maxToyX = Math.max(0, room.columns - toy.word.length)
    if (x < 0 || x > maxToyX) {
      vx = -vx
      x = clamp(x, 0, maxToyX)
    }
    if (y < 0 || y > room.rows - 1) {
      vy = -vy
      y = clamp(y, 0, room.rows - 1)
    }
    vx *= 0.8
    vy *= 0.7
    if (Math.abs(vx) < 0.3) vx = 0
    if (Math.abs(vy) < 0.3) vy = 0
    toy = { ...toy, x, y, vx, vy }
  }

  let { x, y, dir, still } = at
  if (hold > 0) {
    hold -= 1
  } else if (goal.x !== x || goal.y !== y) {
    // Two cells a tick across; down or up a row every other tick, a row being taller.
    const speed = mode === 'chase' || mode === 'hunt' || sight.isWorking ? 2 : 1
    if (goal.x !== x) {
      dir = goal.x > x ? 1 : -1
      x = dir === 1 ? Math.min(goal.x, x + speed) : Math.max(goal.x, x - speed)
    }
    if (goal.y !== y && (tick % 2 === 0 || goal.x === x)) y += goal.y > y ? 1 : -1
    pose = 'run'
    still = 0
  } else {
    still += 1
    if (mode === 'hunt' && word !== null) {
      // Crouch, then pounce: the word comes away in its paws.
      mode = 'pounce'
      pose = 'alert'
      hold = 3
      toy = { word: word.text, x: word.x, y: word.y, vx: 0, vy: 0 }
    } else if (mode === 'pounce') {
      mode = 'play'
      bats = BATS
      pose = 'caught'
      hold = 3
    } else if (mode === 'play' && toy !== null && toy.vx === 0 && toy.vy === 0) {
      if (bats > 0) {
        // A swipe: off it goes, away from the paw that hit it.
        const side = chance(at, 2, 4) === 0 ? -1 : 1
        toy = { ...toy, vx: side * (2 + chance(at, 3, 5)), vy: chance(at, 3, 6) - 1 }
        dir = side === 1 ? 1 : -1
        bats -= 1
        pose = 'scratch'
        hold = 1
      } else {
        // Bored of it now.
        mode = 'wander'
        toy = null
        pose = 'yawn'
        hold = 8
        still = YAWN_AT
      }
    } else if (mode === 'wander' || mode === 'chase') {
      pose = restingPose(still, sight.isWorking)
    }
  }

  return {
    ...at,
    x,
    y,
    dir,
    pose,
    mode,
    goal,
    target,
    toy,
    still,
    calm,
    hold,
    bats,
    played,
  }
}

function restingPose(still: number, isWorking: boolean): Pose {
  if (still >= SLEEP_AT && !isWorking) return 'sleep'
  if (still >= YAWN_AT && still < YAWN_AT + 8 && !isWorking) return 'yawn'
  if (still >= SCRATCH_AT && still < SIT_AGAIN_AT) return 'scratch'
  return 'sit'
}

/** A word that is drawn as it looks, nothing of Markdown about it. */
const WORDY = /^[A-Za-z][A-Za-z'-]{3,13}$/

/**
 * Lines of a reply laid out as the transcript draws plain text: two cells in from the
 * left, wrapped at the viewport's width. Markdown marks are dropped, so it is close
 * for prose and lists, rougher for anything fancier.
 */
export function layOut(text: string, columns: number): string[] {
  const width = Math.max(10, columns - 4)
  const lines: string[] = []
  for (const raw of text.replace(/\*\*|__|`/g, '').split('\n')) {
    const line = raw.replace(/^#+\s*/, '')
    if (line.length <= width) {
      lines.push(line)
      continue
    }
    let rest = line
    while (rest.length > width) {
      const cut = rest.lastIndexOf(' ', width)
      const at = cut > 0 ? cut : width
      lines.push(rest.slice(0, at))
      rest = rest.slice(at).replace(/^ /, '')
    }
    lines.push(rest)
  }
  return lines
}

/**
 * A word of a reply that shows in the top third: the reply's `first` row is the
 * viewport's top row (its row 0 being the blank row above it). The pick is the
 * longest word there, the earliest of equals.
 */
export function wordInReach(
  key: string,
  text: string,
  first: number,
  columns: number,
  rows: number,
): Word | null {
  const lines = layOut(text, columns)
  let best: Word | null = null
  lines.forEach((line, i) => {
    const y = i + 1 - first
    if (y < 0 || y >= rows) return
    for (const match of line.matchAll(/\S+/g)) {
      const bare = match[0].replace(/[.,;:!?)"]+$/, '').replace(/^[("]+/, '')
      if (!WORDY.test(bare)) continue
      if (best !== null && bare.length <= best.text.length) continue
      const x = 2 + (match.index ?? 0) + match[0].indexOf(bare)
      best = { key: `${key}:${y + first}:${x}`, text: bare, x, y }
    }
  })
  return best
}
