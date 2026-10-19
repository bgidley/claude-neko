import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Caret } from '../types'

const caret = atom({ plugin: 'neko', key: 'caret' } as const, { col: 0, seq: 0 })
const isHidden = atom({ plugin: 'neko', key: 'isHidden' } as const, false)

// The prompt box draws "> " before the draft.
const PROMPT_PREFIX = 2

function caretOf(text: string, cursor: number, seq: number): Caret {
  const before = text.slice(0, cursor)
  return { col: PROMPT_PREFIX + before.length - (before.lastIndexOf('\n') + 1), seq }
}

export const register: Register = on => {
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Only the terminal and desktop tables carry Client.
    if (e.surface === 'mobile' || e.surface === 'vscode') {
      return next(e)
    }
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const { Client } = $.ui.resolve(e)
    const { col, seq } = await read($, caret)

    return (
      <Client
        key="neko"
        module="./neko-client.ts"
        props={{ isWorking: e.props.isWorking, col, seq }}
        width="100%"
        height={3}
      />
    )
  })
}
