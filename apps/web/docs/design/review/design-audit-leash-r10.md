# LEASH design audit, round 10 (v3 "night console")

Targets: `http://localhost:4179/#/quote-cap` and `http://localhost:4179/#/delivery-cut` (local vite preview of the v3 build).
Mode: audit only, report mode. No browser driven this round. Evidence is the Playwright captures in `docs/design/review/shots-r10/` (all 12 opened and viewed) plus a read-only pass over `src/pages/quotecap.tsx`, `src/pages/deliverycut.tsx`, `src/components/kit.tsx`, `src/components/shadcn/button.tsx`, `src/index.css`, `src/App.tsx`, `DESIGN.md`.
Classifier: HYBRID. The first screen of each page is OPERATE (one decision on a real 402). Everything below the fold on quote-cap is PERSUADE / READ (judge walkthrough, Route, fork proof, rivals, business model).

Design Score: B-
AI Slop Score: B-

## Summary

v3 does what the owner asked for. Both pages now open as a console, not a document: violet-black canvas, a raised card holding the one decision, a full-width lime button with a verb on it, coloured status chips, big metric tiles, truncated mono hashes with copy. Nothing looks like the paper/serif CWF ledgers. The first screens at 1440 are the best this project has shipped.

The score drops below r9 (B+, 8.4) for three reasons, in order:

1. A real mobile break: after "Sign the cut" at 390, the delivery-cut page grows wider than the viewport (the capture `p-dc-signed-390.png` is 422px wide). Status chips and the Evidence card's text are clipped on the right, and `html { overflow-x: clip }` (`index.css:80`) means the user cannot scroll to recover them. This is the money moment of the page on a phone.
2. The new card language brought template tells with it below the fold on quote-cap: a pill above every hero, an uppercase violet kicker above every section, a 3-up numbered-circle card row, lime left-border callouts inside rounded cards, and a card mosaic for Route and Positioning.
3. Quote-cap's first screen repeats its two numbers. `$0.039` appears four times and `$10.00` three times before the fold (lead, metric tiles, card rows). The metric tiles are a summary of the card sitting next to them.

r9 graded a different visual system, so the delta is a re-baseline, not a regression of the same surface. Still: final average 7.4 against 8.4. Flagged per protocol.

## Owner complaints, checked

| Complaint | Verdict | Evidence |
|---|---|---|
| Too dense | Fixed on first screens, partly open below the fold | First screens: one card, two tiles, one headline per page (`p-1440.png`, `p-dc-1440.png`). Quote-cap full page is 3815px tall at 1440 with five sections and roughly 850 visible words (estimate from source strings); Positioning alone is three 70 to 80 word cards plus a callout each (`p-qc-full-1440.png`). Delivery-cut is about 300 words and reads tight. |
| No clear main action | Fixed | One lime `size="lg"` full-width button per page: "Let the agent pay this quote" (`quotecap.tsx:110`), "Sign the cut" (`deliverycut.tsx:83`). Both are verbs naming the outcome. Exception: delivery-cut at 390 has no button in the first screen (Finding 4). |
| Gray text under 12px | Fixed | Capture script measured 0 text nodes under 12px on both pages at both widths. Smallest token in use is `text-caption` 12px (header tagline, `App.tsx:62`), chips are 13px (`index.css:103`). Muted text `#a29bb0` on card `#1f1633` computes to about 6.5:1, AA for body. |
| Walls of monospace | Fixed, with exceptions the capture missed | The capture note says mono appears only on shortened 0x hashes. Source shows mono in four more places: every metric value (`.metric-value`, `index.css:108`), the script paths in For Judges (`quotecap.tsx:263`), the `route: true` token (`quotecap.tsx:186`), and the word "of" in "42 of 89". None is a wall. The capture claim and the source disagree; the source is the better evidence for which elements carry `font-family: mono`. |
| Unfinished left panel | Fixed | Left column on quote-cap ends at about y=900, the card at y=895 (`p-1440.png`). Delivery-cut left ends at y=665, card at 740 (`p-dc-1440.png`). Both columns read as finished. |

## v3 requirements, checked

| Requirement | Met | Note |
|---|---|---|
| Big summary metrics | Yes | `Metric` tiles, mono 28 to 40px clamp. |
| Coloured status chips | Yes | Settled / Refused / Reverted / Cut / Paid, not delivered. Every chip carries text, not colour alone. |
| Styled cards, surfaces, shadows | Yes | `--shadow-card` is offset (0 12px 32px -12px) plus a 1px inset highlight. Real depth, no glow. |
| Truncated mono addresses with copy | Yes | `Hash` in `kit.tsx:36`. Copy target is 24px (Finding 7). |
| Mono only for addresses / hashes / amounts | Mostly | See complaint table. Card-row amounts are not mono (Finding 5). |
| One clear primary action per page | Yes | Lime is also spent on non-actions (Finding 6). |
| Non-square corners | Yes | 6 / 10 / 16 / 999. |
| Unlike other CWF products | Yes | No serif, no paper, no hairline ledger. Dark violet with lime. |

## First impression

Quote-cap, 1440. The page communicates a working tool. I notice the right card first because it is the only raised, bordered object with a lime bar in it. My eye goes to: (1) the headline "Your agent pays only the price you allow.", (2) the pink `$10.00` in the left tile, (3) the lime button. That is the intended order. Then I see `$10.00` again, bigger, inside the card, and `$0.039` three more times, and I start reading numbers I already read. One word: competent.

Delivery-cut, 1440. Cleaner than quote-cap. Headline, the yellow `42 of 89`, the amber "Paid, not delivered" box, the lime "Sign the cut". The amber box is the best single element across both pages: it states the loss in money, names the address being cut, and sits directly above the button that acts on it. One word: decisive.

Page area test: every area on both first screens is nameable in under 2 seconds. Below the fold on quote-cap, "Positioning" and "Business model" are nameable but are pitch content inside a product page.

## Per-page findings

### quote-cap (#/quote-cap)

- Pressing the button (`p-qc-pressed-1440.png`): "The 402 asks $10.00" turns error pink, a red-tinted "Refused before signing" panel appears in place of the hint, and the copy says what happened and that nothing needs refunding. Immediate, in place, specific. Good.
- Before pressing, the hint row already shows an amber "Above policy" chip (`quotecap.tsx:136`). It gives away the answer the button is about to give. Polish.
- The two explainer cards under the metric tiles ("Before signing", "If the check is bypassed") work, and fill the left column, but they are a third restatement of the mechanism after the lead paragraph and the card note.
- Fork run 1: four tiles (block, Settled 4, Refused 3, Daily limit) sit directly above the seven-row list they count. The counts add nothing the chips below do not already show. "Forked at block 43,440,365" is the largest number on that section and the least useful one.
- Route: each seller card contains two tinted inner rows. Readable, and the strikethrough on the losing price is a good touch, but it is card inside card.
- Mobile (`p-390.png`, `p-qc-pressed-390.png`): the sticky lime bar is present on the first screen and scrolls the verdict into view on press (`quotecap.tsx:113`). `max-md:pb-24` keeps the last section clear of the bar. The bar overlaps the "Before signing" card on the first screen, which is acceptable for a sticky CTA. It stays on screen through Positioning and Business model, where pressing it jumps the reader back to the top. Polish.

### delivery-cut (#/delivery-cut)

- Before / after (`p-dc-full-1440.png` vs `p-dc-signed-1440.png`): the chip flips from amber "HTTP 422" to violet "Cut", the amber loss box becomes a violet "fal is cut from the agent key" box, the button becomes a disabled outline "Cut signed", and three rows append to the fork list. The state change is complete and legible.
- The three new rows land below the fold at 1440 (from y=1190). The copy says "See the transactions below", which carries it, but nothing draws the eye there. Polish.
- The "Reverted" chip on "fal's next $0.003 charge: the chain refuses" is red. That revert is the product working. Same on quote-cap's "Refused" rows. Colour says failure, meaning says success (Finding 6).
- After signing, the Evidence card has about 200px of empty surface under its button because it stretches to the taller list beside it (`p-dc-signed-1440.png`). Polish.
- Mobile overflow after signing: Finding 1.

## Findings, ranked

**FINDING-001 (HIGH, responsive). Delivery-cut overflows the 390 viewport after "Sign the cut".**
`p-dc-signed-390.png` is 422px wide while `p-dc-full-390.png` (before signing) is 390. In the signed capture the "Settled" and "Reverted" chips are cut at the right edge and the Evidence card's lines ("not a brand.", "nine other gateways") run off screen. `html { overflow-x: clip }` (`index.css:80`) hides the overflow instead of letting the user scroll to it.
Likely cause (read from source, not measured): the row added on sign, "One root signature cuts fal from the agent key (AccountKeychain.setAllowedCalls)", contains a 33-character unbreakable token. At 390 the label column has about 210px after the chip; the token needs about 270px. The list `Card` (`deliverycut.tsx:99`) and the Evidence `Card` (`deliverycut.tsx:115`) are grid items without `min-w-0`, so the single grid track grows to the token's min-content width and drags both cards wider.
Fix: `min-w-0` on both cards in that grid, and `[overflow-wrap:anywhere]` (or `break-words`) on the row label at `deliverycut.tsx:105`; apply the same to `StepRow` in `quotecap.tsx:146` so a future long label cannot do this there. Re-capture at 390 and assert `document.documentElement.scrollWidth === 390` after signing.

**FINDING-002 (MEDIUM, AI slop). The card language brought template tells below the fold on quote-cap.**
- Pill chip above every hero headline ("Quote-Cap · Leash for MPP agents", "Delivery Cut"), `quotecap.tsx:291`, `deliverycut.tsx:57`. [hero-eyebrow-chip]
- Uppercase, tracked violet kicker above every section heading ("FOR JUDGES", "ROUTE · ROUTE: TRUE", "FORK RUN 1 · QUOTE-CAP", "POSITIONING", "BUSINESS MODEL"), `kit.tsx:56` via `SectionHead`. [kicker-above-heading]
- "Check it in 60 seconds": three equal cards, each a lime numbered circle, a title, two lines (`quotecap.tsx:243`). The 3-column feature grid shape.
- Rival cards: lime `border-l-2` callout inside a rounded card (`quotecap.tsx:222`). [border-accent-on-rounded]
- Route plus Fork plus Positioning reads as a card mosaic: every block of content is a bordered, shadowed rectangle.
Fix: drop the hero pill (the active nav pill already says which page this is); keep kickers only where they carry a fact the heading does not (the fork run labels do, "Positioning" does not); render For Judges as one inline ordered list, not three cards; replace the callout's left border with a plain "Leash:" lead-in; take Positioning and Business model out of cards and set them as two-column text on the canvas.

**FINDING-003 (MEDIUM, hierarchy / density). Quote-cap's first screen says each number three or four times.**
`$0.039`: lead paragraph, "Listed" tile, "Listed price" row, "Most this agent will pay" row. `$10.00`: lead, "Quoted" tile, "The 402 asks" row. The tiles (`quotecap.tsx:298`) summarise the card that sits 56px to their right. On mobile they push the card and its controls below the fold.
Fix: delete the two hero tiles on quote-cap, or replace them with the one number the card does not show (the "256x the listing" ratio, as the single big figure). Do the same audit on Fork run 1: drop "Forked at block" as a tile (it is already in the intro sentence) and let the chips in the list carry Settled / Refused.

**FINDING-004 (MEDIUM, primary action / consistency). Delivery-cut's primary action is not in the 390 first screen; quote-cap's is.**
Quote-cap pins its button in a fixed bottom bar on mobile (`quotecap.tsx:112`). Delivery-cut renders "Sign the cut" inline at the bottom of the card (`deliverycut.tsx:86`), at about y=1210 in `p-dc-full-390.png`, well past the 844px first screen. A phone user on delivery-cut sees headline, two tiles and the top of the card, then has to find the action.
Fix: reuse the quote-cap pattern, a fixed bottom bar with "Sign the cut" that scrolls `#dc-verdict` into view, hidden once signed.

**FINDING-005 (MEDIUM, typography). Amounts are set in two typefaces, and the word "of" is set in mono.**
Metric tiles use JetBrains Mono (`.metric-value`, `index.css:108`). Card rows use `.num`, which is Rubik with tabular figures only (`quotecap.tsx:51`, `deliverycut.tsx:38`). So `$0.039` appears in mono in the tile and in Rubik 40px away in the row. The capture note says amounts use JetBrains Mono; the card rows do not. "42 of 89" puts a word into a mono face with wide advance, which reads as "42  of  89" in `p-dc-1440.png`.
Fix: decide once. Either amounts are mono everywhere (add `font-mono` to the row value spans) or tiles use Rubik `.num` too. For "42 of 89", set the numbers in the metric face and "of" in Rubik at body weight, or render it as "42 / 89".

**FINDING-006 (MEDIUM, color). Lime and red are spent on things that are not their meaning.**
DESIGN.md: "one lime button per page". In practice lime also fills the three For Judges circles, the "Largest saving 84%" and "Signatures to cut 1" metric values (`tone="info"` maps to `text-primary`, `kit.tsx:27`), the explainer step numbers, and the rival callout borders. On quote-cap that is at least nine lime marks competing with the one lime button. Separately, "Refused" and "Reverted" chips are error red on rows that are the product succeeding (the chain refused a charge it should refuse).
Fix: map `tone="info"` metrics to `text-accent-ink` (violet) so lime means "press this". For refusals that are the intended outcome, keep the red dot but word the chip as the outcome ("Refused, as set") or use the violet info tone, and keep red for genuine failures such as fal's HTTP 422.

**FINDING-007 (MEDIUM, interaction). Copy buttons on hashes are 24px.**
`kit.tsx:41`, `size-6`. Under the 44px touch minimum, and on the delivery-cut tx list there are five of them stacked 80px apart. Success feedback is an icon swap only, and the button's label is a bare "Copy".
Fix: make the whole `Hash` pill the button (it is already about 32px tall; pad it to 44px on `max-md`), and set `aria-label={\`Copy ${shortHash(value)}\`}` plus a visually hidden "Copied" in an `aria-live` span.

**FINDING-008 (POLISH, content).** For Judges is an instruction block ("Click X, then Y, then Z"). It exists because the page is long. If Findings 2 and 3 land, the first screen already says "press the lime button", and this section can shrink to one line with the two script paths.

**FINDING-009 (POLISH, interaction).** Pre-verdict "Above policy" chip spoils the button's answer (`quotecap.tsx:136`). Show a neutral "Not run yet" or nothing.

**FINDING-010 (POLISH, interaction).** Signed rows on delivery-cut append below the 1440 fold with no highlight. A one-time 600ms surface-2 to transparent fade on the new rows, ease-out, would point the eye there; `prefers-reduced-motion` is already handled globally.

**FINDING-011 (POLISH, system).** DESIGN.md token block disagrees with `index.css`: ink-subtle `#9a93a8` vs `#a29bb0`, type scale "40 / 56" vs `display-sm` 34 and `display-md` 44. The CSS comment "12 hashes only" is false: the header tagline uses `text-caption` (`App.tsx:62`). Update the doc to match the shipped tokens.

## AI slop, judged

What is absent, and it matters: no gradients anywhere, no glow or halo, no glassmorphism, no emoji, no stock imagery, no fake avatars, no sparkline filler, no testimonial row. Every number on screen is a real captured 402, a fork hash or a cited count. Shadows are offset and soft, not coloured halos. That keeps the grade out of C.

What is present: Finding 2's five patterns, plus the calibration risk. Near-black with one neon accent is one of the three default AI looks. Here it was chosen deliberately, from the Sentry system, to break from the house paper look, and it is executed with restraint (violet surfaces, not pure black; lime only at full strength on the button). A judge who knows Sentry will recognise the palette. That is a taste call for the owner, not a defect.

Hard rejection check: #7 "App UI made of stacked cards instead of layout" applies partially to quote-cap below the fold. None of the other six apply.

Litmus: brand in first screen YES; one strong visual anchor YES (the right card); understandable from headlines alone YES; each section one job YES; cards necessary PARTLY (the decision card and tx lists yes, Positioning / Business model / For Judges no); motion improves hierarchy NO (none authored, colour transitions only); premium with shadows removed YES on first screens, NO below the fold where the shadow is the only thing separating card from canvas.

## Consistency across the two pages

Shared: header, active-nav pill, hero grid (`5fr / 6fr`), pill-plus-h1-plus-lead, two metric tiles, one decision card split into "facts" and "action" by a hairline and a tinted lower half, verdict box in a tinted bordered panel, full-width lime button, fork list with Hash plus Chip rows. The two pages read as one product.

Divergent: mobile CTA placement (Finding 4). After the action, quote-cap's button stays live and lime, delivery-cut's turns disabled outline. Both are defensible (quote-cap is re-runnable with other inputs, a cut is one-shot), so this is not counted.

## Trunk test

Both pages PASS: site (logo plus "Leash"), page (active nav pill plus h1), sections (eight-item nav), options at this level (one button), location (nav pill). Search is not applicable to an eight-route console.

## Goodwill (from captures, not a live walk)

```
quote-cap   70 ████████████████████░░░░░░░░░░
  first screen, task obvious      70 → 80  (+10)
  refusal panel says what and why 80 → 90  (+10)
  numbers repeated four times     90 → 85  (-5 ambiguous: are these different numbers?)
  FINAL 85/100

delivery-cut 70 ████████████████████░░░░░░░░░░
  loss stated in money above CTA  70 → 80  (+10)
  signed state clear, button locks 80 → 85 (+5)
  mobile: chips clipped after sign 85 → 75 (-10 sloppy appearance)
  FINAL 75/100
```

## Category grades

| Category | Grade | Driver |
|---|---|---|
| Visual hierarchy | B+ | Strong focal card; Finding 3 |
| Typography | B | Findings 5, 2 (kickers) |
| Spacing and layout | B | Quote-cap length; Evidence card empty space |
| Color and contrast | B | AA passes; Finding 6 |
| Interaction states | B+ | Clear verdicts; Finding 7; polish 9, 10 |
| Responsive | B- | Finding 1 (high), Finding 4 |
| Content | B | Positioning walls; For Judges instructions |
| AI slop | B- | Finding 2 |
| Motion | B | No authored moment; reduced motion respected |
| Performance feel | not measured | Fonts self-hosted via @fontsource; no LCP or CLS in this run |

## Quick wins (each under 30 minutes)

1. `min-w-0` on both delivery-cut grid cards plus `[overflow-wrap:anywhere]` on step labels (Finding 1).
2. Fixed bottom "Sign the cut" bar on mobile, copied from quote-cap (Finding 4).
3. Delete the two hero tiles on quote-cap (Finding 3).
4. `tone="info"` metric values to violet; lime only on the button (Finding 6).
5. Remove the hero pills and the "Positioning" / "For judges" kickers (Finding 2).

## Owner caveats kept (not counted as defects)

- "Planned, no revenue yet" chip in Business model, the fork run's "it did not test the other gateways", and "The fork run only charged fal and stablestudio" are honest statements, graded on design only.
- "API unreachable" is not graded. `UtilityBar` is not rendered on these two routes (`App.tsx:51`), so it does not appear in any capture.
- The header appearing mid-page in `p-dc-signed-390.png` is the sticky header captured at the scroll position during full-page stitching, a capture artifact.

## Blind spots

- No live DOM this round. Finding 1's cause is inferred from source and the capture width; the 422px capture width is the evidence, the token arithmetic is an estimate.
- Contrast was computed by hand for `ink-subtle` on `paper` only; chip text on chip tints was judged visually.
- Hover, focus-visible and pressed states were read from source (`button.tsx`, `index.css:92`), not seen.
- Word counts are estimates from source strings.
- No impeccable detector scan and no Codex or subagent outside voice: the run constraints forbid scripts and browser work. Findings are single-reviewer.
- Tablet (768) was not captured; the `md` breakpoint is 1056px, so 768 gets the mobile layout plus the fixed bar, unverified.

## Critic scores (0-10)

hierarchy: 8.0
primary action: 8.5
typography: 7.5
density/whitespace: 7.0
color: 7.5
consistency across the two pages: 8.0
AI-slop absence: 6.5
mobile: 6.0
average: 7.4
min: 6.0
