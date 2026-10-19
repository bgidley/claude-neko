/** Where the prompt's caret is (column, prompt prefix included) and an edit counter. */
export type Caret = { col: number; seq: number }

declare module 'claude-code' {
  interface PluginState {
    neko: { caret: Caret; isHidden: boolean }
  }
}
