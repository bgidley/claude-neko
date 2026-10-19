import { describe, expect, test } from 'claude-code/testing'

import { CAT_WIDTH, MOUSE_AT, initial, rows, step } from './neko-client.ts'
import type { Neko, NekoProps } from './neko-client.ts'

const COLS = 80

function run(s: Neko, p: NekoProps, ticks: number): Neko {
  for (let i = 0; i < ticks; i++) s = step(s, p, COLS)
  return s
}

describe('neko', () => {
  test('chases the caret after a keystroke and sits behind it', async () => {
    const idle = { isWorking: false, col: 0, seq: 0 }
    let s = initial(idle)
    s = run(s, { ...idle, col: 40, seq: 1 }, 60)
    expect(s.x).toBe(40 - CAT_WIDTH + 2)
    expect(s.pose).not.toBe('run')
  })

  test('startles before running when it has been resting', async () => {
    const idle = { isWorking: false, col: 0, seq: 0 }
    let s = run(initial(idle), idle, 20)
    s = step(s, { ...idle, col: 50, seq: 1 }, COLS)
    expect(s.pose).toBe('alert')
    expect(rows(s)[0]).toContain('!')
  })

  test('scratches, yawns, then falls asleep when nothing happens', async () => {
    const idle = { isWorking: false, col: 0, seq: 0 }
    const poses = new Set<string>()
    let s = initial(idle)
    for (let i = 0; i < 100; i++) {
      s = step(s, idle, COLS)
      poses.add(s.pose)
    }
    expect([...poses].sort()).toEqual(['scratch', 'sit', 'sleep', 'yawn'])
    expect(rows(s).join('\n')).toContain('-.-')
  })

  test('runs about while Claude works and never sleeps', async () => {
    const busy = { isWorking: true, col: 0, seq: 0 }
    let s = initial(busy)
    const seen = new Set<number>()
    for (let i = 0; i < 300; i++) {
      s = step(s, busy, COLS)
      seen.add(s.x)
      expect(s.pose).not.toBe('sleep')
      expect(s.x).toBeLessThanOrEqual(COLS - CAT_WIDTH)
    }
    expect(seen.size).toBeGreaterThan(10)
  })

  test('faces left when running left', async () => {
    const idle = { isWorking: false, col: 0, seq: 0 }
    let s = run(initial(idle), { ...idle, col: 60, seq: 1 }, 70)
    // It startles first, having rested, then turns and runs.
    s = run(s, { ...idle, col: 10, seq: 2 }, 5)
    expect(s.pose).toBe('run')
    expect(s.dir).toBe(-1)
    expect(rows(s)[1]).toContain('(o.o )~')
  })

  test('a mouse turns up after a long quiet spell, and the cat catches it', async () => {
    const idle = { isWorking: false, col: 0, seq: 0 }
    let s = run(initial(idle), idle, MOUSE_AT - 1)
    expect(s.mouse).toBeNull()
    s = step(s, idle, COLS)
    expect(s.mouse).not.toBeNull()
    expect(rows(s)[2]).toContain('<:3)~')

    const poses = new Set<string>()
    for (let i = 0; i < 200 && s.mouse !== null; i++) {
      s = step(s, idle, COLS)
      poses.add(s.pose)
    }
    expect(s.mouse).toBeNull()
    expect(poses.has('alert')).toBe(true)
    expect(poses.has('run')).toBe(true)
    expect(s.pose).toBe('caught')
    expect(rows(s)[1]).toContain('^.^')
  })

  test('the mouse runs from the cat once it is close', async () => {
    const idle = { isWorking: false, col: 0, seq: 0 }
    const near: Neko = { ...run(initial(idle), idle, 5), x: 30, idle: MOUSE_AT, mouse: { x: 40, dir: -1 } }
    const s = step(near, idle, COLS)
    expect(s.mouse).toEqual({ x: 41, dir: 1 })
    expect(rows(s)[2]).toContain('~(E:>')
  })

  test('typing scares the mouse off', async () => {
    const idle = { isWorking: false, col: 0, seq: 0 }
    let s = run(initial(idle), idle, MOUSE_AT + 5)
    expect(s.mouse).not.toBeNull()
    s = step(s, { ...idle, col: 20, seq: 1 }, COLS)
    expect(s.mouse).toBeNull()
  })

  test('no mouse while Claude works', async () => {
    const busy = { isWorking: true, col: 0, seq: 0 }
    const s = run(initial(busy), busy, MOUSE_AT * 2)
    expect(s.mouse).toBeNull()
  })
})
