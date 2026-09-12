# Agent 指引

## Design System

Always read `docs/design/zhulv-design-tokens.md` before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Business styles must use CSS variables from `packages/ui/src/design-tokens.css`.
Do not hardcode color hex in app styles. Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match `docs/design/zhulv-design-tokens.md`.
