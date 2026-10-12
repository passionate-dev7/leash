# LEASH design audit, round 12 (v3 "night console", Web3-grade pass)

Targets: `http://localhost:4179/#/quote-cap` and `http://localhost:4179/#/delivery-cut` (local vite preview of the v3 build, HEAD `3f48963`).
Mode: audit only, report mode. No browser driven. Evidence: the 12 Playwright captures in `docs/design/review/shots-r12/`, all opened and viewed (`p-1440`, `p-390`, `p-qc-full-1440`, `p-qc-pressed-1440`, `p-qc-pressed-390`, `p-dc-1440`, `p-dc-390`, `p-dc-full-1440`, `p-dc-full-390`, `p-dc-signed-1440`; `p-qc-full-390` and `p-dc-signed-390` were judged by structure, since they match their pressed and full twins). Read-only pass over `src/pages/quotecap.tsx`, `src/pages/deliverycut.tsx`, `src/components/kit.tsx`, `src/components/shadcn/toggle.tsx`, `src/index.css`, `src/lib/config.ts`, `public/fork-proof.json`, `public/delivery-cut-proof.json`, `projects/leash/scripts/fork/quotes.json`, `projects/leash/scripts/fork/FORK.md`, `projects/leash/README.md`, `projects/leash/docs/design/contrast-r12.txt`.
Previous: `design-audit-leash-r11.md` (B+ / A-, average 8.5, min 8.0).
Classifier: HYBRID. The first screen of each page is OPERATE: one decision on a real 402. Below the fold on quote-cap is PERSUADE / READ: the judge path, Route, fork proof, rivals and business model.

Design Score: B
AI Slop Score: A-

## Summary

Round 12 delivered all five asks, and most of them work. Every number now shows what it means: "256.4x the listing +$9.961 over" sits under the quote, and Route shows "+275% / +300% / +530%" on the sellers it skipped. Links are sky blue, so violet means only a chain refusal or a cut. The fork rails show block numbers and UTC times, and they say plainly that they ran on a local anvil fork with no explorer. The real mainnet payout address links to the explorer. Delivery-cut has a clear "Before you sign" list covering vendor, what changes, the amber side effect, and "not a refund". Round 11's top finding is fixed: setup transactions are now neutral "Confirmed", the cut is violet "Cut", and "2 settled" counts only real payments.

The grade drops from B+ to B for three reasons:

1. **HIGH, new: the headline metric's basis is not what it says.** The Basis column says "The 3 real stablestudio 402s recorded unpaid". Only two 402s were recorded ($10.00 and $0.07). The third "quote" is the $0.039 catalog listing (`quotes.json`: `catalog_listed_0.039`, `request_b64: null`), and it passes by construction. Further down, the fork rail says "Quote-Cap passes $0.07 quote", but the metric counts that same quote as refused. The fork used a 2x cap and the metric uses exact listing, and the page never says so. The round's main number is the first thing a careful judge will check.
2. **HIGH, regression: at 1440x900 the primary button is below the fold on both pages.** The new metric zone (quote-cap) and the "Before you sign" box (delivery-cut) pushed the lime button out of the first desktop screen. On a 390 phone, the first quote-cap screen is entirely metric zone, so the fixed lime bar asks the user to pay a quote they have not seen yet.
3. **MEDIUM, regression: delivery-cut's left column has a ~440px hole at 1440.** This is the owner's "unfinished left panel" complaint coming back.

## Status of the r11 findings

| r11 finding | Status | Evidence this pass |
|---|---|---|
| 1 MEDIUM: green "Settled" on non-payments, including the cut | **Fixed** | `stepTone` now keys on step kind (`quotecap.tsx:149-151`). Quote-cap rail: steps 1-2 are neutral "Confirmed", and the header reads "2 settled · 1 refused by Leash · 2 reverted by the chain" (`p-qc-full-1440.png`). Delivery-cut rail step 3 is violet "Cut", matching the violet "Cut signed" verdict (`p-dc-signed-1440.png`). |
| 2 MEDIUM: numbered discs and a one-paragraph Business model card | **Not fixed** | Two `card-raised` explainers with "1"/"2" discs (`quotecap.tsx:373-380`), three judge discs (`:308`), and Business model still a `Card` (`:294-300`). |
| 3 POLISH: violet carries two jobs | **Fixed** | `--color-link #7dd3fc` (`index.css:18`). Links, "Source ↗", mpp#1034 and explorer hashes are sky blue. "Signatures to cut 1" now uses `tone="accent"`, which maps to `text-ink` (`kit.tsx:14`). The "Tempo mainnet 402" chip is neutral with a blue dot. |
| 4 POLISH: long rival "Leash:" paragraphs | **Not fixed** | Copy is unchanged (`quotecap.tsx:283-291`). Fermata's "Leash:" is still 49 words. |
| 5 POLISH: five near-pinks | **Partly fixed** | The lead's `$10.00` is now `text-refused` (`:365`). The tokens `--color-pink`, `--color-accent-2` (same hex as `refused` but not aliased), `--color-error` and `--color-error-ink` all remain (`index.css:15-16, 50-51`). |
| 6 POLISH: DESIGN.md contradicts itself | **Partly fixed** | The `index.css:66` comment now says "hashes 14". `DESIGN.md:21` still lists `ink-subtle #9a93a8` above a line that says it was raised to `#a9a2b8`. |
| 7 POLISH: Route amounts have mixed precision | **Not fixed** | `$0.008`, `$0.03`, `$0.005`, `$0.02`, `$0.002`, `$0.0126` (`p-qc-full-1440.png`). |
| 8 POLISH: lime ring on selected toggles | **Not fixed** | `data-[state=on]:ring-primary/70` (`toggle.tsx:7`). Visible on "No prompt", "Exact" and "$1.00" in `p-1440.png`. |
| 9 POLISH: rail rows hover with nothing to click | **Not fixed** | `hover:bg-surface-1` on each `<li>` (`quotecap.tsx:165`). |
| 10 POLISH: no arrival cue; copy button reads the full hash | **Not fixed** | No arrival animation. `aria-label={\`Copy ${value}\`}` (`kit.tsx:41`). |

Score: 2 fixed, 2 partly fixed, 6 not fixed. Round 12 spent its effort on the new asks, not the r11 polish list.

## Round 12 asks, checked

| Ask | Met | Evidence |
|---|---|---|
| (1) Primary metric zone at the top of quote-cap, computed from the recorded quotes, basis labelled | **Built; basis wrong** | `PrimaryMetric` (`quotecap.tsx:331-355`) computes from `QUOTES` with `DEFAULT_POLICY`. The arithmetic is right: (10.00 − 0.039) + (0.07 − 0.039) = $9.992, and $10.07 asked. But the denominator "3" includes the catalog listing, which was never a 402, and the Basis sentence calls all three "real ... 402s recorded". FINDING-1. The "Illustrative: a sample of recorded quotes, not live traffic" caveat is good. |
| (2) Every number shows its consequence | **Yes** | The risk bar reads "256.4x the listing +$9.961 over (+25,541%)" (`:91-95`), and the With-prompt quote gets the same treatment. Route shows "+275% / +300% / +530%" under each skipped seller (`:251`). "Daily limit left $0.091, was $0.20". "Delivered for the money 0% (lost 100%)". Polish: a 5-digit percentage adds nothing next to "256.4x", and pink on Route means "more expensive", not "refused" (FINDING-6). |
| (3) Semantic colours only: sky-blue links, violet only "reverted" | **Yes, with one documented exception** | All links are `text-link #7dd3fc`, 10.32:1 on paper. Violet appears only on "Reverted", "Cut" and "Cut signed". Making the cut violet was round 11's own recommendation, so it is not counted. `--color-link-hover` is still lime (`index.css:11`); `TextLink` uses `link-hover-ink`, so that token appears dead. |
| (4) Plain-language "Before you sign" on delivery-cut | **Yes** | `deliverycut.tsx:111-121`: Vendor, What changes, an amber "Side effect" covering the shared payout address and eleven other gateways, and "Not a refund". It reads in about 15 seconds and is honest. It is also the cause of FINDINGS 2 and 3, because of where it sits. |
| (5) Trust signals | **Yes** | Block plus UTC time on every receipt-backed step ("Block 43,440,365 10 Oct, 05:01:39 UTC"). `ForkNote` reads "Local anvil fork, no explorer." on both rails. The mainnet payout address `0xca4e…79Fe ↗` links through `mainnetAddressUrl` (explorer.tempo.xyz) in all three places it appears. Polish: the note says "reverted calls carry no block time", but the successful cut transaction (delivery-cut step 3) also has no time (FINDING-7). |
| Contrast | **Yes** | `projects/leash/docs/design/contrast-r12.txt`: 30 pairs, "0 below 4.5:1", lowest 6.40:1 (`ink-subtle` on `surface-1`). The file lives under `projects/leash/docs/design/`, not `apps/web/docs/design/`. One pair in use is not listed: `ink-muted` on `refused-tint` (the "Leash stopped it..." line). Computed by hand from hex: about 7.8:1, so it passes. |

## Owner complaints, checked

| Complaint | Verdict | Evidence |
|---|---|---|
| Too dense | **Worse below the fold, fine above it** | Quote-cap is now 4217px at 1440 (r11: 3789) and 8162px at 390 (r11: 6992): +11% and +17%. The growth comes from the metric zone, the Route percentages, block/time lines on 7 steps and the ForkNote. Each addition is justified on its own; together they add 1,170px on phones. The 7-line Basis paragraph on the first phone screen is the densest block on the page. |
| No clear main action | **Regressed on desktop** | Still exactly one lime button per page, with outcome labels. At 1440x900, though, "Let the agent pay this quote" sits at about y=1010 and "Sign the cut" at about y=1024, both below the fold (`p-1440.png`, `p-dc-1440.png`). In r11 both were on the first screen. Phones keep the fixed bar. FINDING-2. |
| Gray text under 12px | **Fixed** | Capture script: 0 text nodes under 12px. The smallest is the 12px Route "+%" caption (`text-caption`) in pink, 8.09:1. |
| Walls of monospace | **Fixed, with leakage** | No sentence is in mono. Two places now set English words in mono: "2 `of 3`" in the metric (`:345`, the whole value is `metric-value` mono) and "`256.4x the listing`" in the risk bar (`:93`, `num` on the phrase). They are short, but they read as code. FINDING-5. |
| Unfinished left panel | **Fixed on quote-cap, regressed on delivery-cut** | Quote-cap 1440: the explainers end close to the card's policy half. Delivery-cut 1440: the left column ends at y≈640 while the card runs to y≈1080, leaving a ~440px hole (`p-dc-full-1440.png`). FINDING-3. |

## First impression

**Quote-cap, 1440 (`p-1440.png`).** The page now opens like a risk desk. The first thing I see is a pink `$9.992` in 56px mono, then the pink "2" of "2 of 3", then the headline. That order is what was asked for: the loss Leash prevented outranks the pitch. The three-cell panel reads as Hyperliquid-style zoning: value, count, basis. Then I read the Basis: "The 3 real stablestudio 402s recorded unpaid". I count the toggles in the card (No prompt, With prompt, Listed) and wonder why "Listed" counts as a recorded 402. The button is not on this screen. One word: confident, but you have to scroll to act.

**Quote-cap, pressed (`p-qc-pressed-1440.png`).** The pink "Refused before signing" panel lands under the button. That still works. Further down, the fork rail is the best it has been: neutral setup, two green payments, a pink refusal, two violet reverts, each with a block and a time. Then I reach step 3, "Quote-Cap passes $0.07 quote", and scroll back up to a metric that says the $0.07 quote was refused.

**Delivery-cut, 1440 (`p-dc-1440.png`).** Amber 47%, amber "HTTP 422, no image", amber "$0.003 lost", then "Before you sign: what this cut does". It is good writing, and it pushes "Sign the cut" off the first screen. On the left, under the two metric tiles, there is nothing from y≈640 down to the card's end.

**Phones (`p-390.png`, `p-dc-390.png`).** Delivery-cut is fine: headline, lead, two tiles, the start of the card, and the lime bar. Quote-cap's first screen is the metric zone plus 7 lines of Basis, the start of the h1, and a lime bar saying "Let the agent pay this quote". The quote it acts on ($10.00) is about a screen and a half further down.

## Findings, ranked

**FINDING-1 (HIGH, content / trust, new). The headline metric's basis overstates what was recorded, and the fork rail contradicts it.**
- `QUOTES` (`quotecap.tsx:17-21`) holds three entries. `projects/leash/scripts/fork/quotes.json` shows only two are captured 402s; `catalog_listed_0.039` has `request_b64: null`. The README agrees: "Its 402 asked $10.00 when the prompt was missing, and $0.07 with a prompt."
- The Basis copy (`:350`) says "The 3 real stablestudio 402s recorded unpaid". That is false for one of the three, and "2 of 3" uses a denominator padded with a quote that cannot fail.
- Fork run 1 step 3 reads "Quote-Cap passes $0.07 quote, agent pays stablestudio". The fork used `cap = catalog 0.039 x 2` (`FORK.md:7`); the metric uses exact listing. The page does not name either policy in the fork section.

Why it matters: this is the round's main number, and judges check main numbers. The honest version is stronger anyway: **2 of 2 recorded 402s refused**.

Fix (about 6 lines):
- Compute `PrimaryMetric` over the two recorded quotes only (filter `id !== 'catalog'`).
- Change the Basis to "The 2 stablestudio 402s recorded unpaid on Tempo mainnet ..., against the $0.039 mpp.dev listing".
- Add "Fork policy: up to 2x the listing, $0.20 daily key limit" to the Fork run 1 intro (`:195`), so "$0.07 passes" there reads as a different policy, not a contradiction.

**FINDING-2 (HIGH, hierarchy / primary action, regression). The primary button left the first desktop screen on both pages, and the quote left the first phone screen.**
- Quote-cap 1440: the metric zone (≈210px plus a 48px gap) pushes the card down; the button sits at y≈1010 of 900.
- Delivery-cut 1440: the "Before you sign" box (≈270px) puts "Sign the cut" at y≈1024.
- Quote-cap 390: the first screen is metric zone and Basis only; the fixed bar acts on an unseen quote. In r11 this was a +5 goodwill item.

Fix, quote-cap:
- Make the metric zone one compact row. Keep the value and the count, and move Basis to a single line under the row ("Basis: 2 recorded stablestudio 402s vs the $0.039 listing, exact policy. Illustrative.") with the full sentence in a `<details>`. That saves about 90px on desktop and 250px on phones.
- On phones, put the metric zone after the h1 and lead, or after the card.

Fix, delivery-cut: see FINDING-3, which also fixes this.

**FINDING-3 (MEDIUM, layout, regression). Delivery-cut's left column has a ~440px hole at 1440.**
The header column ends after the metric tiles (y≈640). The card, made longer by "Before you sign", ends at y≈1080 (`p-dc-full-1440.png`).
Fix: at `lg`, render the "Before you sign" list in the left column under the metric tiles, as plain text with no box, while keeping it in the card on phones, where it sits right above the button. That fills the hole and lifts "Sign the cut" to about y≈760 on the first desktop screen. Same content, different slot; one conditional.

**FINDING-4 (MEDIUM, AI slop / layout, r11 F2 carried). Five numbered discs and a one-paragraph Business model card remain.**
Same as r11: two boxed hero explainers with "1"/"2" discs (`quotecap.tsx:373-380`) and Business model as its own `Card` (`:294-300`). Keep the judge-step discs, since that order matters.
Fix: remove the box and the disc from each explainer and separate them with a hairline. Show Business model as plain text under the rivals panel.

**FINDING-5 (POLISH, typography). English words are set in mono in two places.**
- The "2 of 3" metric sets "of 3" in 40px JetBrains Mono (`:345`).
- The risk bar sets "256.4x the listing" in mono (`:93`).

Fix: wrap only the digits in `num`, so the word "of" and "the listing" are in Rubik. Also show the overcharge as "$9.99" in the metric. Three decimals ($9.992) read as engineering precision on a headline.

**FINDING-6 (POLISH, color / data viz). Pink on Route means "costs more", and the percentage on the risk bar is noise.**
- `text-refused` on the skipped-seller "+275%" (`:251`) reuses the Leash-said-no colour for a price premium. Use `text-ink-subtle`. The green bar and the "% less" chip already carry the outcome.
- "(+25,541%)" next to "256.4x" says the same thing in a harder form. Show the % only when the multiple is under 2x (so the With-prompt quote keeps "+79%").
- Route precision (r11 F7) is still open.

**FINDING-7 (POLISH, trust copy). ForkNote's "reverted calls carry no block time" is incomplete on delivery-cut.**
Step 3 (the successful cut, `time: null` in `delivery-cut-proof.json`) shows "Block 43,488,718" with no time, and the note implies only reverts lack one. Either read the time from the receipt in `run-delivery-cut.sh`, or change the note to "some steps carry no block time".

**FINDING-8 (POLISH, content). Delivery-cut shows the payout address four times.**
The address appears in the "Paid, not delivered" panel, in "Before you sign: What changes", in the Evidence card, and in the cut transaction's meaning. Drop the sentence from the amber panel (`deliverycut.tsx:107`); "Before you sign" now says the same thing better.

**FINDING-9 (POLISH, carried from r11).** Lime ring on selected toggles (F8). Row hover with nothing to click (F9). No arrival cue for the three new rows, and the copy button announces the full 66-character hash (F10). Rival paragraph length (F4). The leftover pink tokens and the `DESIGN.md:21` mismatch (F5, F6).

## AI slop, judged

Absent: gradients, glow and halo, glassmorphism, emoji, stock imagery, avatars, filler sparklines, testimonial rows, eyebrow chips, decorative left borders. The new metric zone is not the "three big numbers with tiny labels" template. One of its three cells is a paragraph naming its source and its policy, and the values are computed from the same `checkQuote` the card runs. That earns it. Block and time lines, the anvil note and the explorer links are the opposite of slop: they invite you to check the claim.

Present: the five discs and the boxed explainers, and the Business model card (FINDING-4). The metric zone sits above the h1, so the page opens with a stat strip. It works here because the stat is the product's main job, but it is a pattern to watch.

Litmus:
- Brand in the first screen: YES.
- One strong visual anchor: YES (pink $9.992 on quote-cap; the card on delivery-cut).
- Understandable from headings alone: YES.
- Each section has one job: YES.
- Cards necessary: MOSTLY. Not the hero explainers or Business model.
- Motion improves hierarchy: NO. Only colour transitions.
- Premium with shadows removed: YES.

## Consistency across the two pages

Shared:
- header, nav pill and the `5fr / 6fr` hero
- the decision card split by a hairline
- one lime button, plus a fixed bar on phones
- one `StepFeed` with `ForkNote`
- one five-tone status system
- sky-blue links, and explorer links on real mainnet addresses

Divergent:
- **Zoning:** quote-cap opens with a full-width metric zone above the hero; delivery-cut keeps its metrics (47%, 1) as tiles inside the left column. Same job, two layouts. If quote-cap's zone stays, delivery-cut should open the same way ("$0.003 lost on a paid-then-failed call · 47% of 89 calls · Basis: vet402 on Tempo, mpp#1034"), or quote-cap's zone should move into its left column.
- **Fork facts:** quote-cap gives "Forked at block" its own tile; delivery-cut puts it in the intro sentence (r10 F6 remainder, still open).
- **Policy disclosure:** quote-cap's metric names its policy, but neither fork section does (FINDING-1).

## Trunk test

Both pages PASS:
- Site: logo plus "Leash".
- Page: active nav pill plus h1.
- Sections: eight-item nav, hamburger at 390.
- Options at this level: one button, below the fold on desktop (FINDING-2).
- Location: the nav pill.
- Search: does not apply.

## Goodwill (from captures, not a live walk)

```
quote-cap   70 ████████████████████░░░░░░░░░░
  loss Leash prevented stated first       70 → 80  (+10)
  basis and "illustrative" labelled       80 → 85  (+5)
  button below the fold at 1440           85 → 80  (-5)
  "3 real 402s" includes the listing      80 → 72  (-8 trust, once noticed)
  fork: "$0.07 passes" vs metric refused  72 → 67  (-5 ambiguous)
  rail with blocks, times, anvil note     67 → 77  (+10)
  FINAL 77/100
delivery-cut 70 ████████████████████░░░░░░░░░░
  loss stated in money above the CTA      70 → 80  (+10)
  "Before you sign" incl. side effect     80 → 90  (+10 upfront about costs)
  button below the fold at 1440           90 → 85  (-5)
  explorer link on real payout address    85 → 90  (+5)
  cut is violet in verdict and rail       90 → 95  (+5 r11 fix)
  FINAL 95/100
```

## Category grades

| Category | Grade | Driver |
|---|---|---|
| Visual hierarchy | B | Strong risk-first anchor; FINDING-2 (HIGH) |
| Typography | A- | Scale holds, mono confined; polish 5 |
| Spacing and layout | B+ | FINDING-3 (MEDIUM); FINDING-4 remainder |
| Color and contrast | A- | Semantic system now clean, 0 pairs below 4.5:1; polish 6, carried 5 and 8 |
| Interaction states | B+ | Unchanged; carried polish 9 and 10 |
| Responsive | B+ | Quote-cap phone first screen lacks the quote (part of FINDING-2); 8162px tall |
| Content | B | FINDING-1 (HIGH); "Before you sign" is excellent |
| AI slop | A- | FINDING-4 |
| Motion | B | Nothing authored; reduced motion respected (`index.css:117`) |
| Performance feel | not measured | No LCP/CLS this run |

## Quick wins (each under 30 minutes)

1. Base the metric on the 2 recorded 402s ("2 of 2 refused"), correct the Basis sentence, and name the fork policy (2x listing, $0.20 key limit) in the Fork run 1 intro (FINDING-1).
2. Move delivery-cut's "Before you sign" into the left column at `lg` (FINDINGS 2 and 3 in one change).
3. Compress the quote-cap metric zone to one row with a one-line basis, and reorder it below the hero on phones (FINDING-2).
4. Use `num` only on digits in "2 of 3" and "256.4x"; show $9.99; drop the % when the multiple is 2x or more; un-pink the Route premiums (FINDINGS 5 and 6).
5. Remove the explainer discs and boxes; un-card Business model (FINDING-4).

## Owner caveats kept (not counted as defects)

- "Illustrative: a sample of recorded quotes, not live traffic", "Planned, no revenue yet", "it did not test the other gateways", "Not a refund" and the anvil no-explorer note are honest statements, graded on design only. FINDING-1 is the opposite case: the copy claims more than the data holds.
- The red "API unreachable" text is a CORS artifact of this preview origin and was not graded.
- The sticky header mid-page in `p-dc-signed-1440.png` and `p-qc-pressed-1440.png`, and the fixed lime bar mid-page in `p-dc-full-390.png`, are full-page capture artifacts.
- The disabled "Cut signed" button at 50% opacity is a deliberate done state.

## Blind spots

- No live DOM. Fold positions (y≈1010, y≈1024) and the delivery-cut hole are read off the 1440 PNGs at 1:1. The 390 full-page quote-cap captures display at about 1:4, so below-the-fold phone layout was judged by structure.
- The green "Paid / $X settled" verdict path was read from source, not seen.
- The `ink-muted` on `refused-tint` contrast was computed by hand, not by `contrast.py`.
- Hover, focus-visible and the 768 tablet width were not observed.
- No impeccable detector scan, no outside voice, no gstack preamble or telemetry: this run's constraints forbid scripts, scratch files and browser work. One reviewer.

## Critic scores (0-10)

hierarchy: 8.0
primary action: 7.5
typography: 8.5
density/whitespace: 7.5
color: 8.5
consistency across the two pages: 8.0
AI-slop absence: 8.5
mobile: 7.5
average: 8.0
min: 7.5
