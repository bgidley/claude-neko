import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { CALM_TICKS, ceilingStart, ceilingStep, layOut, wordInReach } from './ceiling.ts'
import type { Ceiling, Sight } from './ceiling.ts'

const room = { columns: 100, rows: 12 }
const size = { cat: 16, rows: 6 }
const quiet: Sight = { scrolled: 0, isWorking: false, isStopped: false, word: null }

function run(s: Ceiling, ticks: number, sight: Sight = quiet): Ceiling {
  for (let i = 0; i < ticks; i++) s = ceilingStep(s, sight, room, size)
  return s
}

describe('the ceiling cat', () => {
  test('appears in the top right corner, sitting', async () => {
    const s = ceilingStart(room, size)
    expect([s.x, s.y, s.pose]).toEqual([84, 0, 'sit'])
  })

  test('chases the conversation as it scrolls, and stays in the top third', async () => {
    let s = ceilingStart(room, size)
    for (let i = 0; i < 30; i++) {
      s = ceilingStep(s, { ...quiet, scrolled: 1 }, room, size)
      expect(s.mode).toBe('chase')
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(room.rows - size.rows)
    }
    expect(s.x).toBeLessThan(84)
    // Once it settles the chase is over.
    expect(run(s, 5).mode).toBe('wander')
  })

  test('catches a word once the scrolling stops, plays with it, then tires of it', async () => {
    const word = { key: 'reply:4:30', text: 'glistening', x: 30, y: 4 }
    let s = ceilingStart(room, size)
    s = ceilingStep(s, { ...quiet, scrolled: 2, word }, room, size)
    // Not while the text is still moving.
    s = run(s, CALM_TICKS - 2, { ...quiet, word })
    expect(s.toy).toBeNull()

    let caught = false
    let bats = 0
    let tired = false
    for (let i = 0; i < 600 && !tired; i++) {
      const before = s.toy
      s = ceilingStep(s, { ...quiet, word }, room, size)
      if (s.toy !== null && before === null) {
        caught = true
        expect(s.toy.word).toBe('glistening')
      }
      if (before !== null && s.toy !== null && before.vx === 0 && s.toy.vx !== 0) bats += 1
      if (caught && s.toy === null) tired = true
      if (s.toy !== null) {
        expect(s.toy.x).toBeGreaterThanOrEqual(0)
        expect(s.toy.y).toBeLessThan(room.rows)
      }
    }
    expect(caught).toBe(true)
    expect(bats).toBe(5)
    expect(tired).toBe(true)
    // It does not catch the same word twice.
    expect(run(s, 50, { ...quiet, word }).toy).toBeNull()
  })

  test('drops the word when the conversation scrolls on', async () => {
    const word = { key: 'k', text: 'mountains', x: 10, y: 2 }
    let s = ceilingStart(room, size)
    for (let i = 0; i < 200 && s.toy === null; i++) s = ceilingStep(s, { ...quiet, word }, room, size)
    expect(s.toy).not.toBeNull()
    s = ceilingStep(s, { ...quiet, scrolled: 1 }, room, size)
    expect(s.toy).toBeNull()
    expect(s.mode).toBe('chase')
  })

  test('stops where it is when Claude is interrupted', async () => {
    let s = run(ceilingStart(room, size), 10, { ...quiet, scrolled: 1 })
    const at = [s.x, s.y]
    s = run(s, 20, { ...quiet, scrolled: 1, isStopped: true })
    expect(s.mode).toBe('stopped')
    expect([s.x, s.y]).toEqual(at)
    expect(s.toy).toBeNull()
    // The next turn sets it going again.
    expect(ceilingStep(s, { ...quiet, scrolled: 1 }, room, size).mode).toBe('chase')
  })
})

describe('words on screen', () => {
  test('lays a reply out as the transcript wraps plain text', async () => {
    expect(layOut('**Bold** start\n## Head', 40)).toEqual(['Bold start', 'Head'])
    const lines = layOut('one two three four five six seven eight nine ten', 20)
    expect(lines.every(line => line.length <= 16)).toBe(true)
    expect(lines.join(' ')).toBe('one two three four five six seven eight nine ten')
  })

  test('picks the longest word in the top third, where it is drawn', async () => {
    const text = 'A tiny line.\nThe glistening shells.\nA spectacularly long word lower down.'
    // The reply's row 0 is the blank row above it; its second line is row 2.
    expect(wordInReach('r', text, 0, 80, 3)).toEqual({ key: 'r:2:6', text: 'glistening', x: 6, y: 2 })
    // Scrolled up two rows, everything moves up with it.
    expect(wordInReach('r', text, 2, 80, 3)?.text).toBe('spectacularly')
    expect(wordInReach('r', text, 2, 80, 3)?.y).toBe(1)
    expect(wordInReach('r', 'a b c', 0, 80, 3)).toBeNull()
  })
})

const reply = (first: number) => ({
  text: 'The sea stretches out.\nWaves roll in, glistening against the shore.\nGulls wheel.',
  isFirstOfReply: true,
  onScreen: { first, last: first + 30, of: 60 },
})
const fullscreen = { columns: 100, rows: 36, isFullscreen: true }

// Stands in for the engine's own drawing of a row.
function engineDraws(on: On): void {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

describe('the ceiling cat over the transcript', () => {
  test('draws over the top row of the fullscreen transcript, in the corner', async ($, on) => {
    mock.env(on, { COLORTERM: 'truecolor' })
    engineDraws(on)
    const ui = await $.ui.mount({
      plugin: 'neko',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: reply(5),
      viewport: fullscreen,
    })
    const blocks = await ui.findAll({ type: 'Text', text: /[▀▄]/ })
    expect(blocks.length).toBeGreaterThan(0)
    // In the top right corner: 100 columns, one spare, the cat 16 wide.
    const placed = (await ui.findAll({ type: 'Box' })).filter(el => el.props.position === 'absolute')
    expect(placed.map(el => [el.props.left, el.props.top])).toEqual([[83, 5]])
    // Only the cat's own cells are painted: no run of blanks to hide the text.
    const blanks = await ui.findAll({ type: 'Text', text: /^ +$/ })
    expect(blanks.length).toBe(0)
  })

  test('draws from the lowest row on screen, so nothing paints over it', async ($, on) => {
    mock.env(on, { COLORTERM: 'truecolor' })
    engineDraws(on)
    // The top row: 20 rows, its first five scrolled away, so 15 show.
    await $.ui.mount({
      plugin: 'neko',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { ...reply(5), onScreen: { first: 5, last: 19, of: 20 } },
      viewport: fullscreen,
    })
    const below = await $.ui.mount({
      plugin: 'neko',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { ...reply(0), onScreen: { first: 0, last: 9, of: 10 } },
      viewport: fullscreen,
    })
    // Its top is 15 rows down the screen: the cat is drawn that far up from it.
    const placed = (await below.findAll({ type: 'Box' })).filter(el => el.props.position === 'absolute')
    expect(placed.map(el => [el.props.left, el.props.top])).toEqual([[83, -15]])
  })

  test('leaves the band empty in fullscreen', async ($, on) => {
    mock.env(on, { COLORTERM: 'truecolor' })
    engineDraws(on)
    const ui = await $.ui.mount({
      plugin: 'neko',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: {
        hasSurvey: false,
        isWorking: false,
        maxRows: 20,
        bodyColumns: 80,
        scroll: { offset: 0, bodyRows: 20 },
        view: {},
      },
      viewport: fullscreen,
    })
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
  })

  test('keeps to the band where it is told to', { options: { place: 'band' } }, async ($, on) => {
    mock.env(on, { COLORTERM: 'truecolor' })
    engineDraws(on)
    const ui = await $.ui.mount({
      plugin: 'neko',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: reply(5),
      viewport: fullscreen,
    })
    await ui.advance(500)
    expect(await ui.findAll({ type: 'Text', text: /[▀▄]/ })).toEqual([])
  })
})
