# Components (LEASH web v2)

Tried first: 21st.dev via `uicraft 21st "toggle group"` (search worked) and
`npx shadcn@latest add "https://21st.dev/r/shadcn/toggle-group?api_key=..."` plus `.../r/shadcn/button`.
Install refused: HTTP 403 {"error":"Marketplace membership required","reason":"retrieval_limit_reached","limit":2,"resetAt":"2026-10-11T00:00:00Z"}.
FALLBACK: 21st.dev daily retrieval limit (2) was already used on this key, so the same shadcn/ui components were installed from the official shadcn registry with the shadcn CLI via `uicraft add shadcn/toggle-group shadcn/button shadcn/separator --cwd .`

| Component | Source | Install | Used for | Restyle |
|---|---|---|---|---|
| ToggleGroup + Toggle | https://ui.shadcn.com/r/styles/new-york/toggle-group.json (same component 21st.dev serves at https://21st.dev/r/shadcn/toggle-group) | uicraft add shadcn/toggle-group | quote picker, tolerance, hard cap | radius 0, ink border, selected = ink fill, 44px / 36px targets |
| Button | https://ui.shadcn.com/r/styles/new-york/button.json | uicraft add shadcn/button | the one primary action per page (Quote-Cap: "Let the agent pay this quote"; Delivery Cut: "Sign the cut") | ink primary, radius 0, 56px tall lg size |
| Separator | https://ui.shadcn.com/r/styles/new-york/separator.json | uicraft add shadcn/separator | price rows in the quote card | hairline token |

Files: apps/web/src/components/shadcn/{toggle,toggle-group,button,separator}.tsx (radix-ui primitives, class-variance-authority).
