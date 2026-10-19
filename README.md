# claude-neko

An [xneko](https://en.wikipedia.org/wiki/Neko_(software))-style ASCII cat for
[Claude Code](https://claude.com/claude-code). It lives in a three-row band
above the prompt:

```
  /\_/\        /\_/\ !        /\_/\ z
 ( o.o )      ( O.O )        ( -.- )
  > ^ <        > ^ <          (___)
```

- **You type** - the cat runs to your cursor and follows it.
- **Claude works** - it runs about the band and never sleeps.
- **Nothing happens** - it sits, scratches, yawns, then falls asleep.
- **Woken from a rest** - it startles (`O.O !`) before it runs, like the original.
- **Quiet for 30 seconds** - a mouse (`<:3)~`) creeps in. The cat wakes, gives
  chase, corners it and looks very pleased with itself (`^.^`). Typing or
  Claude starting work scares the mouse off.

`/neko` hides or shows it.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install neko --marketplace bgidley/claude-neko
```

Answer `y` to add the marketplace, then pick a scope (user scope is first).

From a shell:

```
claude plugin install neko --marketplace bgidley/claude-neko
```

In the desktop app, where `/plugin` does not run: click **+** next to the
prompt box, then **Plugins**, **Add marketplace** with `bgidley/claude-neko`,
then **Add plugin**.

## How it works

- `hooks/register.tsx` - the hooks module. It draws the band above the prompt
  (`ui.render` on `AbovePrompt`), tracks the prompt's caret column from
  `prompt.edit` / `prompt.change`, and registers `/neko`.
- `hooks/neko-client.ts` - a surface module that runs the animation on the
  terminal's own 100ms frame clock: sprites plus xneko's state machine
  (run, alert, sit, scratch, yawn, sleep, caught) and the mouse.

## Development

```
claude --plugin-dir .          # run a session with the mod loaded
claude plugin validate .
claude plugin test .
```

## License

Apache License 2.0 - see [LICENSE](LICENSE).
