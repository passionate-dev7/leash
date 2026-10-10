# Design audit: Leash #/quote-cap and #/delivery-cut (round 8)

Mode: audit only, report only. Captures from `shots-r8/`, viewed this round: `p-1440.png` and `p-390.png` (re-read), `p-dc-390.png`, `p-qc-full-1440.png`, `p-qc-full-390.png`, `p-qc-pressed-1440.png`, `p-qc-pressed-390.png`, `p-dc-full-1440.png`, `p-dc-full-390.png`. Source read-only: `quotecap.tsx`, `deliverycut.tsx`, `index.css`, `App.tsx`, `components/shadcn/button.tsx` and `toggle.tsx` (sizes), plus two grep checks on the two page files. No browser was started, no script was run, no source was edited, nothing was committed or deployed. The only file written is this report.

Design Score: B+
AI Slop Score: A-

Design Score is the average of the eight axes below: 8.3 (raw 8.25). Bands as in r5 to r7: B+ at 8.0 to 8.4. Up from 8.2 in r7. Mobile moved up because the delivery-cut bar no longer covers the failed-call row. Density did not move, because quote-cap got longer.

## Summary

Both pages read as one product at 1440. Each has one solid ink action in the first viewport, and the quote-cap pressed state turns the refused price red. Both fork sections now balance. Two things hold the grade: quote-cap is long (3,573px at 1440, 6,480px at 390), and the payout-address figure on delivery-cut still has no block number. The owner's honest caveats are kept on both pages and are not counted as defects.

## Round 7 findings, checked

| # | r7 finding | r8 status | Evidence |
|---|---|---|---|
| 1 | High, honesty: four sentences volunteer gaps | Reversed by owner. Not a defect. | Caveats kept: "(planned, no revenue yet)" (`p-qc-full-1440.png`), "These hashes exist only on a local anvil fork" (`quotecap.tsx:247`), "did not test the other gateways" (`deliverycut.tsx:109`). |
| 2 | High, mobile: delivery-cut bar covers the failed-call row | Partly fixed. | "fal answered HTTP 422, no image" and its note sit above the bar on the first phone screen (`p-dc-390.png`). The bar still covers the first lines of the mechanism sentence that follows the card (`deliverycut.tsx:78`, bar at `:96`). |
| 3 | Medium, density: quote-cap bottom blocks with empty left columns | Layout fixed. Length not. | Block H2s now sit full width above their content (`quotecap.tsx:200-210`). Business model is one paragraph. Length: 3,573px at 1440 (r7: 3,280), 6,480px at 390 (r7: 5,483). |
| 4 | Medium, 1440: quote-cap fork section about 210px short | Fixed by content. | The stats table now sits in the left column. The two columns end about 30px apart (`p-qc-full-1440.png`). The split is still 5fr/7fr (`quotecap.tsx:133`), so the balance holds only at the current copy length. |
| 5 | Medium, evidence: payout-address probe with no block and no link | Open. | `deliverycut.tsx:109` unchanged: "In our unpaid 402 probes of mpp.tempo.xyz on 3 Oct 2026", with no block number and no link. |

Other items carried from r7:
- "A local anvil fork at block N" (r7 asked for "A fork of Tempo mainnet"). Not counted. The owner's fork-only caveat keeps "local".
- Red and green beyond the rule. Vendor failure is now amber (`deliverycut.tsx:74`, `:86`). "Reverted" stays red, which is a chain refusal. The signed cut is still green (`deliverycut.tsx:81-82`). Open, Low.
- Shared nav shows eight items plus "Create a team" (`App.tsx:58`). Unchanged. Not scored.
- Hover and chip focus: unverified (no browser).

## Owner complaints, checked

- **Too dense: partly.** Delivery-cut is compact (about 1,200px at 1440). Quote-cap has six bands and runs 3,573px at 1440, up 293px since r7. At 390 it is 6,480px, up about 1,000px. "The same API" adds a stats table and a three-row list in one band.
- **No clear main action: pass.** One solid ink button sits in the first viewport on both pages at 1440 ("Let the agent pay this quote" in `p-1440.png`, "Sign the cut" in `p-dc-full-1440.png`). Phones get a fixed bar with the same label on both routes. Touch targets meet 44px (`toggle.tsx:15`, `button.tsx:18`), and the fixed bar uses size lg at 56px (`button.tsx:19`). Quote-cap pressed state: the 402 price turns red and a "Refused before signing" box appears (`p-qc-pressed-1440.png`). Delivery-cut signed state was not captured.
- **Gray text under 12px: pass.** The owner's count is 0 on both pages at both widths (not re-run). Static check this round: no `text-xs` or arbitrary text sizes in `quotecap.tsx` or `deliverycut.tsx`. 12px (`text-caption`) appears only on the two hash lines (`quotecap.tsx:155`, `deliverycut.tsx:119`). Gray body text is ink-muted `#55554f` on canvas `#f7f7f5`, about 7:1 computed from hex.
- **Walls of monospace: pass.** Mono is limited to hash lines and to the inline script paths and command in "Check it in two minutes" (`quotecap.tsx:249`). No mono paragraph appears in any capture.
- **Unfinished left panel: pass for both fork sections.** Quote-cap's "The same API" right column ends about 130px above its left column (`p-qc-full-1440.png`). Delivery-cut leaves about 140px empty beside its lead, next to the taller card. Low.

## Per-page findings

### quote-cap (#/quote-cap)

- Hierarchy holds. The 402 price is the largest figure in the card (`quotecap.tsx:51`), so the bad number leads.
- Figures check. Daily limit before $0.20 minus $0.07 and $0.039 is $0.091, which matches the row. Savings 73%, 75% and 84% match the listed prices ($0.008 vs $0.03, $0.005 vs $0.02, $0.002 vs $0.0126).
- Length is the main problem (see density above).
- Fork block here reads "Forked at block 43,440,365". Delivery-cut reads 43,488,714. Each names its own run, but neither says they are separate runs. Low.
- "Prices from the mpp.dev catalog on 10 Oct 2026." (`quotecap.tsx:175`) gives a date but no link to the catalog. Low, evidence.
- The "The same …" heading pattern appears twice ("The same quotes, run on a fork…", "The same API, from the cheapest seller"). Low, slop watch.
- Mobile: the fixed bar sits on the bottom edge of the "Most this agent will pay" row (`p-390.png`). Low.

### delivery-cut (#/delivery-cut)

- The verdict is amber with warning text for "Paid, not delivered: $0.003". This matches the color rule.
- Signed state is green (`deliverycut.tsx:81-82`). Cutting a vendor is neither an allow nor a refusal, and `index.css:6-7` reserves green for an allow. Judged from source, not captured. Low to Medium.
- Mobile first screen: the failed row is clear. The bar covers the first lines of the mechanism sentence (`deliverycut.tsx:78`). Medium.
- Layout is compact, and the fork section balances (`p-dc-full-1440.png`).
- Payout-address evidence: open (r7 finding 5).

## Consistency across the two pages

Pass, with three breaks. Both pages share one frame: a 5fr/6fr hero split at `lg`, a 5fr/7fr fork split, the same H1 scale, the same card and verdict pattern, the same Settled and Refused labels, and one solid CTA. Breaks: quote-cap's fixed bar stays after pressing (`quotecap.tsx:104-106`), while delivery-cut's bar hides after signing (`deliverycut.tsx:96`). The two fork blocks differ (above). Quote-cap has two extra blocks delivery-cut lacks, which is acceptable.

## AI-slop absence

Pass. No gradient text, pill tags, ghost numbers, emoji, or rounded corners (radius 0 at `index.css:76`). No em dashes in either page source (grep, 0 matches). Copy is specific: block numbers, hashes, dated catalog prices, a linked issue. Watch: the "The same …" heading pattern on quote-cap, and "fork" in the H2s on both pages.

## Owner caveats kept (not counted as defects)

- "(planned, no revenue yet)" on quote-cap's business model.
- "These hashes exist only on a local anvil fork of Tempo mainnet" (`quotecap.tsx:247`).
- "A local anvil fork at block …" on both pages.
- "mechanism not public" for Setra402 (`quotecap.tsx:236`).
- "The fork run only charged fal and stablestudio; it did not test the other gateways." (`deliverycut.tsx:109`).

## Findings, ranked

1. **High, evidence.** The payout-address figure has no block number and no link (`deliverycut.tsx:109`). The standing evidence rule requires the call and the block the figure was read at. Fix: name the block the probe ran at and point to the probe file, on the page or in the ledger with a pointer.
2. **Medium, density.** Quote-cap runs 3,573px at 1440 and 6,480px at 390. Fix: move "Check it in two minutes" above "How Leash differs", so the judge's action comes before the comparison. Cut "The same API" to its three rows and drop the stats table on phones.
3. **Medium, mobile.** The delivery-cut fixed bar covers the first lines of the mechanism sentence on the first phone screen (`deliverycut.tsx:78`, bar `:96`). Fix: on phones, move that sentence into the lead above the card, then confirm the failed row still clears the bar at 390x844.
4. **Low to Medium, color.** The signed cut turns green (`deliverycut.tsx:81-82`), outside the "green only for an allow" rule. Fix: keep the signed state in ink, with the verdict text, not green.
5. **Low, consistency and evidence.** The two pages name different fork blocks (43,440,365 and 43,488,714) without saying they are separate runs. The mpp.dev price line has a date but no link (`quotecap.tsx:175`). Fix: one clause per page naming its run, and a link to the catalog.

## Blind spots

- No browser this round. Hover and chip focus are unverified. Pressed quote-cap states come from `p-qc-pressed-*.png` only. The delivery-cut signed state was not captured and is judged from source.
- The sub-12px count and the 390 scrollWidth are the owner's capture-script figures, not re-run. The static check covers source classes only, not computed sizes.
- Mobile bar positions come from 390px captures and assume an 844px viewport. They are not measured in the DOM, and real phones with browser chrome will differ.
- Full-page captures draw the fixed bar at its viewport position mid-page (`p-qc-full-390.png`, `p-qc-pressed-390.png`, `p-dc-full-390.png`). That is a capture artifact and is not graded.
- Contrast figures are computed from hex, not sampled from pixels.
- Widths 672 to 1055 are untested.
- The fork blocks and the probe figure were not re-checked against the proof file or the probe JSON this round. The "nine other gateways" count is carried from r7 and is unverified.
- `run-r8.log` holds only a model-catalog warning. It is not evidence for any axis.
- The "API unreachable" strip is not graded. `UtilityBar` is not rendered on these routes (`App.tsx:51`), so it does not appear in any capture.

## Critic scores (0-10)

hierarchy: 8.5
primary action: 8.5
typography: 8.5
density/whitespace: 7.5
color: 8.0
consistency across the two pages: 8.5
AI-slop absence: 8.5
mobile: 8.0
average: 8.3
min: 7.5
