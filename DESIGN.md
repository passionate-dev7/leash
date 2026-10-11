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

## Round 11 additions: status system, secondary accent, type scale, contrast

Status colours (fg on its tint; chip = tint fill + 25% fg ring + dot; panel = tint + 30% fg border):

| Status | Meaning | fg | tint |
|---|---|---|---|
| paid | payment settled / routed-to seller | `--color-paid` #6ee7a0 | #0f2e22 |
| refused | Leash stopped it before the key signed | `--color-refused` #ff8fb8 | #3a1630 |
| reverted | the chain refused it (scope, limit, cut) | `--color-reverted` #b9b0ff | #2a2350 |
| failed | the vendor took money and did not deliver | `--color-failed` #fcd34d | #33260b |
| neutral | not run yet, info, planned | `--color-neutral` #d6d0e2 | #30254d |

Accents: primary lime #c2ef4e (the one button per page, the logo) and secondary pink `--color-accent-2` #ff8fb8 (Leash's "stop" signal: refusals and the "Leash:" notes against rivals). Violet `--color-accent-ink` #b4abff for links and section labels.

Type scale (px): 12 caption (hashes, step numbers only) / 14 secondary / 16 body / 18 lead / 20 card title / 28 section / 34 display mobile / 44 display desktop; metric values clamp(28, 7vw, 40) mono.

Contrast: every text token pair checked by `docs/design/contrast.py` (WCAG 2.x); all >= 4.5:1, output in `docs/design/contrast-r11.txt`. `--color-ink-subtle` raised to #a9a2b8 (7.0:1 on cards).

Data viz: Route uses horizontal price bars per API (scaled to the most expensive listing, labelled seller + amount, paid colour for the routed seller). Fork runs use a numbered event rail coloured by status.

## Round 12 additions: primary metric, consequences, link hue, trust signals

- Primary metric zone at the top of Quote-Cap: overcharge refused (refused pink, 56px mono) | quotes refused (2 of 3) | basis. Computed in the page from the 3 recorded stablestudio 402s (10 Oct 2026 09:45 IST) under the default policy (exact listing, $1.00 cap); labelled illustrative.
- Every quote shows its consequence: "256.4x the listing, +$9.961 over (+25,541%)"; skipped Route sellers show "+N%".
- Links: `--color-link` #7dd3fc (sky, 10.3:1 on cards). Violet now means only "reverted".
- Trust: fork steps show block number and UTC block time from the saved receipts (`scripts/fork/enrich_blocks.py`), with a "Local anvil fork, no explorer" note; real mainnet addresses link to explore.tempo.xyz.
- Delivery Cut: a plain-language "Before you sign" summary (vendor, what changes, shared-address side effect, not a refund) sits above the button.
