import type { ClientModule } from 'claude-code'

import { TICK_MS, asciiRows, initial, step } from './neko-logic.ts'
import type { Neko, NekoProps } from './neko-logic.ts'

// The ASCII style: the fallback where the terminal draws no Raster or has no true colour.
const CAT_COLOR = '#f0a35e'
const MOUSE_COLOR = '#aab0b8'

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
  const width = surface.columns

  return Box({
    flexDirection: 'column',
    children: asciiRows(state).map(runs => {
      let room = width > 0 ? width : Number.POSITIVE_INFINITY
      return Text({
        wrap: 'truncate',
        children: runs.map(run => {
          const text = run.text.slice(0, Math.max(0, room))
          room -= text.length
          return Text({ color: run.isMouse ? MOUSE_COLOR : CAT_COLOR, children: text })
        }),
      })
    }),
  })
}

// The tick reads the newest props: a redraw hands them in without restarting the clock.
let latest: NekoProps = { isWorking: false, col: 0, seq: 0 }

export default NekoClient
