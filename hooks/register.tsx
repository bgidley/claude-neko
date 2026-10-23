import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Caret } from '../types'
import { ceilingStart, ceilingStep, wordInReach } from './ceiling.ts'
import type { Ceiling, Room, Size } from './ceiling.ts'
import type { BandMessage, BandProps } from './neko-client.ts'
import { ASCII, TICK_MS, frameOf, initial } from './neko-logic.ts'
import type { Neko } from './neko-logic.ts'
import { overlayRows } from './overlay.ts'
import { PIXEL, PIXEL_ROWS } from './pixel.ts'

const caret = atom({ plugin: 'neko', key: 'caret' } as const, { col: 0, seq: 0 })
const isHidden = atom({ plugin: 'neko', key: 'isHidden' } as const, false)
// Bumped each time the ceiling cat changes how it looks.
const frame = atom({ plugin: 'neko', key: 'frame' } as const, 0)
// The transcript row the ceiling cat is drawn from, which every row reads: written
// when it changes, it redraws the last one without the cat and the new one with it.
// It is the lowest row on screen, as the rows are painted top down: drawn from any
// row above, the rows below it would paint over the cat.
const topRowAtom = atom({ plugin: 'neko', key: 'topRow' } as const, '')

// The prompt box draws "> " before the draft.
const PROMPT_PREFIX = 2
const ASCII_ROWS = 3
// The purr's length: strokes inside it keep the one playing rather than start another.
const PURR_MS = 2400
// The word the cat plays with.
const TOY_COLOR = '#ffd75f'

// The transcript's rows that say which of their lines are on screen. A tool's
// result is drawn inside its ToolUse row, so it is not one of them.
const TRANSCRIPT = [
  'UserMessage',
  'AssistantMessage',
  'ToolUse',
  'ToolGroup',
  'CommandOutput',
  'TurnDuration',
  'InfoNotice',
] as const

type Style = 'auto' | 'pixel' | 'ascii'
type Place = 'band' | 'ceiling'
// A transcript row on screen: in what order it was first drawn, its first row on
// screen, how many rows it has, and its text for a reply.
type Shown = { order: number; first: number; of: number; reply?: string }

function caretOf(text: string, cursor: number, seq: number): Caret {
  const before = text.slice(0, cursor)
  return { col: PROMPT_PREFIX + before.length - (before.lastIndexOf('\n') + 1), seq }
}

// Pixel art is half-blocks in the terminal's own cells; the desktop draws ASCII.
function isPixelOn(surface: string, wantsPixel: boolean, rows: number, columns: number): boolean {
  return surface === 'terminal' && wantsPixel && rows >= PIXEL_ROWS && columns >= PIXEL.cat + PIXEL.mouse
}

// The ceiling cat as the band cat would draw it at the left edge: a pose to draw.
function asNeko(s: Ceiling): Neko {
  return { ...initial({ isWorking: false, col: 0, seq: 0 }), x: 0, dir: s.dir, pose: s.pose, tick: s.tick }
}

export const register: Register = (on, options) => {
  const style: Style =
    options.style === 'pixel' || options.style === 'ascii' ? options.style : 'auto'
  const place: Place = options.place === 'band' ? 'band' : 'ceiling'
  const cat = options.cat === 'black' ? 'black' : 'tabby'
  // Read on the first draw, so a reload or a session already running has it too.
  let hasTrueColor: boolean | undefined
  let purredAt = Number.NEGATIVE_INFINITY

  // The ceiling cat, stepped here: a surface module's region would blank the text
  // beneath all of it, where Box and Text paint only their own cells.
  const shown = new Map<string, Shown>()
  let order = 0
  let anchor: string | undefined
  // The row the cat is drawn from, and which of its rows is the top of the screen.
  let painter: string | undefined
  let lift = 0
  let scrolled = 0
  let ceiling: Ceiling | undefined
  let looks = ''
  let isWorking = false
  let isStopped = false
  let room: Room = { columns: 0, rows: 0 }
  let size: Size = { cat: PIXEL.cat, rows: PIXEL_ROWS }

  // The row at the top of the viewport: one cut off by the top edge, else the
  // earliest drawn of those on screen.
  function topRow(): string | undefined {
    let best: [string, Shown] | undefined
    for (const entry of shown) {
      const [, row] = entry
      if (best === undefined) best = entry
      else if ((row.first > 0) !== (best[1].first > 0)) best = row.first > 0 ? entry : best
      else if (row.order < best[1].order) best = entry
    }
    return best?.[0]
  }

  // The lowest row on screen and which of its rows is at the top of the screen: the
  // rows from the top one down to it, one after another, each as tall as it is.
  function bottomRow(top: string): { id: string; lift: number } {
    const from = shown.get(top)
    if (from === undefined) return { id: top, lift: 0 }
    const below = [...shown].filter(([, row]) => row.order >= from.order).sort((a, b) => a[1].order - b[1].order)
    let at = -from.first
    let last: [string, Shown] = [top, from]
    for (const entry of below.slice(1)) {
      at += last[1].of
      last = entry
    }
    return { id: last[0], lift: -at }
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'neko',
      description: 'Show or hide the cat',
    })
    if (place === 'ceiling') {
      $.clock.every(TICK_MS, async () => {
        if ((await read($, topRowAtom)) !== (painter ?? '')) await update($, topRowAtom, () => painter ?? '')
        const top = anchor === undefined ? undefined : shown.get(anchor)
        if (top === undefined || room.columns === 0 || (await read($, isHidden))) return
        const word =
          top.reply === undefined
            ? null
            : wordInReach(anchor ?? '', top.reply, top.first, room.columns, room.rows)
        const sight = { scrolled, isWorking, isStopped, word }
        scrolled = 0
        ceiling = ceilingStep(ceiling ?? ceilingStart(room, size, 1 + (order % 97)), sight, room, size)
        const toy = ceiling.toy
        const now = [
          ceiling.x,
          ceiling.y,
          ceiling.dir,
          ceiling.pose,
          frameOf(asNeko(ceiling)),
          toy?.word,
          toy && Math.round(toy.x),
          toy && Math.round(toy.y),
        ].join()
        if (now !== looks) {
          looks = now
          await update($, frame, n => n + 1)
        }
      })
    }

    return next(e)
  })

  on('command.run', { command: 'neko' }, async $ => {
    const wasHidden = await read($, isHidden)
    await update($, isHidden, () => !wasHidden)

    return { text: wasHidden ? 'Neko is back.' : 'Neko went for a walk.' }
  })

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    await update($, caret, c => caretOf(box.text, box.cursor, c.seq + 1))

    return box
  })

  on('prompt.change', async ($, e, next) => {
    await update($, caret, c => caretOf(e.text, e.cursor, c.seq + 1))

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = true
      isStopped = false
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      // Interrupted: the ceiling cat stops what it is doing until the next turn.
      isStopped = e.reason === 'aborted'
    }

    return next(e)
  })

  // A stroke from the band: purr. Only macOS plays a plugin's sounds; elsewhere the
  // engine skips it quietly and the cat purrs on screen alone.
  on('ui.message', async ($, e, next) => {
    const message = e.data as BandMessage | null
    if (message?.purr === true) {
      const now = await $.clock.now()
      if (now - purredAt >= PURR_MS) {
        purredAt = now
        void $.audio.play({ asset: 'sounds/purr.wav' }, { gain: 0.8 }).catch(() => undefined)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Only the terminal and desktop tables carry Client.
    if (e.surface === 'mobile' || e.surface === 'vscode') {
      return next(e)
    }
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }
    // Up on the ceiling instead.
    if (place === 'ceiling' && e.surface === 'terminal' && e.viewport?.isFullscreen === true) {
      return next(e)
    }

    const { col, seq } = await read($, caret)
    if (style === 'auto' && hasTrueColor === undefined) {
      const colorterm = await $.env.get('COLORTERM').catch(() => undefined)
      hasTrueColor = /truecolor|24bit/i.test(colorterm ?? '')
    }
    const wantsPixel = style === 'pixel' || (style === 'auto' && hasTrueColor === true)
    const isPixel = isPixelOn(e.surface, wantsPixel, e.props.maxRows, e.props.bodyColumns)
    const band: BandProps = {
      isWorking: e.props.isWorking,
      col,
      seq,
      cat,
      style: isPixel ? 'pixel' : 'ascii',
    }

    const { Client } = $.ui.resolve(e)
    return (
      <Client
        key="neko"
        module="./neko-client.ts"
        props={band}
        width="100%"
        height={isPixel ? PIXEL_ROWS : ASCII_ROWS}
      />
    )
  })

  // The ceiling cat, over the top third of the fullscreen transcript, drawn from the
  // row at the top of the viewport. Only fullscreen says what is on screen; while a
  // reply streams in no row is, and the cat waits out of sight until it lands.
  on('ui.render', { component: TRANSCRIPT }, async ($, e, next) => {
    if (place !== 'ceiling' || e.surface !== 'terminal' || e.viewport?.isFullscreen !== true) {
      return next(e)
    }
    const id = `${e.component}:${e.requestId}`
    const onScreen = e.props.onScreen
    const was = shown.get(id)
    if (onScreen === null || onScreen === undefined) {
      shown.delete(id)
    } else {
      const reply = e.component === 'AssistantMessage' ? e.props.text : undefined
      shown.set(id, { order: was?.order ?? order++, first: onScreen.first, of: onScreen.of, reply })
      // The top row moved: so did the conversation, by as many rows.
      if (id === anchor && was !== undefined) scrolled += onScreen.first - was.first
    }
    anchor = topRow()
    if (anchor === undefined) painter = undefined
    else ({ id: painter, lift } = bottomRow(anchor))
    // Before the clock first says which row it is, the one on top now.
    const drawnFrom = await read($, topRowAtom)
    if (drawnFrom !== id && drawnFrom !== '') return next(e)
    if (painter !== id || onScreen === null || onScreen === undefined) return next(e)
    if (await read($, isHidden)) return next(e)

    await read($, frame)
    const own = await next(e)
    if (style === 'auto' && hasTrueColor === undefined) {
      const colorterm = await $.env.get('COLORTERM').catch(() => undefined)
      hasTrueColor = /truecolor|24bit/i.test(colorterm ?? '')
    }
    const wantsPixel = style === 'pixel' || (style === 'auto' && hasTrueColor === true)
    const third = Math.floor(e.viewport.rows / 3)
    const isPixel = isPixelOn(e.surface, wantsPixel, third, e.viewport.columns)
    size = isPixel ? { cat: PIXEL.cat, rows: PIXEL_ROWS } : { cat: ASCII.cat, rows: ASCII_ROWS }
    // A column spare at the right, where the transcript's scrollbar goes.
    room = { columns: e.viewport.columns - 1, rows: Math.max(third, size.rows) }
    // It appears in the corner on the first draw, before the clock first ticks.
    ceiling ??= ceilingStart(room, size, 1 + (order % 97))

    const rows = overlayRows(asNeko(ceiling), size.cat, cat, isPixel ? 'pixel' : 'ascii')
    const toy = ceiling.toy
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {own}
        <Box position="absolute" top={lift + ceiling.y} left={ceiling.x} flexDirection="column">
          {rows.map(cells => (
            <Box flexDirection="row" height={1}>
              {cells.map(cell =>
                'gap' in cell ? (
                  <Box width={cell.gap} flexShrink={0} />
                ) : (
                  <Text color={cell.color} backgroundColor={cell.backgroundColor}>
                    {cell.text}
                  </Text>
                ),
              )}
            </Box>
          ))}
        </Box>
        {toy !== null && (
          <Box position="absolute" top={lift + Math.round(toy.y)} left={Math.round(toy.x)}>
            <Text color={TOY_COLOR} bold>
              {toy.word}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
