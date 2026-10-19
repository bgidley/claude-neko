import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Caret } from '../types'
import { TICK_MS, initial, step } from './neko-logic.ts'
import type { Neko, NekoProps } from './neko-logic.ts'
import { PIXEL, PIXEL_ROWS, pixelCells } from './pixel.ts'
import type { CatName } from './pixel.ts'

const caret = atom({ plugin: 'neko', key: 'caret' } as const, { col: 0, seq: 0 })
const isHidden = atom({ plugin: 'neko', key: 'isHidden' } as const, false)

// The prompt box draws "> " before the draft.
const PROMPT_PREFIX = 2
const KEY = 'neko'
// Blits refused in a row before the timer stops trying until the next draw.
const MAX_DENIED = 20

type Style = 'auto' | 'pixel' | 'ascii'

function caretOf(text: string, cursor: number, seq: number): Caret {
  const before = text.slice(0, cursor)
  return { col: PROMPT_PREFIX + before.length - (before.lastIndexOf('\n') + 1), seq }
}

// The pixel cat is animated here and painted with blits; the ASCII one animates itself.
type Pixel = {
  cat: CatName
  neko: Neko
  now: NekoProps
  // Where the Raster is mounted, while it is.
  site: { requestId: string; columns: number } | null
  painted: string
  denied: number
}

async function tick($: EngineInterface, px: Pixel): Promise<void> {
  if (px.site === null) return
  const { requestId, columns } = px.site
  px.neko = step(px.neko, px.now, columns, PIXEL)
  const cells = pixelCells(px.neko, columns, px.cat)
  if (cells === px.painted) return
  px.painted = cells
  const { deny } = await $.ui.blit({ requestId, key: KEY, cells, columns, rows: PIXEL_ROWS })
  px.denied = deny === undefined ? 0 : px.denied + 1
  if (px.denied >= MAX_DENIED) px.site = null
}

export const register: Register = (on, options) => {
  const style: Style =
    options.style === 'pixel' || options.style === 'ascii' ? options.style : 'auto'
  // Read on the first draw, so a reload or a session already running has it too.
  let hasTrueColor: boolean | undefined
  const px: Pixel = {
    cat: options.cat === 'black' ? 'black' : 'tabby',
    neko: initial({ isWorking: false, col: 0, seq: 0 }),
    now: { isWorking: false, col: 0, seq: 0 },
    site: null,
    painted: '',
    denied: 0,
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'neko',
      description: 'Show or hide the cat above the prompt',
    })
    $.clock.every(TICK_MS, () => void tick($, px))

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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Only the terminal and desktop tables carry Client; only the terminal's, Raster.
    if (e.surface === 'mobile' || e.surface === 'vscode') {
      return next(e)
    }
    if (e.props.hasSurvey || (await read($, isHidden))) {
      px.site = null
      return next(e)
    }

    const { col, seq } = await read($, caret)
    px.now = { isWorking: e.props.isWorking, col, seq }
    const columns = e.props.bodyColumns
    const fits = e.props.maxRows >= PIXEL_ROWS && columns >= PIXEL.cat + PIXEL.mouse
    if (style === 'auto' && hasTrueColor === undefined) {
      const colorterm = await $.env.get('COLORTERM').catch(() => undefined)
      hasTrueColor = /truecolor|24bit/i.test(colorterm ?? '')
    }
    const wantsPixel = style === 'pixel' || (style === 'auto' && hasTrueColor === true)

    if (e.surface === 'terminal' && wantsPixel && fits) {
      const { Raster } = $.ui.resolve(e)
      px.site = { requestId: e.requestId, columns }
      px.denied = 0
      px.painted = pixelCells(px.neko, columns, px.cat)
      return <Raster key={KEY} columns={columns} rows={PIXEL_ROWS} cells={px.painted} />
    }

    px.site = null
    const { Client } = $.ui.resolve(e)
    return (
      <Client
        key={KEY}
        module="./neko-client.ts"
        props={{ ...px.now, cat: px.cat }}
        width="100%"
        height={3}
      />
    )
  })
}
