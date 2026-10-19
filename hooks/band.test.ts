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
    const client = await ui.find({ type: 'Client' })
    expect(client?.props.height).toBe(6)
    await ui.resize({ in: 'neko', columns: 80, rows: 6 })
    await ui.advance(100)
    const blocks = await ui.findAll({ type: 'Text', text: /\u2580/, in: 'neko' })
    expect(blocks.some(el => /^#[0-9a-f]{6}$/.test(String(el.props.color)))).toBe(true)
  })

  test('picks pixel art by itself where the terminal has true colour', async ($, on) => {
    mock.env(on, { COLORTERM: 'truecolor' })
    const ui = await $.ui.mount({
      plugin: 'neko',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: props(),
    })
    expect((await ui.find({ type: 'Client' }))?.props.height).toBe(6)
  })

  test('follows the pointer over the band', { options: { style: 'ascii' } }, async $ => {
    const ui = await $.ui.mount({
      plugin: 'neko',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: props(),
    })
    await ui.resize({ in: 'neko', columns: 80, rows: 3 })
    await ui.advance(100)
    await ui.pointer({ in: 'neko', type: 'move', x: 60, y: 1 })
    await ui.advance(8000)
    // The ASCII cat is 9 columns wide, its ears 2 in: centred on column 60.
    const ears = await ui.findAll({ type: 'Text', text: /\/\\_\/\\/, in: 'neko' })
    const row = ears.map(el => el.text).find(text => text.trimStart().startsWith('/'))
    expect(row?.indexOf('/\\_/\\')).toBe(60 - 4 + 2)
  })

  test('falls back to coloured ASCII without true colour', async ($, on) => {
    mock.env(on, {})
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'neko', surface, component: 'AbovePrompt', props: props() })
      expect((await ui.find({ type: 'Client' }))?.props.height).toBe(3)
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
    expect((await ui.find({ type: 'Client' }))?.props.height).toBe(3)
  })

  test('draws the black cat in ASCII too', { options: { cat: 'black' } }, async ($, on) => {
    mock.env(on, {})
    const ascii = await $.ui.mount({ plugin: 'neko', surface: 'terminal', component: 'AbovePrompt', props: props() })
    await ascii.advance(100)
    const ears = await ascii.findAll({ type: 'Text', text: /\/\\_\/\\/, in: 'neko' })
    expect(ears.map(el => el.props.color)).toContain('#9a9aaa')
    await ascii.unmount()
  })

  test('a press on the cat strokes it, and it purrs', { options: { style: 'ascii' } }, async ($, on) => {
    mock.clock(on, { now: 1_000 })
    const played: string[] = []
    // Stands in for the speaker: notes the clip and answers as played.
    on('audio.play', ($, e) => {
      if ('asset' in e.clip && e.clip.asset !== undefined) played.push(e.clip.asset)
      return { value: undefined }
    })
    const ui = await $.ui.mount({ plugin: 'neko', surface: 'terminal', component: 'AbovePrompt', props: props() })
    await ui.resize({ in: 'neko', columns: 80, rows: 3 })
    await ui.advance(100)
    // The cat sits at the left edge: column 4 is its face.
    await ui.pointer({ in: 'neko', type: 'down', x: 4, y: 1, button: 'left' })
    await ui.pointer({ in: 'neko', type: 'move', x: 5, y: 1, button: 'left' })
    await ui.pointer({ in: 'neko', type: 'up', x: 5, y: 1, button: 'left' })
    await ui.advance(100)
    expect(await ui.find({ type: 'Text', text: /-\.-/, in: 'neko' })).toBeDefined()
    expect(played).toEqual(['sounds/purr.wav'])
  })

  test('a press away from the cat calls it over instead', { options: { style: 'ascii' } }, async ($, on) => {
    mock.clock(on)
    const ui = await $.ui.mount({ plugin: 'neko', surface: 'terminal', component: 'AbovePrompt', props: props() })
    await ui.resize({ in: 'neko', columns: 80, rows: 3 })
    await ui.advance(100)
    await ui.pointer({ in: 'neko', type: 'down', x: 40, y: 1, button: 'left' })
    await ui.pointer({ in: 'neko', type: 'up', x: 40, y: 1, button: 'left' })
    await ui.advance(6000)
    expect(await ui.find({ type: 'Text', text: /-\.-/, in: 'neko' })).toBeUndefined()
    const ears = await ui.findAll({ type: 'Text', text: /\/\\_\/\\/, in: 'neko' })
    const row = ears.map(el => el.text).find(text => text.trimStart().startsWith('/'))
    expect(row?.indexOf('/\\_/\\')).toBe(40 - 4 + 2)
  })
})
