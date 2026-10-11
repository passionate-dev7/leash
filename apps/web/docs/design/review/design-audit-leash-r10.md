# LEASH design audit, round 10, third pass (v3 "night console")

Targets: `http://localhost:4179/#/quote-cap` and `http://localhost:4179/#/delivery-cut` (local vite preview of the v3 build, commit `7f0dd4e`).
Mode: audit only, report mode. No browser driven. Evidence: the 12 Playwright captures in `docs/design/review/shots-r10/` (all opened and viewed), plus a read-only pass over `src/pages/quotecap.tsx`, `src/pages/deliverycut.tsx`, `src/components/kit.tsx`, `src/index.css`, `src/App.tsx`, `projects/leash/DESIGN.md` and `projects/leash/docs/design/DESIGN.md`.
Earlier passes: `design-audit-leash-r10a.md` (B- / B-, average 7.4, min 6.0) and `design-audit-leash-r10b.md` (B / B, average 7.9, min 7.5).
Classifier: HYBRID. The first screen of each page is OPERATE (one decision on a real 402). Below the fold on quote-cap is PERSUADE / READ (judge path, Route, fork proof, rivals, business model).

Design Score: B+
AI Slop Score: B+

## Summary

Most of the r10b list landed. Lime now marks only the primary button and the logo. The fork refusals and the delivery-cut revert use a violet chip, so the rows that prove Leash works no longer look like failures. On a phone, quote-cap shows the $10.00 quote before its button, and both pages use the same mobile CTA pattern. "HTTP 422, no image" is set in Rubik and fits on one line at 390. Copy buttons have a 44px hit area. After signing, a link points to the three new transactions. The root `DESIGN.md` is now the v3 contract.

What holds the grade at B+:

1. **New regression, desktop:** moving the explainer cards below the quote card on phones left a gap of about 150px between the lead and the explainers at 1440. The left column looks loose again, which is close to the owner's old "unfinished left panel" complaint.
2. **The headline proof is still red.** Pressing the button on quote-cap shows a red "Refused before signing" panel. Further down, the same event ("Quote-Cap refuses the $10 quote") has the violet "Refused" chip, and delivery-cut's signed verdict is violet too. The page's main proof uses the failure colour.
3. **Below the fold, quote-cap is still a stack of cards.** Positioning is three cards, each with a tinted "Leash:" box inside. Business model is another card. Five numbered discs sit across two sections.
4. **"Not run yet" is violet, not neutral.** It uses `tone="info"`, the same chip as the results "Refused", "Cut" and "Cut signed", and the "Tempo mainnet 402" label.

## Status of the r10b findings

| r10b finding | Status | Evidence this pass |
|---|---|---|
| 1 MEDIUM: lime marks things you cannot press; red marks intended refusals | **Fixed**, one remainder | `Metric tone="info"` maps to `text-accent-ink` (`kit.tsx:26`). Step numerals are `text-accent-ink` (`quotecap.tsx:263`, `:299`, `:303`), as is `route: true` (`:190`). Fork rows use `tone='info'` with "Refused" (`:175`), and the header chip says "3 refused, as intended" (`:170`). The delivery-cut revert is `info` (`deliverycut.tsx:135`). In `p-qc-full-1440.png` and `p-dc-signed-1440.png`, the only lime is the button, the logo tile and the focus ring. Remainder: the pressed verdict panel is still `chip-bad` on `bg-error-tint` (`quotecap.tsx:125-126`). See Finding 2. |
| 2 MEDIUM: phone shows the button before the quote | **Fixed** | `p-390.png`: headline, lead, then the card with "Listed price $0.039" and "The 402 asks $10.00" above the sticky bar. The explainers now come after the card in DOM order (`quotecap.tsx:293-307`). Side effect at 1440: Finding 1. |
| 3 MEDIUM: card mosaic and a label over every heading | **Partly fixed** | "For judges" and "Positioning" no longer have labels (`quotecap.tsx:236`, `:272`). The two labels left ("Route · route: true", "Fork run 1 · Quote-Cap", and "Fork run 2 · Delivery Cut" on delivery-cut) each carry a fact. Still present: Positioning as three cards with nested tinted boxes, Business model as a card, and five numbered discs. See Finding 3. |
| 4 MEDIUM: "HTTP 422, no image" in mono, wraps on phone | **Fixed** | `deliverycut.tsx:38`: `tone="warn"` renders `font-medium text-warning-ink` without `.num`. In `p-dc-full-390.png` the label "fal answered" and the value "HTTP 422, no image" share one line. |
| 5 MEDIUM: 24px copy buttons, bare "Copy" label | **Fixed**, polish left | `kit.tsx:42`: the 24px button has `after:-inset-2.5`, so the hit area is 44px. `aria-label={\`Copy ${value}\`}` names the target. Polish: a screen reader hears the full 66-character hash, and "Copied" is shown only as an icon swap (Finding 9). |
| 6 POLISH: "Above policy" chip gives away the verdict | **Fixed in wording, not in tone** | The pre-run state reads "Not run yet · Press the button to run this quote through the policy." (`quotecap.tsx:133`). The chip is `tone="info"` (violet), not neutral. See Finding 4. |
| 7 POLISH: the block height is the biggest number in Fork run 1 | **Not fixed** | `quotecap.tsx:166`. "43,440,365" is still the largest figure in that section in `p-qc-full-1440.png`. |
| 8 POLISH: identifier breaks mid-word at 390 | **Not fixed** | `p-dc-signed-390.png`: "(AccountKeychain.setAllowe / dCalls)". |
| 9 POLISH: Evidence card stretches to the list height | **Not fixed** | `p-dc-signed-1440.png`: about 195px of empty card under "Open the probe file". Grid items still stretch (`deliverycut.tsx:124`). |
| 10 POLISH: rows added after signing land below the fold with no cue | **Partly fixed** | Added "See the three new transactions ↓" in the signed verdict (`deliverycut.tsx:98`), which scrolls to the section. The rows still arrive with no highlight. |
| 11 POLISH: two contracts, token drift | **Mostly fixed** | Root `DESIGN.md` is now the v3 contract, byte-identical to `docs/design/DESIGN.md`. Drift left: ink-subtle `#9a93a8` in the contract vs `#a29bb0` shipped (`index.css:18`), inset highlight `.04` vs `.05`, a 40/56 type scale vs the shipped 34/44. No rule yet for the violet info tone or the "as intended" chip. The `index.css:50` comment "12 hashes only" is still false (`App.tsx:56`, `:70` use `text-caption`). |
| 12 POLISH: two mobile CTA patterns | **Fixed** | `quotecap.tsx:112-115` now uses delivery-cut's pattern: an inline button plus a fixed bar shown only while that button is off screen. |

Score: 7 fixed (2 with a remainder), 3 partly fixed, 2 not fixed, all polish.

## Owner complaints, checked

| Complaint | Verdict | Evidence |
|---|---|---|
| Too dense | Fixed on both first screens; still open below the fold on quote-cap | First screens hold a headline, a lead, one card and nothing repeated. Quote-cap is 3638px tall at 1440 and 7118px at 390, with four sections below the fold. The three Positioning cards run 70 to 80 words each. Delivery-cut is about 300 words and reads tight. |
| No clear main action | Fixed | Each page has one lime button, and both labels name the outcome: "Let the agent pay this quote", "Sign the cut". On phones each has an inline button plus a bar that appears only while that button is off screen. Lime is now unique to the button. |
| Gray text under 12px | Fixed | Capture script: 0 text nodes under 12px at either width. The smallest text is the 12px header tagline. Chips are 13px. `ink-subtle #a29bb0` on `paper #1f1633` is about 6.5:1. |
| Walls of monospace | Fixed | Mono is on hashes, amounts, metric values, the `route: true` token and the three script paths in the judge section. No sentence is set in mono. "HTTP 422, no image" is out of mono now. |
| Unfinished left panel | **Regressed at 1440 on quote-cap** | Delivery-cut is fine: the tiles end at y≈640 and the card at y≈740. Quote-cap's lead ends at y≈395, but the explainer cards start at y≈546 (`p-1440.png`). That hole is new in this pass (Finding 1). |

## v3 requirements, checked

| Requirement | Met | Note |
|---|---|---|
| Big summary metrics | Yes | Delivery-cut hero (47% amber, 1 violet), Route (84%, 3), Fork run 1 (block, $0.091). |
| Coloured status chips | Yes | Every chip has a text label and a dot. The violet chip now carries too many meanings (Finding 4). |
| Styled cards, surfaces, shadows | Yes | `--shadow-card` is an inset highlight plus a soft shadow offset downward. No glow. |
| Truncated mono addresses with copy | Yes | `Hash`, 44px hit area, named label. |
| Mono only for addresses / hashes / amounts | Yes | Script paths are code, which is acceptable. |
| One clear primary action per page | Yes | Lime is used on that button only. |
| Non-square corners | Yes | 6 / 10 / 16 / 999. |
| Unlike other CWF products | Yes | No serif, no paper, no hairline ledger. |

## First impression

Quote-cap, 1440 (`p-1440.png`). It reads as a working tool. My eye goes to the headline, then the 28px `$10.00` in the card, then the lime button. With the explainer numerals now violet, nothing else competes with the button. What I notice next is the empty band under the lead. The two explainer cards hang about 150px lower than the text they follow, roughly level with the policy toggles. They look placed by accident. One word: confident.

Quote-cap, pressed (`p-qc-pressed-1440.png`). "The 402 asks" turns red and a red panel says "Refused before signing". The red on the vendor's $10.00 is right, because that is the bad number. The red chip and panel are wrong: they colour Leash's own success as an error. Five hundred pixels further down, the same refusal is violet.

Delivery-cut, 1440 (`p-dc-1440.png`). Headline, the amber 47%, the amber "Paid, not delivered / $0.003 lost" box, then "Sign the cut". It is still the best single screen in the product. After signing (`p-dc-signed-1440.png`), the box turns violet ("fal is cut from the agent key"), the button becomes a quiet outlined "Cut signed", and a link points to the new rows. One word: decisive.

Phones (`p-390.png`, `p-dc-390.png`). Both pages show headline, lead, the facts, then a lime bar. Quote-cap now shows the $10.00 ask above its button. Correct on both.

## Findings, ranked

**FINDING-1 (MEDIUM, layout, new regression). At 1440, quote-cap's explainer cards float about 150px below the lead.**
The hero grid is two columns. The header is row 1, column 1. The card spans rows 1-2 in column 2 (`lg:row-span-2`, `quotecap.tsx:293`). The explainers sit in row 2, column 1 (`:296`). The card (about 740px) is taller than header plus gap plus explainers (about 565px). CSS grid splits that difference across both spanned rows, so row 1 grows by about 90px under the lead, and that adds to the 56px `lg:gap-14`. Measured off `p-1440.png`: the lead ends at y≈395 and the explainers start at y≈546. In r10b, when the explainers were inside the header, the gap was 32px.
Fix: add `lg:grid-rows-[auto_1fr]` to the hero grid (`quotecap.tsx:286`), so row 1 takes the header's own height and row 2 absorbs the rest. Optionally use `lg:gap-x-14 lg:gap-y-8` to bring the explainers back to a 32px gap. This is one class change, and phone order is untouched.

**FINDING-2 (MEDIUM, color / consistency). The page's main proof uses the failure colour, and the same event changes colour further down.**
Pressing "Let the agent pay this quote" with the defaults gives `chip-bad` "Refused before signing" on `bg-error-tint` with `border-error/30` (`quotecap.tsx:125-126`). The fork list shows the same event, "Quote-Cap refuses the $10 quote (listed $0.039)", with the violet "Refused" chip (`:175`). Delivery-cut's equivalent outcome, "Cut signed", is violet (`deliverycut.tsx:94-95`). So a judge who follows step 1 of "Check it in 60 seconds" sees red at the moment Leash works, and violet everywhere else.
Rule to adopt: red marks what the vendor did wrong (the $10.00 ask, already `text-error-ink` through `Row tone="bad"`, `:88`). Violet marks what Leash did. Fix: render the refused panel like the signed panel on delivery-cut, `rounded-md border border-hairline-strong bg-surface-2 p-4`, with `<Chip tone="info">Refused before signing</Chip>`. Keep the red on the two amounts inside the sentence by adding `text-error-ink` to the `$10.00` span.

**FINDING-3 (MEDIUM, AI slop / layout). Below the fold, quote-cap is still built from cards.** Remainder of r10b 3.
- Positioning: three equal `Card`s, each with a `rounded-md bg-surface-1` "Leash:" box inside (`quotecap.tsx:222-228`). That is a card nested in a card, three times in a row [nested-cards].
- Business model: another `Card` holding a label, a chip and one paragraph (`:249`).
- Five numbered 32px `surface-3` discs: two hero explainers (`:299`, `:303`) and three judge steps (`:263`) [numbered-section-labels shape].
- Route: two metric tiles beside three seller cards. These seller cards are fine, because each card is the comparison.
Hard-rejection #7 ("app UI made of stacked cards") still partly applies to the Positioning half of the page.
Fix: set Positioning as a three-column text block on the canvas with no cards. Each column gets the name and Source link, a `text-ink-muted` paragraph, and a "Leash:" paragraph marked only by its violet "Leash:" label, with no box. Set Business model as one line of text with its chip and no card. Drop the discs on the hero explainers (bold titles carry them) and keep the numbers only on the judge steps, where order matters.

**FINDING-4 (POLISH, color / interaction). "Not run yet" is violet, the same chip as the results.**
`quotecap.tsx:133` uses `tone="info"`, which renders as `surface-2` with `accent-ink` text and dot (`index.css:114`, `kit.tsx:16`). The brief for this pass called it neutral, but the capture shows violet. The violet chip now carries six meanings: provenance ("Tempo mainnet 402"), pending ("Not run yet"), intended refusal ("Refused"), done ("Cut", "Cut signed") and category ("Evidence"). Pending and done look alike, so the pre-run card reads as if something already happened.
Fix: add a `neutral` tone. In `kit.tsx`, extend `Tone` and use the `bg-ink-subtle` dot. In `index.css`, add `.chip-neutral { background: var(--color-surface-2); color: var(--color-ink-muted); }`. Use it for "Not run yet", and optionally for the "Evidence" label.

**FINDING-5 (POLISH, layout).** After signing at 1440, the Evidence card still stretches to the five-row list and leaves about 195px of empty surface under "Open the probe file" (`p-dc-signed-1440.png`). Add `lg:items-start` to the grid (`deliverycut.tsx:124`) or `self-start` to the Evidence card (`:142`).

**FINDING-6 (POLISH, hierarchy).** In Fork run 1, "Forked at block 43,440,365" is still the biggest number in the section (`quotecap.tsx:166`), though it is a block height, not an outcome. Delivery-cut puts its block in the intro sentence (`deliverycut.tsx:123`). Do the same here, and let "Daily limit left $0.091, was $0.20" be the section's one metric.

**FINDING-7 (POLISH, typography).** At 390, "(AccountKeychain.setAllowedCalls)" still breaks as "setAllowe / dCalls" (`p-dc-signed-390.png`), caused by `[overflow-wrap:anywhere]` on the label (`deliverycut.tsx:132`). Put a `<wbr>` after the dot in the label, or render the identifier in an `inline-block` span, so it breaks at "AccountKeychain. / setAllowedCalls".

**FINDING-8 (POLISH, motion).** The three rows added on signing arrive with no cue. The new link fixes discovery but not arrival. Give the new rows a one-time 600ms `surface-2` to transparent background fade with ease-out. Reduced motion is already handled globally (`index.css:101`).

**FINDING-9 (POLISH, accessibility).** `aria-label={\`Copy ${value}\`}` (`kit.tsx:41`) makes a screen reader read a 66-character hex string. "Copied" is shown only as a 1.2s icon swap. Use `aria-label={\`Copy transaction hash ${shortHash(value, a, b)}\`}` and add a visually hidden `aria-live="polite"` span that says "Copied".

**FINDING-10 (POLISH, system).** Sync `DESIGN.md` with the shipped tokens: ink-subtle `#a29bb0`, inset `.05`, type scale 12 / 14 / 16 / 18 / 20 / 28 / 34 / 44. Write down the two colour rules this pass created: lime only on the primary button, and violet for what Leash did, including intended refusals. Fix the `index.css:50` comment. Without those rules, the next agent will undo Findings 1 and 2.

## AI slop, judged

Absent: gradients, glow and halo, glassmorphism, emoji, stock imagery, fake avatars, sparkline filler, testimonial rows, hero eyebrow chips, uppercase tracked kickers and lime border accents. Every number is a captured 402, a fork hash, a catalog price or a cited count. Shadows are offset downward and soft. With lime confined to the button, the near-black plus neon look now reads as one deliberate signal on a violet console, not as the default AI look. Violet surfaces and the amber/violet status pairing make it Leash's own.

Present: nested cards in Positioning, the Business model card and five numbered discs (Finding 3). Two section labels remain, and both carry a fact, so they are not counted.

Litmus: brand in first screen YES. One strong visual anchor YES (the right-hand card). Understandable from headings alone YES. Each section has one job YES. Cards necessary PARTLY (the decision card, tx lists and seller comparisons yes; Positioning and Business model no). Motion improves hierarchy NO (colour transitions only, nothing authored). Premium with shadows removed YES on first screens, PARTLY below the fold.

## Consistency across the two pages

Shared: header, active nav pill, `5fr / 6fr` hero grid, h1 plus lead, a decision card split by a hairline into facts and a tinted action half, a full-width lime button, inline button plus conditional fixed bar on phones, fork lists built from `Hash` plus `Chip` rows, violet labels carrying fork facts, violet for intended refusals and reverts.

Divergent:
- The verdict colour. Quote-cap's refusal is red; delivery-cut's cut is violet (Finding 2).
- Vendor-fault colour. Quote-cap marks the overcharge red (`$10.00`); delivery-cut marks the paid-but-failed call amber ("HTTP 422", "$0.003 lost"). Both are defensible (a refused overcharge is a danger stopped; an unrecoverable loss is a warning), so this is not counted. Name the rule in `DESIGN.md`.
- The desktop left column. Delivery-cut's metric tiles sit right under the lead; quote-cap's explainers float (Finding 1).

## Trunk test

Both pages PASS. Site: logo plus "Leash". Page: active nav pill plus h1. Sections: eight-item nav, with a hamburger at 390. Options at this level: one button. Location: the nav pill. Search does not apply to an eight-route console.

## Goodwill (from captures, not a live walk)

```
quote-cap   70 ████████████████████░░░░░░░░░░
  first screen, task obvious          70 → 80  (+10)
  phone: quote shown before button    80 → 85  (+5)
  refusal panel says what and why     85 → 95  (+10)
  refusal coloured as an error        95 → 90  (-5 ambiguous signal)
  FINAL 90/100

delivery-cut 70 ████████████████████░░░░░░░░░░
  loss stated in money above CTA      70 → 80  (+10)
  CTA on phone first screen           80 → 85  (+5)
  signed state + link to new rows     85 → 95  (+10)
  FINAL 95/100
```

## Category grades

| Category | Grade | Driver |
|---|---|---|
| Visual hierarchy | A- | Lime unique to the button; polish 6 |
| Typography | A- | Finding 4 of r10b fixed; polish 7 |
| Spacing and layout | B | Finding 1 (new), Finding 3; polish 5 |
| Color and contrast | B+ | Lime fixed; Finding 2; polish 4 |
| Interaction states | B+ | 44px copy targets; polish 4, 9 |
| Responsive | A- | Phone order and CTA pattern fixed; polish 7 |
| Content | B+ | Positioning still 70 to 80 words per rival; judge steps are instructions by design |
| AI slop | B+ | Finding 3 |
| Motion | B | Nothing authored; reduced motion respected |
| Performance feel | not measured | Fonts self-hosted via @fontsource; no LCP or CLS in this run |

## Quick wins (each under 30 minutes)

1. `lg:grid-rows-[auto_1fr]` on the quote-cap hero grid (Finding 1). One class.
2. Restyle the refused verdict like delivery-cut's signed verdict, violet chip, and keep red on the amounts only (Finding 2).
3. Add a `neutral` chip tone for "Not run yet" (Finding 4).
4. `lg:items-start` on the delivery-cut evidence grid (Finding 5).
5. Take Positioning and Business model out of cards; drop the hero explainer discs (Finding 3).

## Owner caveats kept (not counted as defects)

- "Planned, no revenue yet", "it did not test the other gateways" and "The fork run only charged fal and stablestudio" are honest statements, graded on design only.
- "API unreachable" is not graded. `UtilityBar` is not rendered on these two routes (`App.tsx:51`), so it appears in no capture.
- The sticky header in the middle of `p-dc-signed-390.png` and `p-qc-pressed-390.png`, and the fixed bars mid-page in `p-dc-full-390.png` and `p-qc-full-390.png`, are full-page stitching artifacts from fixed elements.
- The roughly 80px of empty card under "Not run yet" at 1440 is the `min-h-24` slot reserved for the verdict (`quotecap.tsx:116`). It prevents layout shift on press, so it is not counted.

## Blind spots

- No live DOM this pass. The y positions and gap sizes are read off the PNGs (1440-wide captures at 1:1). The grid-row explanation for Finding 1 comes from source and matches the measured gap to within about 5px. The fix is not exercised.
- The quote-cap phone bar's hidden state (inline button on screen) was not captured. Its behaviour is read from source (`quotecap.tsx:69-74`, `:113`).
- The full 390 quote-cap captures are scaled down in the viewer, so the phone layout below the fold was judged by structure, not by reading every line.
- Contrast was computed by hand for `ink-subtle` on `paper` only. Chip text on chip tints was judged by eye.
- Hover, focus-visible and pressed states were read from source, not seen.
- No impeccable detector scan, no outside voice (Codex or subagent), and no gstack preamble or telemetry. The run constraints forbid scripts, scratch files and browser work. These findings come from one reviewer.
- Tablet (768) was not captured. With `md` at 1056px, 768 gets the phone layout and the conditional bars. Unverified.

## Critic scores (0-10)

hierarchy: 8.5
primary action: 9.0
typography: 8.5
density/whitespace: 7.5
color: 8.0
consistency across the two pages: 8.0
AI-slop absence: 8.0
mobile: 8.5
average: 8.3
min: 7.5
