# LEASH design contract (round 10, v3)

System: adapted from `~/.config/design-md/designs/sentry.md` (deep violet night canvas, lime signal).
Chosen because the recent CWF design log is all paper/serif/ledger (Newsreader, Bodoni, Spectral, bone/ink);
LEASH must read as a dark operator console for agent spend, not a document.

1. Aesthetic: night console. Violet-black canvas, raised violet cards with soft shadows, one lime primary action, chips for every status.
2. Fonts: Rubik Variable (display + UI, 400/500/600/700) and JetBrains Mono Variable (addresses, hashes, amounts only), self-hosted via @fontsource-variable. No serif anywhere.
3. Palette (CSS variables, Tailwind @theme): see token block.
4. Spacing: 4/8px scale (4, 8, 12, 16, 24, 32, 48, 64). Radius: 6 chips, 10 controls, 16 cards, 999 pills.
5. Layout: dashboard. Hero row (headline + one primary action) -> metric strip (3-4 big numbers) -> card grid (2 columns at >=1056px, 1 at mobile) -> evidence list with truncated mono addresses + copy/explorer.

## Token block

```css
--font-sans: "Rubik Variable";  --font-mono: "JetBrains Mono Variable";
--color-canvas: #150f23;   /* night */
--color-paper: #1f1633;    /* card surface */
--color-surface-1: #271d40; --color-surface-2: #30254d; --color-surface-3: #3d3160;
--color-hairline: #362d59; --color-hairline-strong: #6a5fc1;
--color-ink: #f4f1fa; --color-ink-muted: #bdb8c0; --color-ink-subtle: #9a93a8;
--color-primary: #c2ef4e (lime, on-primary #150f23);
--color-accent: #6a5fc1 (violet);  --color-pink: #fa7faa;
--color-success: #4ade80 / tint #12301f;  --color-warning: #fbbf24 / tint #33260b;  --color-error: #fb7185 / tint #3a1424;
--radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;
--shadow-card: 0 1px 0 rgba(255,255,255,.04) inset, 0 12px 32px -12px rgba(0,0,0,.6);
Type scale: 12 / 14 / 16 / 20 / 28 / 40 / 56.
```

Rules: mono only for addresses/hashes/amounts; status = chip with text (Paid, Refused, Cut, Routed); one lime button per page; no square-only corners.
