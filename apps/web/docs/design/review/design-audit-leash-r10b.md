# LEASH design audit, round 10, second pass (v3 "night console")

Targets: `http://localhost:4179/#/quote-cap` and `http://localhost:4179/#/delivery-cut` (local vite preview of the v3 build, commit `61a4d1a`).
Mode: audit only, report mode. No browser driven. Evidence: the 12 Playwright captures in `docs/design/review/shots-r10/` (all opened and viewed), plus a read-only pass over `src/pages/quotecap.tsx`, `src/pages/deliverycut.tsx`, `src/components/kit.tsx`, `src/index.css`, `src/App.tsx` and the v3 contract `projects/leash/docs/design/DESIGN.md`.
First pass: `design-audit-leash-r10a.md` (B- / B-, average 7.4, min 6.0).
Classifier: HYBRID. The first screen of each page is OPERATE (one decision on a real 402). Below the fold on quote-cap is PERSUADE / READ (judge path, Route, fork proof, rivals, business model).

Design Score: B
AI Slop Score: B

## Summary

The second pass fixed the things that hurt most. The phone break after "Sign the cut" is gone: both 390 delivery-cut captures are 390px wide and every chip is fully on screen. Delivery-cut now has a "Sign the cut" button on the first phone screen. Quote-cap no longer says each number four times. Amounts use one typeface. The hero pills, the uppercase kickers and the lime left borders are gone.

What still holds the grade at B and not B+:

1. Lime still marks about eight things on quote-cap that you cannot press (step numerals, "84%", "1", the `route: true` token). Red still marks refusals that mean the product worked.
2. On a 390 phone, quote-cap's first screen shows "Let the agent pay this quote" but not the quote. The two explainer cards sit between the lead and the card, so the user presses a button for a price they have not seen yet.
3. Below the fold, quote-cap is still a card mosaic: Route (2 tiles + 3 cards), Fork run 1 (2 tiles + list card), Positioning (3 cards + business model card), five numbered circles across the page.
4. The status string "HTTP 422, no image" is now set in mono through `.num`, and on a phone it wraps into "HTTP 422, no / image".

## Status of the first-pass findings

| r10a finding | Status | Evidence this pass |
|---|---|---|
| 001 HIGH: delivery-cut overflows 390 after signing | **Fixed** | `p-dc-signed-390.png` and `p-dc-full-390.png` are both 390 wide. "Settled" and "Reverted" chips and the Evidence card text are all inside the viewport. `min-w-0` on both cards (`deliverycut.tsx:124`, `:141`) and `[overflow-wrap:anywhere]` on step labels (`deliverycut.tsx:131`, `quotecap.tsx:139`). Side effect: "AccountKeychain.setAllowe dCalls" now breaks in the middle of the identifier (polish, Finding 8). |
| 002 MEDIUM: template tells below the fold | **Partly fixed** | Hero pills removed. Section labels are sentence case, no tracking. Judge path is one panel with three columns (`quotecap.tsx:265`). Rival "Leash:" notes are a tinted box with no border (`quotecap.tsx:220`). Still present: a violet label above every section heading, including "For judges" and "Positioning" where it repeats the heading; five numbered circles (hero explainers 1-2, judge steps 1-3); Route and Positioning are still grids of equal cards. See Finding 3. |
| 003 MEDIUM: quote-cap first screen repeats its numbers | **Mostly fixed** | Hero metric tiles gone. `$0.039` now appears 3 times before the fold (lead, two card rows), `$10.00` twice. Fork run 1 is down from four tiles to two, plus "4 settled / 3 refused" chips. "Forked at block 43,440,365" is still the biggest number in that section and is a block height (polish, Finding 7). |
| 004 MEDIUM: delivery-cut action missing from the 390 first screen | **Fixed** | `p-dc-390.png` shows the fixed "Sign the cut" bar on the first screen. The inline button sits in the card (`deliverycut.tsx:110`). The bar renders only while that button is off screen (`IntersectionObserver`, `deliverycut.tsx:48-53`), and both are removed once signed. |
| 005 MEDIUM: amounts in two typefaces, "of" in mono | **Fixed** | `.num` is JetBrains Mono plus tabular figures (`index.css:107`), so the card rows and tiles match. "42 of 89" became "47%", with "42 of 89 calls" in the Rubik hint. New side effect: `.num` is also on non-amount values (Finding 4). |
| 006 MEDIUM: lime and red used outside their meaning | **Not fixed** | `tone="info"` still maps to `text-primary` (`kit.tsx:27`): "84%" (`quotecap.tsx:185`), "1" (`deliverycut.tsx:74`). Step numerals are `text-primary` (`quotecap.tsx:255`, `:286`, `:290`). `route: true` is `text-primary` (`quotecap.tsx:182`). "Refused" and "Reverted" chips are still `bad` on rows where the refusal is the intended result. |
| 007 MEDIUM: 24px copy buttons, bare "Copy" label | **Not fixed** | `kit.tsx:41`, `size-6`, `aria-label="Copy"`. |
| 008 POLISH: For judges is an instruction block | Partly | Now one compact panel. Still three "click here" steps. |
| 009 POLISH: "Above policy" chip spoils the verdict | **Not fixed** | `quotecap.tsx:125`, visible in `p-1440.png`. |
| 010 POLISH: rows added after signing land below the fold with no highlight | **Not fixed** | `p-dc-signed-1440.png`: new rows start at y≈1190, with no transition. |
| 011 POLISH: DESIGN.md token drift | **Not fixed** | `docs/design/DESIGN.md:21` ink-subtle `#9a93a8` vs `index.css:18` `#a29bb0`. `index.css:50` still says "12 hashes only", but the header tagline uses `text-caption` (`App.tsx`). New: `projects/leash/DESIGN.md` is the IBM Carbon system (white, square, Plex), which contradicts v3. Any agent that reads the root file first will build the wrong product. |

## Owner complaints, checked

| Complaint | Verdict | Evidence |
|---|---|---|
| Too dense | Fixed on both first screens; open below the fold on quote-cap | First screens: headline, lead, one card, nothing repeated (`p-1440.png`, `p-dc-1440.png`). Quote-cap is 3678px at 1440 and 7066px at 390, with four sections below the fold. Positioning alone is three cards of 70 to 80 words, each with a tinted note. Delivery-cut is about 300 words and reads tight. |
| No clear main action | Fixed | One full-width lime button per page with a verb that names the outcome: "Let the agent pay this quote", "Sign the cut". Both pages now have it on the 390 first screen. Caveat: Finding 2 (the quote-cap button arrives before its quote on phones). |
| Gray text under 12px | Fixed | Capture script: 0 text nodes under 12px at both widths. Smallest text is the 12px header tagline. Chips are 13px. `ink-subtle #a29bb0` on `paper #1f1633` is about 6.5:1. |
| Walls of monospace | Fixed | Mono is on hashes, amounts, metric values, the `route: true` token and the three script paths in For judges. No paragraph is set in mono. One misuse: "HTTP 422, no image" (Finding 4). |
| Unfinished left panel | Fixed | Quote-cap left column ends with the second explainer card at y≈690 while the card runs to 895. The 200px gap reads as whitespace beside a taller card, not as a missing panel. Delivery-cut: tiles end at 640, card at 740. |

## v3 requirements, checked

| Requirement | Met | Note |
|---|---|---|
| Big summary metrics | Yes | Delivery-cut hero (47%, 1), Route (84%, 3), Fork run 1 (block, $0.091). Quote-cap hero has none by design now; the card's 28px `$10.00` is the anchor. |
| Coloured status chips | Yes | Every chip has text and a dot, so colour is never the only signal. |
| Styled cards, surfaces, shadows | Yes | `--shadow-card` is a soft shadow offset downward plus an inset highlight. No glow. |
| Truncated mono addresses with copy | Yes | `Hash` (`kit.tsx:34`). The target is too small (Finding 5). |
| Mono only for addresses / hashes / amounts | Mostly | "HTTP 422, no image" breaks the rule (Finding 4). Script paths are code, which is acceptable. |
| One clear primary action per page | Yes | The lime button is unique as a button, but lime as a colour is not (Finding 1). |
| Non-square corners | Yes | 6 / 10 / 16 / 999. |
| Unlike other CWF products | Yes | No serif, no paper, no hairline ledger. |

## First impression

Quote-cap, 1440 (`p-1440.png`). The page reads as a working tool. My eye goes to (1) the headline "Your agent pays only the price you allow.", (2) the pink `$10.00` in the lead and the white 28px `$10.00` in the card, (3) the lime button. That is the right order, and nothing repeats on the way. The two explainer cards on the left are the weakest part of the screen. Their lime 1 and 2 numerals pull at the eye, and they explain a mechanism the card is about to show. One word: confident.

Delivery-cut, 1440 (`p-dc-1440.png`). Headline, the yellow 47%, the amber "Paid, not delivered / $0.003 lost" box, then "Sign the cut". The loss box sits directly above the button that acts on it. It is still the best single element in the product. One word: decisive.

Phone, quote-cap (`p-390.png`). Headline, lead, two explainer cards, then the fixed lime bar. The card with the $10.00 quote and the policy toggles starts below the fold. I am asked to "Let the agent pay this quote" before I know what the quote is.

Phone, delivery-cut (`p-dc-390.png`). Headline, lead, two tiles, the top of the card with its HTTP 422 chip, then the "Sign the cut" bar. Correct order.

## Findings, ranked

**FINDING-1 (MEDIUM, color). Lime marks about eight things you cannot press; red marks refusals that mean the product worked.** Carried over from r10a 006.
The contract says "one lime primary action" (`docs/design/DESIGN.md:7`). On quote-cap, lime also colours the hero numerals 1 and 2 (`quotecap.tsx:286`, `:290`), the judge numerals 1 to 3 (`:255`), "84%" (`:185` through `kit.tsx:27`) and the `route: true` token (`:182`). On delivery-cut it colours the "1" under "Signatures to cut" (`deliverycut.tsx:74`). In `p-qc-full-1440.png`, eight lime marks compete with the one lime button.
Separately: "Refused" (quote-cap fork rows 5 to 7) and "Reverted" (delivery-cut "fal's next $0.003 charge: the chain refuses") use the error chip. Those rows are the proof that Leash works, but the colour tells a scanning judge that something failed.
Fix: in `kit.tsx:27`, map `tone === 'info'` to `text-accent-ink`. Change the numerals and the `route: true` token to `text-accent-ink`. For refusals that are the intended outcome, add a chip tone such as `held` (violet tint, `accent-ink` dot) worded "Refused, as set" / "Reverted, as set". Keep red for genuine failures such as fal's HTTP 422.

**FINDING-2 (MEDIUM, responsive / primary action). On a phone, quote-cap shows the button before the quote.**
At 390 (`p-390.png`), the first screen holds headline, lead, both explainer cards and the fixed "Let the agent pay this quote" bar. The quote card (No prompt / $10.00 / policy toggles) starts at about y=900. Pressing the bar does scroll the verdict into view (`quotecap.tsx:106`). But the user acts on a price and a policy they have not seen, and they never touch the toggles that make this a decision rather than a demo.
Fix: on `max-lg`, put the card directly after the lead. Either add `max-lg:order-last` to the explainer block (move `<div className="mt-8 grid gap-3">` out of `<header>` into a sibling that orders after the card), or hide the explainers below `lg` and keep the fork section as the explanation. Then re-capture at 390 and confirm the "The 402 asks $10.00" row is above the bar.

**FINDING-3 (MEDIUM, AI slop / layout). Quote-cap below the fold is still a card mosaic with a label over every heading.** Remainder of r10a 002.
- A violet label above every `h2` (`SectionHead`, `kit.tsx:54`). "Fork run 1 · Quote-Cap" and "Route · route: true" carry a fact. "For judges" and "Positioning" only restate the heading. [kicker-above-heading, reduced from uppercase]
- Five numbered circles in two places (hero explainers, judge steps), all the same 32px `surface-3` disc. [numbered-section-labels shape]
- Route: two metric tiles beside three identical seller cards. Positioning: three identical rival cards plus a business model card. Every block of content is a bordered, shadowed rectangle. Hard-rejection check #7 ("app UI made of stacked cards") still applies in part to this half of the page.
Fix: drop the `eyebrow` prop on "For judges" and "Positioning". Set Positioning as a three-column text block on the canvas, without cards: name, one line on what the rival does, one "Leash:" line. Set Business model as one paragraph with its chip, also without a card. Keep cards where the card is the object: the quote card, the tx lists, the seller comparisons.

**FINDING-4 (MEDIUM, typography / responsive). "HTTP 422, no image" is set in mono and breaks across two lines on a phone.**
`Row` applies `.num` to every value (`deliverycut.tsx:38`), so a status sentence gets the amount face. At 1440 it reads as a code string in yellow mono beside two amounts. At 390 (`p-dc-full-390.png`, `p-dc-signed-390.png`) the label "fal answered" wraps to two lines, and the value wraps to "HTTP 422, no / image", right-aligned. This is the row that proves the failure.
Fix: give `Row` an `as="text"` variant (or apply `.num` only when the value is an amount) and render that value in Rubik semibold `text-warning-ink`. Add `whitespace-nowrap` to the label. On `max-sm`, stack label over value (`max-sm:flex-col max-sm:items-start`) for that row.

**FINDING-5 (MEDIUM, interaction). Copy buttons on hashes are 24px with a bare "Copy" label.** Carried over from r10a 007.
`kit.tsx:41` `size-6`. The delivery-cut list stacks five of them about 80px apart. Success feedback is an icon swap only. A screen reader hears "Copy" five times with no target.
Fix: make the whole `Hash` pill the button, padded to 44px tall on `max-md`. Set `aria-label={\`Copy ${shortHash(value, a, b)}\`}` and announce "Copied" through a visually hidden `aria-live` span.

**FINDING-6 (POLISH, interaction).** The "Above policy" chip appears before the button is pressed (`quotecap.tsx:125`) and gives away the verdict. Show a neutral "Not run yet", or only the "Press the button to run it." line.

**FINDING-7 (POLISH, hierarchy).** In Fork run 1, "Forked at block 43,440,365" is still the biggest number in the section (`quotecap.tsx:158`), yet it is a block height, not an outcome. Delivery-cut already puts its block in the intro sentence. Do the same here, and let "Daily limit left $0.091, was $0.20" stand alone as the section's one metric.

**FINDING-8 (POLISH, typography).** `[overflow-wrap:anywhere]` fixed the overflow but splits "AccountKeychain.setAllowe dCalls" mid-identifier at 390 (`p-dc-signed-390.png`). In the label source, insert a `<wbr>` after the dot, or put the identifier in its own `inline-block` span, so it breaks at "AccountKeychain. / setAllowedCalls".

**FINDING-9 (POLISH, layout).** After signing at 1440, the Evidence card stretches to the height of the five-row list and leaves about 195px of empty surface under "Open the probe file" (`p-dc-signed-1440.png`). Before signing, the list card has about 70px of empty space under its hint line. Add `self-start` on the Evidence card, or `lg:items-start` on the grid (`deliverycut.tsx:123`).

**FINDING-10 (POLISH, motion).** The three rows added on sign appear below the 1440 fold with no cue. A one-time 600ms `surface-2` to transparent background fade on those rows, with ease-out, would show where to look; reduced motion is already handled globally (`index.css:101`).

**FINDING-11 (POLISH, system).** There are two design contracts. `projects/leash/DESIGN.md` is the IBM Carbon system (white, square corners, Plex Sans weight 300, IBM Blue) and contradicts v3. The v3 contract at `projects/leash/docs/design/DESIGN.md` drifts from the shipped tokens (ink-subtle `#9a93a8` vs `#a29bb0`). The `index.css:50` comment "12 hashes only" is false. Replace the root `DESIGN.md` with the v3 contract and sync the token values.

**FINDING-12 (POLISH, consistency).** The two pages use different mobile CTA patterns. Quote-cap's bar is always fixed, with no inline button (`quotecap.tsx:104-107`), and it stays on screen through Positioning, where pressing it jumps back to the top. Delivery-cut has an inline button plus a bar that shows only while that button is off screen. The delivery-cut pattern is better. Reuse it on quote-cap: an inline button on phones, and the bar only while that button is off screen.

## AI slop, judged

Absent, and it matters: no gradients, no glow or halo, no glassmorphism, no emoji, no stock imagery, no fake avatars, no sparkline filler, no testimonial row, no hero pill. Every number is a captured 402, a fork hash, a catalog price or a cited count. Shadows are offset downward and soft, not coloured halos. The fixes in this pass removed three of the five r10a tells outright (hero eyebrow chip, uppercase tracked kickers, lime border accent on rounded cards) and reduced the judge grid to one panel.

Present: a sentence-case label over every heading, five numbered discs, and two equal-card grids below the fold (Finding 3). The calibration risk from r10a still applies: near-black with one neon accent is one of the three default AI looks. Here it is a deliberate break from the house paper look, and violet surfaces plus restrained lime keep it from reading as default. Finding 1 is what would push it toward default: lime on everything that is a number.

Litmus: brand in first screen YES. One strong visual anchor YES (the right card). Understandable from headings alone YES. Each section has one job YES. Cards necessary PARTLY (the decision card, tx lists and seller comparisons yes; Positioning and Business model no). Motion improves hierarchy NO (only colour transitions; nothing authored). Premium with shadows removed YES on first screens, PARTLY below the fold.

## Consistency across the two pages

Shared: header, active nav pill, `5fr / 6fr` hero grid, h1 plus lead, one decision card split by a hairline into facts and a tinted action half, verdict box in a tinted bordered panel, full-width lime button, fork list built from `Hash` plus `Chip` rows, `SectionHead` with a violet label. The two pages read as one product.

Divergent: quote-cap's hero now has explainer cards and no metrics, while delivery-cut's hero has metrics. That fits each page's job (quote-cap's card holds its own numbers; delivery-cut needs the 47% context), so it is not counted. The mobile CTA patterns differ (Finding 12).

## Trunk test

Both pages PASS: site (logo plus "Leash"), page (active nav pill plus h1), sections (eight-item nav; hamburger at 390), options at this level (one button), location (nav pill). Search does not apply to an eight-route console.

## Goodwill (from captures, not a live walk)

```
quote-cap   70 ████████████████████░░░░░░░░░░
  first screen, task obvious          70 → 80  (+10)
  refusal panel says what and why     80 → 90  (+10)
  phone: button before the quote      90 → 85  (-5 ambiguous choice)
  FINAL 85/100

delivery-cut 70 ████████████████████░░░░░░░░░░
  loss stated in money above CTA      70 → 80  (+10)
  CTA on phone first screen           80 → 85  (+5 saves a step)
  signed state clear, button locks    85 → 90  (+5)
  phone: "HTTP 422, no / image" wrap  90 → 85  (-5 sloppy)
  FINAL 85/100
```

## Category grades

| Category | Grade | Driver |
|---|---|---|
| Visual hierarchy | A- | Repeats gone; polish 7 |
| Typography | B+ | Finding 4; polish 8 |
| Spacing and layout | B | Quote-cap length and card mosaic; polish 9 |
| Color and contrast | B | AA passes; Finding 1 |
| Interaction states | B | Finding 5; polish 6, 10 |
| Responsive | B | Overflow and dc CTA fixed; Findings 2, 4 |
| Content | B | Positioning text blocks; judge steps are instructions |
| AI slop | B | Finding 3 |
| Motion | B | Nothing authored; reduced motion respected |
| Performance feel | not measured | Fonts self-hosted via @fontsource; no LCP or CLS in this run |

## Quick wins (each under 30 minutes)

1. `kit.tsx:27` `info` to `text-accent-ink`; numerals and `route: true` to `text-accent-ink` (Finding 1).
2. Move the quote-cap explainer cards after the card below `lg` (Finding 2).
3. Render "HTTP 422, no image" in Rubik and stack that row on `max-sm` (Finding 4).
4. Drop the "For judges" and "Positioning" labels; take Positioning out of cards (Finding 3).
5. Make the whole `Hash` pill the copy button, 44px on phones, with a named label (Finding 5).

## Owner caveats kept (not counted as defects)

- "Planned, no revenue yet", "it did not test the other gateways" and "The fork run only charged fal and stablestudio" are honest statements, graded on design only.
- "API unreachable" is not graded. `UtilityBar` is not rendered on these two routes (`App.tsx`), so it does not appear in any capture.
- The sticky header in the middle of `p-dc-signed-390.png`, and the fixed bars in the middle of `p-dc-full-390.png` and `p-qc-pressed-390.png`, are capture artifacts: full-page stitching caught fixed elements at the scroll position.

## Blind spots

- No live DOM this pass. Widths come from the PNG dimensions (390 on all four delivery-cut phone captures). The y positions above are read off the images.
- The delivery-cut bar's show/hide behaviour is read from source (`IntersectionObserver`). Only its visible state on the first screen was captured; the hidden state while the inline button is on screen was not.
- Contrast was computed by hand for `ink-subtle` on `paper` only. Chip text on chip tints was judged by eye.
- Hover, focus-visible and pressed states were read from source, not seen.
- No impeccable detector scan and no outside voice (Codex or subagent): the run constraints forbid scripts and browser work. These findings come from one reviewer.
- Tablet (768) was not captured. With `md` at 1056px, 768 gets the phone layout and the fixed bars. Unverified.

## Critic scores (0-10)

hierarchy: 8.5
primary action: 8.5
typography: 8.0
density/whitespace: 7.5
color: 7.5
consistency across the two pages: 8.0
AI-slop absence: 7.5
mobile: 7.5
average: 7.9
min: 7.5
