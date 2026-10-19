import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Caret } from '../types'
import type { BandMessage, BandProps } from './neko-client.ts'
import { PIXEL, PIXEL_ROWS } from './pixel.ts'

const caret = atom({ plugin: 'neko', key: 'caret' } as const, { col: 0, seq: 0 })
const isHidden = atom({ plugin: 'neko', key: 'isHidden' } as const, false)

// The prompt box draws "> " before the draft.
const PROMPT_PREFIX = 2
const ASCII_ROWS = 3
// The purr's length: strokes inside it keep the one playing rather than start another.
const PURR_MS = 2400

type Style = 'auto' | 'pixel' | 'ascii'

function caretOf(text: string, cursor: number, seq: number): Caret {
  const before = text.slice(0, cursor)
  return { col: PROMPT_PREFIX + before.length - (before.lastIndexOf('\n') + 1), seq }
}

export const register: Register = (on, options) => {
  const style: Style =
    options.style === 'pixel' || options.style === 'ascii' ? options.style : 'auto'
  const cat = options.cat === 'black' ? 'black' : 'tabby'
  // Read on the first draw, so a reload or a session already running has it too.
  let hasTrueColor: boolean | undefined
  let purredAt = Number.NEGATIVE_INFINITY

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'neko',
      description: 'Show or hide the cat above the prompt',
    })

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

    const { col, seq } = await read($, caret)
    const fits =
      e.props.maxRows >= PIXEL_ROWS && e.props.bodyColumns >= PIXEL.cat + PIXEL.mouse
    if (style === 'auto' && hasTrueColor === undefined) {
      const colorterm = await $.env.get('COLORTERM').catch(() => undefined)
      hasTrueColor = /truecolor|24bit/i.test(colorterm ?? '')
    }
    const wantsPixel = style === 'pixel' || (style === 'auto' && hasTrueColor === true)
    // Pixel art is half-blocks in the terminal's own cells; the desktop draws ASCII.
    const isPixel = e.surface === 'terminal' && wantsPixel && fits
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
}
