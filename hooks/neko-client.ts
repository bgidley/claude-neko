import type { ClientModule } from 'claude-code'

import { ASCII, TICK_MS, asciiRows, initial, step } from './neko-logic.ts'
import type { Neko, NekoProps } from './neko-logic.ts'
import { PIXEL, pixelRows } from './pixel.ts'
import type { CatName } from './pixel.ts'

/** What the hooks module hands the band: the cat's world, which cat, and how to draw it. */
export type BandProps = NekoProps & { cat: CatName; style: 'pixel' | 'ascii' }

// The ASCII cat's colours. The black cat is drawn light grey, so it shows on a dark terminal.
const CAT_COLORS: Record<CatName, string> = { tabby: '#f0a35e', black: '#9a9aaa' }
const MOUSE_COLOR = '#aab0b8'

// The newest props and pointer, read by the tick: a redraw hands props in without
// restarting the clock, and the pointer moves between ticks.
let latest: BandProps = { isWorking: false, col: 0, seq: 0, cat: 'tabby', style: 'ascii' }
let pointer: { x: number | null; seq: number } = { x: null, seq: 0 }

const NekoClient: ClientModule<BandProps, Neko> = (props, surface) => {
  const { Box, Text } = surface.elements
  latest = props
  let state = surface.state
  if (state === undefined) {
    state = initial(props)
    surface.setState(state)
    surface.onPointer(e => {
      if (e.type === 'leave') pointer = { x: null, seq: pointer.seq }
      else pointer = { x: e.x, seq: pointer.seq + 1 }
    })
    surface.every(TICK_MS, () => {
      const now = surface.state ?? initial(latest)
      const geometry = latest.style === 'pixel' ? PIXEL : ASCII
      const world = { ...latest, pointer: pointer.x, pointerSeq: pointer.seq }
      surface.setState(step(now, world, surface.columns, geometry))
    })
  }
  const width = surface.columns

  if (props.style === 'pixel') {
    return Box({
      flexDirection: 'column',
      children: pixelRows(state, width, props.cat).map(runs =>
        Text({
          wrap: 'truncate',
          children: runs.map(run => Text({ color: run.fg, backgroundColor: run.bg, children: run.text })),
        }),
      ),
    })
  }

  const catColor = CAT_COLORS[props.cat] ?? CAT_COLORS.tabby
  return Box({
    flexDirection: 'column',
    children: asciiRows(state).map(runs => {
      let room = width > 0 ? width : Number.POSITIVE_INFINITY
      return Text({
        wrap: 'truncate',
        children: runs.map(run => {
          const text = run.text.slice(0, Math.max(0, room))
          room -= text.length
          return Text({ color: run.isMouse ? MOUSE_COLOR : catColor, children: text })
        }),
      })
    }),
  })
}

export default NekoClient
