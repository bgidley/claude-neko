import { describe, expect, mock, test } from 'claude-code/testing'

const props = (over: { maxRows?: number; bodyColumns?: number } = {}) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: over.maxRows ?? 20,
  bodyColumns: over.bodyColumns ?? 80,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
})

describe('the band above the prompt', () => {
  test('draws pixel art on the terminal', { options: { style: 'pixel' } }, async $ => {
    const ui = await $.ui.mount({
      plugin: 'neko',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: props(),
    })
    const raster = await ui.find({ type: 'Raster' })
    expect(raster?.props.columns).toBe(80)
    expect(raster?.props.rows).toBe(6)
  })

  test('picks pixel art by itself where the terminal has true colour', async ($, on) => {
    mock.env(on, { COLORTERM: 'truecolor' })
    const ui = await $.ui.mount({
      plugin: 'neko',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: props(),
    })
    expect(await ui.find({ type: 'Raster' })).toBeDefined()
  })

  test('falls back to coloured ASCII without true colour', async ($, on) => {
    mock.env(on, {})
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'neko', surface, component: 'AbovePrompt', props: props() })
      expect(await ui.find({ type: 'Raster' })).toBeUndefined()
      expect(await ui.find({ type: 'Client' })).toBeDefined()
      await ui.advance(100)
      const ears = await ui.findAll({ type: 'Text', text: /\/\\_\/\\/, in: 'neko' })
      expect(ears.map(el => el.props.color)).toContain('#f0a35e')
      await ui.unmount()
    }
  })

  test('falls back to ASCII when the band is too short for pixels', { options: { style: 'pixel' } }, async $ => {
    const ui = await $.ui.mount({
      plugin: 'neko',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: props({ maxRows: 4 }),
    })
    expect(await ui.find({ type: 'Client' })).toBeDefined()
  })
})
