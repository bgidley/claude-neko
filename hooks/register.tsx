import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Caret } from '../types'
import type { BandMessage, BandProps } from './neko-client.ts'
import { ASCII, TICK_MS, frameOf, initial, step } from './neko-logic.ts'
import type { Neko } from './neko-logic.ts'
import { overlayRows } from './overlay.ts'
import { PIXEL, PIXEL_ROWS } from './pixel.ts'

const caret = atom({ plugin: 'neko', key: 'caret' } as const, { col: 0, seq: 0 })
const isHidden = atom({ plugin: 'neko', key: 'isHidden' } as const, false)
// Bumped each time the cat over the transcript changes how it looks.
const frame = atom({ plugin: 'neko', key: 'frame' } as const, 0)

// The prompt box draws "> " before the draft.
const PROMPT_PREFIX = 2
const ASCII_ROWS = 3
// The purr's length: strokes inside it keep the one playing rather than start another.
const PURR_MS = 2400

// The transcript's rows the cat can ride on: whichever was drawn last is the one at
// the bottom of the conversation, where Claude's output scrolls in.
const TRANSCRIPT = [
  'UserMessage',
  'AssistantMessage',
  'ToolUse',
  'ToolGroup',
  'Spinner',
  'TurnDuration',
  'CommandOutput',
] as const

type Style = 'auto' | 'pixel' | 'ascii'
type Place = 'band' | 'overlay'

function caretOf(text: string, cursor: number, seq: number): Caret {
  const before = text.slice(0, cursor)
  return { col: PROMPT_PREFIX + before.length - (before.lastIndexOf('\n') + 1), seq }
}

// Pixel art is half-blocks in the terminal's own cells; the desktop draws ASCII.
function isPixelOn(surface: string, wantsPixel: boolean, rows: number, columns: number): boolean {
  return surface === 'terminal' && wantsPixel && rows >= PIXEL_ROWS && columns >= PIXEL.cat + PIXEL.mouse
}

export const register: Register = (on, options) => {
  const style: Style =
    options.style === 'pixel' || options.style === 'ascii' ? options.style : 'auto'
  const place: Place = options.place === 'overlay' ? 'overlay' : 'band'
  const cat = options.cat === 'black' ? 'black' : 'tabby'
  // Read on the first draw, so a reload or a session already running has it too.
  let hasTrueColor: boolean | undefined
  let purredAt = Number.NEGATIVE_INFINITY
  // Over the transcript: the site the cat sits on and the one before it that was not
  // the spinner, the sites seen so far, and what the spinner last said. The spinner
  // comes and goes under one id, so a change in what it says is how it tells it has
  // come back below the newest row.
  let anchor: string | undefined
  let lastRow: string | undefined
  const seen = new Set<string>()
  let spinnerSaid: string | undefined
  // The cat over the transcript, stepped here: a surface module's region would blank
  // the text beneath all of it, where Box and Text paint only their own cells.
  let neko: Neko | undefined
  let looks = ''
  let working = false
  let columns = 0
  let isPixel = false

  function moveTo(id: string | undefined): void {
    if (anchor !== undefined && !anchor.startsWith('Spinner:')) lastRow = anchor
    anchor = id
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'neko',
      description: 'Show or hide the cat',
    })
    if (place === 'overlay') {
      $.clock.every(TICK_MS, async () => {
        if (anchor === undefined || columns === 0 || (await read($, isHidden))) return
        const { col, seq } = await read($, caret)
        const props = { isWorking: working, col, seq }
        neko = step(neko ?? initial(props), props, columns, isPixel ? PIXEL : ASCII)
        const now = [neko.x, neko.dir, neko.pose, frameOf(neko), neko.mouse?.x, neko.mouse?.dir].join()
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
    $.ui.invalidate('ui.render')

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
      spinnerSaid = undefined
      working = true
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      working = false
      // The spinner has gone: back to the row above it.
      if (anchor?.startsWith('Spinner:') === true) {
        moveTo(lastRow)
        $.ui.invalidate('ui.render')
      }
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
    // Riding on the transcript instead, once there is a row to ride on.
    if (place === 'overlay' && e.viewport?.isFullscreen === true && anchor !== undefined) {
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

  // Over the transcript: the cat stands on the bottom rows of the newest one, so
  // Claude's output scrolls in under it. Only where the terminal is fullscreen: on the
  // main screen those rows go into the scrollback, cat and all.
  on('ui.render', { component: TRANSCRIPT }, async ($, e, next) => {
    if (place !== 'overlay' || e.surface !== 'terminal' || e.viewport?.isFullscreen !== true) {
      return next(e)
    }
    const id = `${e.component}:${e.requestId}`
    // While the reply streams in, the fullscreen transcript shows it in the
    // spinner's place.
    if (e.component === 'Spinner' && e.props.mode === 'responding') {
      if (anchor === id) {
        moveTo(lastRow)
        $.ui.invalidate('ui.render')
      }
      return next(e)
    }
    const said = e.component === 'Spinner' ? JSON.stringify(e.props) : undefined
    const isNewest = !seen.has(id) || (said !== undefined && said !== spinnerSaid)
    seen.add(id)
    if (said !== undefined) spinnerSaid = said
    if (isNewest && anchor !== id) {
      moveTo(id)
      // The last anchor drops the cat, and the band gives it up.
      $.ui.invalidate('ui.render')
    }
    if (anchor !== id || (await read($, isHidden))) return next(e)

    await read($, frame)
    const own = await next(e)
    if (style === 'auto' && hasTrueColor === undefined) {
      const colorterm = await $.env.get('COLORTERM').catch(() => undefined)
      hasTrueColor = /truecolor|24bit/i.test(colorterm ?? '')
    }
    const wantsPixel = style === 'pixel' || (style === 'auto' && hasTrueColor === true)
    columns = e.viewport.columns
    isPixel = isPixelOn(e.surface, wantsPixel, e.viewport.rows, columns)
    if (neko === undefined) return own
    const rows = overlayRows(neko, columns, cat, isPixel ? 'pixel' : 'ascii')

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {own}
        <Box position="absolute" bottom={0} left={0} flexDirection="column">
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
      </Box>
    )
  })
}
