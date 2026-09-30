---
name: computer-use
description: Use when the user asks you to operate, inspect, or automate their desktop - clicking, typing, moving windows, reading the screen, or driving apps. Explains the observe-act-observe discipline for the computer-use MCP tools.
---

# Computer Use

This product exposes desktop control as dedicated MCP tools named
`mcp__computer-use__<action>` (for example `list_apps`, `get_window_state`,
`get_desktop_state`, `click`, `type_text`, `press_key`, `check_permissions`).
The tool catalog is decided by the underlying driver at runtime — always read
`tools/list` instead of assuming a fixed set.

## Core discipline: observe → act → observe

1. **Observe first.** Before any action, read the current state:
   - `get_desktop_state` for the whole screen, or
   - `list_apps` → `get_window_state` for one window, or
   - `get_accessibility_tree` when you need element roles/labels/indices.
2. **Act once.** Perform exactly one action per step. Prefer
   **`element_index` / element tokens over pixel coordinates** whenever the tool
   supports them — they survive window movement and background windows.
3. **Observe again.** Verify the action had the effect you intended before the
   next step. Screenshots and window images arrive as image blocks; use them to
   re-orient.

## Permissions and failures

- If an action fails or nothing changes, call `check_permissions` with
  `prompt: false` first and report its output verbatim (process integrity level,
  UIA availability, injection availability) before trying another strategy.
- On Windows, a non-elevated process cannot drive elevated windows. If the
  target seems unreachable, say so instead of retrying blindly.
- Never spam identical actions. After two failed attempts, stop and describe
  what you observed so the user can intervene.

## Coordination

- While computer use is running, the desktop shows the "DWeis Next is
  controlling your computer" indicator; that is expected.
- Screenshots require a vision-capable model to be useful; if the model cannot
  see images, rely on textual state tools (`get_window_state`,
  `get_accessibility_tree`) instead of pasting image data.

## Windows shell surfaces — verified behaviors (do not fight these)

These were reproduced end-to-end on Windows 11 against this driver build:

- **Shell popups (Start menu, taskbar menus) cannot be dismissed by keyboard
  through this driver.** Targeted background `escape` is posted but ignored;
  targeted foreground `escape` returns `foreground_unavailable` because Windows
  refuses the foreground swap without an upstream UIAccess worker that this
  build does not ship; `scope: "desktop"` keys go to whatever window happens to
  be foreground. **Close shell popups by clicking an empty area of the screen
  (desktop-scope click) instead of pressing keys.**
- **`foreground_unavailable` after a click usually means the action LANDED.**
  It reports that the driver could not confirm the foreground window within
  500ms — shell and transient windows never satisfy that check. Treat the
  result as INDETERMINATE: capture a screenshot and verify the actual outcome
  before deciding anything. Never blind-retry a click that may have succeeded.
- **If a screenshot looks older than the previous one** (stale frame or
  timestamp regression), capture it again once and compare before reasoning
  about screen state.
- Prefer `scope: "window"` with `pid`/`window_id`, or element tokens from
  `get_window_state`, over desktop-scope keys — desktop-scope keys cannot be
  aimed at a specific surface.
