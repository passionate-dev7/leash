# LEASH design audit, round 12, second pass (v3 "night console", Web3-grade pass)

Targets: `http://localhost:4179/#/quote-cap` and `http://localhost:4179/#/delivery-cut` (local vite preview of the v3 build, HEAD `f26edb6`).
Mode: audit only, report mode. No browser driven. Evidence: the Playwright captures in `docs/design/review/shots-r12/`, opened and viewed: `p-1440`, `p-390`, `p-qc-full-1440`, `p-qc-pressed-1440`, `p-qc-pressed-390`, `p-dc-1440`, `p-dc-390`, `p-dc-full-1440`, `p-dc-full-390`, `p-dc-signed-1440`. Source read-only: `src/pages/quotecap.tsx`, `src/pages/deliverycut.tsx`, `src/components/kit.tsx`, `src/components/shadcn/toggle.tsx`, `src/index.css`, `DESIGN.md`.
Previous: `design-audit-leash-r12a.md` (first pass: B / A-, average 8.0, min 7.5) and `design-audit-leash-r11.md` (B+ / A-, average 8.5, min 8.0).
Classifier: HYBRID. Each page's first screen is OPERATE (one decision on a real 402). Below the fold on quote-cap is PERSUADE / READ.

Design Score: B+
AI Slop Score: A-

## Summary

The second pass fixes what the first pass flagged. The headline metric now reads "2 of 2" over the two real recorded 402s. Its Basis names the policy and says why the fork run lets the $0.07 quote through, and the Fork run 1 intro also names its own policy ("up to 2× the listing, $0.20 daily key limit"). The metric sits in the left column under the lead, so at 1440x900 the lime "Let the agent pay this quote" button is at y≈795 and "Sign the cut" at y≈708, both on the first screen. On phones the quote card now comes before the metric, so the fixed lime bar acts on a quote the user can see. Delivery-cut's "Before you sign" list fills the left column at `lg`, and the 440px hole is gone. Quote-cap also got shorter: 4004px at 1440 (r12a 4217) and 7887px at 390 (r12a 8162).

The round's main job is now clear in the first two seconds: listed `$0.039`, asked `$10.00`, "256.4x the listing +$9.961 over", and a pink `$9.99` refused. On delivery-cut, `$0.003 lost` and "0% (lost 100%)" sit right above "Sign the cut".

What keeps this at B+ instead of A-:
1. **Delivery-cut's card has a ~140px empty band at 1440.** The hole moved from the left column into the bottom of the card, and it is smaller.
2. **Mono still bleeds into English** in the "2 of 2" metric.
3. **The r11 polish list is still mostly open:** lime toggle ring, row hover, copy-button label, Route precision, stale tokens.

## Status of the first-pass (r12a) findings

| r12a finding | Status | Evidence |
|---|---|---|
| 1 HIGH: metric basis says "3 real 402s", includes the listing; fork "$0.07 passes" contradicts it | **Fixed** | `PrimaryMetric` counts only the recorded quotes (`quotecap.tsx:330-352`): "Real 402s refused 2 of 2", "$10.07 asked, nothing signed". The Basis reads "the 2 stablestudio 402s recorded unpaid ... default policy: exact listing, $1.00 cap ... Fork run 1 used a 2x allowance, so there the $0.07 quote passes." The fork intro (`:195`) names "Fork policy: up to 2× the listing, $0.20 daily key limit" (`p-qc-full-1440.png`). Rail step 3 "Quote-Cap passes $0.07 quote" no longer reads as a contradiction. |
| 2 HIGH: primary button below the 1440 fold on both pages; phone first screen lacks the quote | **Fixed** | `p-1440.png`: button at y≈768-824 of 900. `p-dc-1440.png`: "Sign the cut" at y≈681-737. `p-390.png`: h1, lead, then the quote card ($0.039 / $10.00 / $0.039) above the fixed bar. |
| 3 MEDIUM: ~440px hole in delivery-cut's left column at 1440 | **Fixed, residue moved** | "Before you sign" renders in the left column at `lg` (`deliverycut.tsx:78-89`). The left column now ends at y≈905, level with the card. Residue: the card's action half ends at y≈765 and the card at y≈905, which leaves a ~140px empty band (new FINDING-1). |
| 4 MEDIUM: numbered discs on hero explainers; Business model card | **Fixed** | The explainers are a title plus a paragraph split by a hairline, with no box and no disc (`quotecap.tsx:373-375`). Business model is plain text in a two-column row under a hairline (`:294-296`). The three judge-step discs stay, which is correct because their order matters. |
| 5 POLISH: English set in mono ("of 3", "256.4x the listing"); $9.992 precision | **Partly fixed** | The risk bar wraps only `256.4x` in `num`; "the listing" is Rubik (`:93`). The metric shows `$9.99`. "of" is still mono: it sits in its own span, but inside `p.metric-value`, which sets `font-family: var(--font-mono)` (`index.css:136`). FINDING-2. |
| 6 POLISH: pink Route premiums; 5-digit % on the risk bar | **Fixed** (precision open) | The skipped-seller "+275% / +300% / +530%" is `text-ink-subtle` (`:251`). The risk bar shows "+$9.961 over" with no percentage. Route amounts still mix 2, 3 and 4 decimals (FINDING-5). |
| 7 POLISH: ForkNote implied only reverts lack a block time | **Fixed** | Both rails now say "some steps carry no block time" (`p-dc-full-1440.png`, `p-qc-full-1440.png`). |
| 8 POLISH: payout address shown four times on delivery-cut | **Partly fixed** | The amber panel now reads "Cutting removes fal from what the agent key may pay." with no address. The address still appears three times before signing: Before you sign, Evidence, and the rail after signing. That is acceptable, since each shows it for a different job. |
| 9 POLISH: carried r11 items | **Not fixed** | See the r11 table. |

## Status of the r11 findings

| r11 finding | Status |
|---|---|
| 1 MEDIUM: green "Settled" on non-payments | **Fixed** (r12a): neutral "Confirmed" on fund/authorize, violet "Cut" on the cut (`p-dc-signed-1440.png`). |
| 2 MEDIUM: discs and Business model card | **Fixed** this pass (judge discs kept on purpose). |
| 3 POLISH: violet carries two jobs | **Fixed**: links `#7dd3fc`; "Signatures to cut 1" renders in ink. |
| 4 POLISH: long rival "Leash:" paragraphs | **Not fixed**: Fermata's "Leash:" is still about 49 words. |
| 5 POLISH: five near-pinks | **Partly fixed**: the lead uses `text-refused`. `--color-pink`, `--color-accent-2`, `--color-error` and `--color-error-ink` remain (`index.css:15-16, 50-51`). |
| 6 POLISH: DESIGN.md contradicts itself | **Not fixed**: `DESIGN.md:21` lists `ink-subtle #9a93a8`; `:48` says it was raised to `#a9a2b8` and points to `contrast-r11.txt`, not r12. |
| 7 POLISH: Route precision | **Not fixed**. |
| 8 POLISH: lime ring on selected toggles | **Not fixed**: `ring-primary/70` (`toggle.tsx:8`); visible on "No prompt", "Exact" and "$1.00" in `p-1440.png`. |
| 9 POLISH: rail rows hover with nothing to click | **Not fixed**: `hover:bg-surface-1` (`quotecap.tsx:165`). |
| 10 POLISH: no arrival cue; copy button reads the full hash | **Not fixed**: `aria-label={\`Copy ${value}\`}` (`kit.tsx:43`). |

## Round 12 asks, checked

| Ask | Met | Evidence |
|---|---|---|
| (1) Primary metric zone, honest, basis labelled | **Yes** | It sits in the left column under the lead, which is a better slot than the full-width strip: the pitch comes first, then the proof, then the action on the right. The arithmetic checks out: (10.00 − 0.039) + (0.07 − 0.039) = 9.992, shown as $9.99. The denominator is 2 real 402s. "Illustrative sample, not live traffic" is labelled. |
| (2) Every number shows its consequence | **Yes** | "256.4x the listing +$9.961 over"; With-prompt keeps its multiple; Route "+275%" under each skipped seller; "Daily limit left $0.091, was $0.20"; "0% (lost 100%)". |
| (3) Semantic colours only | **Yes** | Sky-blue links throughout (mpp#1034, Source ↗, explorer hashes, "See the three new transactions ↓"). Violet appears only on Reverted, Cut and Cut signed. Pink appears only where Leash refused. Amber means vendor failure. Green means a payment. The one off-system colour is the lime toggle ring (r11 F8). |
| (4) "Before you sign" on delivery-cut | **Yes** | Vendor, What changes (with the explorer-linked address), amber Side effect (eleven other gateways), and Not a refund. Left column on desktop; inside the card above the button on phones (`deliverycut.tsx:122-131`, `p-dc-full-390.png`). |
| (5) Trust signals | **Yes** | Block plus UTC time on receipt-backed steps; "Local anvil fork, no explorer." on both rails; the mainnet payout address links to explorer.tempo.xyz. One timezone slip: the metric Basis says "09:45 IST" while every rail time is UTC (FINDING-3). |
| Contrast | **Yes** | `contrast-r12.txt`: 0 pairs below 4.5:1. Captures: 0 text nodes under 12px. |
| Overlap test | **Accepted as stated** | `test/overlap.test.ts` exists. Not run here (no scripts this pass). No collisions are visible in any capture at 1440 or 390. |

## Owner complaints, checked

| Complaint | Verdict | Evidence |
|---|---|---|
| Too dense | **Fixed above the fold; acceptable below** | First screens: headline, lead, one proof block, one card, one button. Quote-cap lost about 210px at 1440 and 275px at 390 versus r12a. The densest remaining block is the 4-line Basis paragraph and the three rival columns (r11 F4). |
| No clear main action | **Fixed** | One lime button per page, on the first screen at 1440 and as a fixed bar on phones, with outcome labels. |
| Gray text under 12px | **Fixed** | 0 nodes under 12px. The smallest is the 12px Route "+%" caption in `ink-subtle`, documented at ≥ 6.4:1. |
| Walls of monospace | **Fixed** | Mono only on amounts, hashes, block numbers and script paths. One leak: "of" in "2 of 2" (FINDING-2). |
| Unfinished left panel | **Fixed** | Quote-cap: the left column (lead, metric, two explainers) ends at y≈930, level with the card at y≈950. Delivery-cut: the left column ends at y≈905, level with the card. The empty space is now inside the card (FINDING-1). |

## First impression

**Quote-cap, 1440 (`p-1440.png`).** I read the headline, then the lead, which hands me two numbers: `$0.039` white and `$10.00` pink. The pink `$9.99` and "2 of 2" underneath confirm it in money and count. On the right, the card repeats the same story as a decision: listed, asked, most this agent will pay. A pink risk bar says "256.4x the listing", and the lime button sits under the policy. My eye goes headline → pink `$9.99` → `$10.00` in the card → lime button. That is the intended order. One word: decisive.

**Quote-cap, pressed (`p-qc-pressed-1440.png`).** `$10.00` turns pink, and a pink "Refused before signing" panel lands under the button: "The quote asked for $10.00 against a $0.039 listing." Further down, the fork intro names its policy before the rail shows "$0.07 passes". No contradiction left to scroll back for.

**Delivery-cut, 1440 (`p-dc-1440.png`).** Headline, amber 47%, then "Before you sign" on the left. On the right: amber "HTTP 422, no image", amber "$0.003 lost", lime "Sign the cut". I can read what I'm signing and sign it without scrolling. Below the button, the card runs on for ~140px of nothing.

**Delivery-cut, signed (`p-dc-signed-1440.png`).** Violet "Cut signed / fal is cut from the agent key", a blue link to the new rows, the disabled button. "Before you sign" leaves the left column, so the left now ends at y≈640 while the card ends at y≈795. The rail below adds steps 3-5: violet Cut, violet Reverted, green Settled.

**Phones (`p-390.png`, `p-dc-390.png`).** Quote-cap: headline, lead, then the quote card with `$10.00` visible above the fixed bar. Delivery-cut: headline, lead, two tiles, card start, fixed bar. Both work.

## Findings, ranked

**FINDING-1 (POLISH, layout, residue of r12a F3). Delivery-cut's card has a ~140px empty band at 1440, and the signed state leaves a ~155px gap on the left.**
The hero grid stretches the card to the taller left column. The tinted action half ends at y≈765 and the card at y≈905, which leaves a dark, empty strip under "Sign the cut" (`p-dc-full-1440.png`). After signing, "Before you sign" unmounts (`deliverycut.tsx:78`), so the imbalance flips to the left (`p-dc-signed-1440.png`).
Fix: make the card `flex flex-col` and give the action half `flex-1`, so the tint fills the card. Or add `lg:items-start` to the hero grid, as the Evidence row already does. For the signed state, keep the list and switch its heading to "What this cut did". That keeps the side-effect disclosure visible after the action, which is when a reader wants it most.

**FINDING-2 (POLISH, typography). "of" in the "2 of 2" metric is still mono.**
The span is separate, but `.metric-value` sets the mono family on the whole `<p>` (`quotecap.tsx:348`, `index.css:136`). In `p-1440.png`, "of" reads as code at 40px. Fix: `font-sans` on the " of " span, one class.

**FINDING-3 (POLISH, trust copy). The metric Basis uses IST; every block time on the page uses UTC.**
"recorded unpaid on Tempo mainnet (10 Oct 2026, 09:45 IST)" (`quotecap.tsx:352`) sits above a rail that reads "10 Oct, 05:01:39 UTC". A judge comparing times has to convert. Write "10 Oct 2026, 04:15 UTC".

**FINDING-4 (POLISH, content). "$9.99 above the $0.039 listing" is a sum of two overcharges against a per-call listing.**
The card right next to it says "+$9.961 over". A careful reader asks where the extra $0.03 comes from. The count cell's "$10.07 asked" explains it only if you add it up yourself. Fix: "$9.99 over listing, across both quotes", or label the cell "Total overcharge refused".

**FINDING-5 (POLISH, data viz, r11 F7). Route amounts mix precision.** `$0.008`, `$0.03`, `$0.005`, `$0.02`, `$0.002`, `$0.0126`. Format the chart to 4 decimals so the tabular column lines up.

**FINDING-6 (POLISH, color, r11 F8). Lime ring on selected toggles.** `ring-primary/70` (`toggle.tsx:8`) puts lime on "No prompt", "Exact" and "$1.00", the only lime on the page besides the button. Use `ring-hairline-strong`.

**FINDING-7 (POLISH, content / responsive). "0% (lost 100%)" wraps inside the parenthesis at 390.** `p-dc-full-390.png`: "0% (lost" / "100%)". Add `whitespace-nowrap` on the value, or let the label wrap ("Delivered for the / money" already wraps).

**FINDING-8 (POLISH, carried).** Rail row hover with nothing to click (`quotecap.tsx:165`). The copy button announces the full 66-character hash (`kit.tsx:43`). No arrival cue for the new rail rows. Rival "Leash:" paragraphs around 49 words. Leftover pink tokens. `DESIGN.md:21` still lists `#9a93a8`, and `:48` cites `contrast-r11.txt`.

## AI slop, judged

Absent: gradients, glow and halo, glassmorphism, emoji, stock imagery, avatars, filler sparklines, testimonial rows, hero eyebrow chips, decorative left borders, and boxed explainers with numbered discs (removed this pass). The metric block is not the "three big numbers" template: two computed cells plus a paragraph that names its source, time, policy and its own exception. Block heights, UTC times, the anvil note and the explorer links invite verification.

Remaining patterns: `card-raised` metric tiles on the left of both pages (`kit.tsx:26`). They carry real computed values and they are consistent, so they are not counted. Section eyebrows ("Route · route: true", "Fork run 1 · Quote-Cap") each carry a fact.

Litmus:
- Brand in the first screen: YES.
- One strong visual anchor: YES (pink `$9.99` / `$10.00`; amber `$0.003 lost`).
- Understandable from headings alone: YES.
- Each section has one job: YES.
- Cards necessary: YES (decision card, rail, chart, rivals panel; Business model and explainers are now uncarded).
- Motion improves hierarchy: NO (colour transitions only).
- Premium with shadows removed: YES.

## Consistency across the two pages

Shared:
- header, opaque sticky bar and nav pill
- `5fr / 6fr` hero with h1, lead, then proof tiles in the left column (now the same zoning on both pages)
- a decision card split by a hairline into facts and a tinted action half
- one lime button with a fixed phone bar
- `StepFeed` with `ForkNote`, the five-tone status system, sky-blue links

Divergent:
- **Fork facts:** quote-cap gives "Forked at block" its own tile; delivery-cut puts the block in the intro sentence (r10 F6 remainder).
- **After the action:** quote-cap keeps its left column after pressing; delivery-cut unmounts "Before you sign" after signing (FINDING-1).
- **Times:** IST in the quote-cap Basis, UTC everywhere else (FINDING-3).

## Trunk test

Both pages PASS:
- Site: logo plus "Leash".
- Page: active nav pill plus h1.
- Sections: eight-item nav, hamburger at 390.
- Options: one lime button on the first screen.
- Location: the nav pill.
- Search: does not apply.

## Goodwill (from captures, not a live walk)

```
quote-cap   70 ████████████████████░░░░░░░░░░
  pitch, proof, action on one screen     70 → 80  (+10)
  basis names policy and its exception   80 → 87  (+7 upfront)
  phone: quote shown before button       87 → 92  (+5)
  refusal panel says what and why        92 → 97  (+5)
  "$9.99" vs "+$9.961" needs mental sum  97 → 94  (-3)
  FINAL 94/100
delivery-cut 70 ████████████████████░░░░░░░░░░
  loss stated in money above the CTA     70 → 80  (+10)
  "Before you sign" next to the button   80 → 90  (+10)
  explorer link on real payout address   90 → 95  (+5)
  empty band under the button            95 → 93  (-2 unfinished look)
  side effect gone after signing         93 → 91  (-2)
  FINAL 91/100
```

## Category grades

| Category | Grade | Driver |
|---|---|---|
| Visual hierarchy | A- | Risk-first anchor, one button on the first screen |
| Typography | A- | Mono confined; polish 2 |
| Spacing and layout | A- | Holes closed; polish 1 |
| Color and contrast | A- | Semantic system clean, 0 pairs below 4.5:1; polish 6, carried tokens |
| Interaction states | B+ | Carried polish 8 |
| Responsive | A- | Phone order fixed; polish 7 |
| Content | A- | Honest metric and basis; polish 3, 4 |
| AI slop | A- | Discs and Business model card gone |
| Motion | B | Nothing authored; reduced motion respected |
| Performance feel | not measured | No LCP/CLS this run |

## Quick wins (each under 30 minutes)

1. Make the delivery-cut card a flex column with the action half `flex-1`, or `lg:items-start` on the hero; keep the list after signing as "What this cut did" (FINDING-1).
2. `font-sans` on the " of " span in the metric (FINDING-2).
3. Basis time to UTC; relabel the overcharge cell "Total overcharge refused" (FINDINGS 3 and 4).
4. Route amounts to 4 decimals; toggle ring to `hairline-strong`; remove rail-row hover (FINDINGS 5, 6, 8).
5. `whitespace-nowrap` on "0% (lost 100%)"; fix `DESIGN.md:21` and `:48` (FINDINGS 7, 8).

## Owner caveats kept (not counted as defects)

- "Illustrative sample, not live traffic", "Fork run 1 used a 2x allowance", "Planned, no revenue yet", "it did not test the other gateways", "Not a refund" and the anvil no-explorer note are honest statements, graded on design only.
- The red "API unreachable" text is a CORS artifact of this preview origin and was not graded.
- The sticky header and fixed lime bar appearing mid-page in the full-page 390 captures are stitching artifacts.
- The disabled "Cut signed" button is a deliberate done state.

## Blind spots

- No live DOM. Fold positions and the card band are read off the 1440 PNGs at 1:1. The full-page 390 quote-cap captures display at about 1:4, so below-the-fold phone layout was judged by structure.
- `overlap.test.ts` was not run (no scripts allowed this pass); I relied on the owner's report and the captures.
- `p-qc-full-390.png`, `p-dc-signed-390.png` and the 768 width were not opened; hover and focus-visible were read from source.
- No impeccable scan, no outside voice, no gstack preamble or telemetry: this run forbids scripts, scratch files and browser work. One reviewer.

## Critic scores (0-10)

hierarchy: 8.5
primary action: 9.0
typography: 8.5
density/whitespace: 8.0
color: 8.5
consistency across the two pages: 8.5
AI-slop absence: 8.5
mobile: 8.5
average: 8.5
min: 8.0
