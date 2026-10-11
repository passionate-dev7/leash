# Design audit: Leash #/quote-cap and #/delivery-cut (round 9)

Mode: audit only, report only. Captures from `shots-r9/` viewed this round: `p-1440.png` and `p-390.png` (re-read), `p-dc-390.png`, `p-dc-390-scrolled.png`, `p-qc-full-1440.png`, `p-qc-pressed-1440.png`, `p-dc-full-1440.png`, `p-qc-full-390.png`, `p-qc-pressed-390.png`, `p-dc-full-390.png`. Read-only source checks: `quotecap.tsx`, `deliverycut.tsx`, `index.css`, `toggle.tsx`, `button.tsx`, existence of `public/fork-proof.json`, `public/delivery-cut-proof.json` and `public/evidence/probe-all402-2026-10-03.json`, and grep checks on the two page files and the probe file. No browser was started, no script was run, no source was edited, nothing was committed or deployed. The only file written is this report.

Design Score: B+
AI Slop Score: A-

Design Score is the average of the eight axes below: 8.4 (raw 8.38). Bands as in earlier rounds: B+ at 8.0 to 8.4. Up from 8.3 in r8. The gains are the ink signed cut, the delivery-cut bar no longer covering the failed call, and labelled fork runs. Density did not move, because quote-cap got slightly longer.

## Summary

Both pages still read as one product at 1440, each with one solid ink action in the first viewport. Three r8 fixes landed (signed cut colour, delivery-cut bar placement, fork-run labels), and the judge block now sits above the rivals on quote-cap. Two things hold the grade. Quote-cap is still long: 3,580px at 1440 and 6,508px at 390. And the block number in delivery-cut's probe paragraph does not appear in the file that paragraph links to, so the link does not yet trace the figure.

## Round 8 findings, checked

| # | r8 finding | r9 status | Evidence |
|---|---|---|---|
| 1 | High, evidence: payout-address figure has no block and no link | Partly fixed. Link added. Block still not traceable. | `deliverycut.tsx:120` links `/evidence/probe-all402-2026-10-03.json`, which exists. The paragraph says "saved at about Tempo mainnet block 42,298,273", but the file has no block field, a case-insensitive grep for "block" returns 0 matches, and 42298273 does not appear. The "about" caveat is kept. The missing source is counted, because the link is meant to carry the figure. |
| 2 | Medium, density: quote-cap length, judge block above rivals, stats table on phones | Partly fixed. Order fixed. Length and phone stats not. | "Check it in 60 seconds: three clicks" is at `quotecap.tsx:244` and renders before Positioning (render order at `quotecap.tsx:281-286`, read earlier this round). Length: 3,580px at 1440 (r8: 3,573), 6,508px at 390 (r8: 6,480). The stats `dl` still shows on phones at `quotecap.tsx:139` and `:176`, with no `md:` hide. |
| 3 | Medium, mobile: delivery-cut bar covers the mechanism sentence | Fixed. | The bar renders only after scroll (`deliverycut.tsx:107`, `!signed && scrolled`). On phones the mechanism sentence sits inside the card (`:89`, `md:hidden`). First phone screen is clear (`p-dc-390.png`). Side effect noted under mobile below. |
| 4 | Low to Medium, colour: signed cut is green | Fixed. | Signed verdict is `border-ink` and `text-ink` (`deliverycut.tsx:93-95`). Not captured. Judged from source. |
| 5 | Low, consistency and evidence: fork blocks not labelled as runs; mpp.dev price line has no link | Partly fixed. Labels fixed. Link open. | "Fork run 1" (`quotecap.tsx:135`) and "Fork run 2" (`deliverycut.tsx:118`). The price line at `quotecap.tsx:175` still reads "Prices from the mpp.dev catalog on 10 Oct 2026." with no link. Open, Low. |

Other items carried from r8:
- Quote-cap phone bar stays after pressing. Open. `quotecap.tsx:104` has no open or closed condition. Delivery-cut's bar hides after signing (`deliverycut.tsx:107`). Consistency break.
- "The same..." heading pattern. Open, slop watch. `quotecap.tsx:135` and `:173`.
- Quote-cap phone bar sits over the "Most this agent will pay" row (`quotecap.tsx:80`, bar at `:104`). Open, Low.

## Owner complaints, checked

- **Too dense: partly.** Delivery-cut is compact. Quote-cap has six bands, 3,580px at 1440 and 6,508px at 390. The Positioning block (`quotecap.tsx:222-240`) carries three rival columns of about 55 to 60 words each at 16px muted text. The phone stats table is still shown.
- **No clear main action: pass.** One solid ink button sits in the first viewport at 1440 on both pages: "Let the agent pay this quote" (`quotecap.tsx:103`, `p-1440.png`) and "Sign the cut" (`deliverycut.tsx:104`, `p-dc-full-1440.png`). Phones get a fixed bar: quote-cap's is always present (`quotecap.tsx:104`), delivery-cut's appears after scroll (`deliverycut.tsx:107`). Pressed quote-cap: the 402 price turns red and "Refused before signing" appears (`quotecap.tsx:116`, `p-qc-pressed-1440.png`, `p-qc-pressed-390.png`). Delivery-cut signed state not captured.
- **Gray text under 12px: pass for source classes.** The owner's capture-script count of 0 was not re-run. This round's grep finds no `text-xs` and no arbitrary pixel sizes in either page. `text-caption` (12px) appears only on hash lines (`quotecap.tsx:155`, `deliverycut.tsx:130`). Muted text is `#55554f` on `#f7f7f5` (`index.css:16`, `:18`), about 7:1 computed from hex.
- **Walls of monospace: pass.** Mono is limited to hash lines and to inline script paths and the test command in the judge steps. No mono paragraph appears in any capture.
- **Unfinished left panel: pass for both fork sections.** At 1440, quote-cap's fork and "The same API" sections end within about 30px of each other (`p-qc-full-1440.png`). Delivery-cut's fork section balances its lead against the step list (`p-dc-full-1440.png`).

## Per-page findings

### quote-cap (#/quote-cap)

- Hierarchy holds. The 402 price is the largest figure in the card, so the bad number leads.
- Figures are unchanged from r8 and still match: the daily limit remainder of $0.091, and route savings of 73%, 75% and 84% against the listed prices.
- Length is the main problem. The judge block now precedes the rivals, which fixes reading order but not the page height.
- The phone stats table (`quotecap.tsx:139`, `:176`) shows on phones, adding a long table to an already long mobile page.
- Phone: the fixed bar covers the bottom edge of the "Most this agent will pay" row (`quotecap.tsx:80`). Low.
- The mpp.dev price line has a date but no link (`quotecap.tsx:175`). Low, evidence.
- "The same ..." heading pattern appears at `quotecap.tsx:135` and `:173`. Low, slop watch.
- Fork run 1 is labelled as its own run, block 43,440,365.
- Caveats kept: "(planned, no revenue yet)" (`quotecap.tsx:237`), "mechanism not public" (`:236`), and the local anvil fork.

### delivery-cut (#/delivery-cut)

- The verdict is amber for "Paid, not delivered: $0.003" (`deliverycut.tsx:98-100`). This matches the colour rule.
- Signed state is ink (`deliverycut.tsx:93-95`). Fixed from r8. Not captured.
- First phone screen: the failed row and the mechanism sentence are visible, but no sign action is. The card button is hidden on phones (`deliverycut.tsx:104`), and the phone bar appears only after the reader scrolls past the top of the page (`:107`). This keeps the bar off the failed call, which is the r8 fix, but the first phone screen has no action. Low.
- The probe paragraph (`deliverycut.tsx:120`) is about 75 words of 14px muted text, the densest copy on either page. Low. Its block figure is not traceable to the linked file (finding 1).
- Fork run 2 is labelled as its own run (`deliverycut.tsx:118`). Block 43,488,714.
- Layout is compact. The fork section balances (`p-dc-full-1440.png`).

## Consistency across the two pages

Pass, with the same breaks as r8. Both pages share one frame: a 5fr/6fr hero split at `lg`, a fork split, the same H1 scale, the same card and verdict pattern, the same Settled and Refused labels, one solid CTA, and labelled fork runs. Breaks: quote-cap's phone bar has no state and stays after pressing (`quotecap.tsx:104`), while delivery-cut's bar hides after signing (`deliverycut.tsx:107`). The two fork blocks differ on purpose and are now labelled as separate runs.

## AI-slop absence

Pass. No gradient text, pill tags, ghost numbers, emoji, or rounded corners (`index.css:76`, `* { border-radius: 0 }`). No em dashes in either page file (grep this round, 0 matches). Copy is specific: block numbers, hashes, dated catalog prices, a linked issue. Watch: the "The same ..." heading pattern on quote-cap, and "fork" repeated in the H2s on both pages.

## Owner caveats kept (not counted as defects)

- "(planned, no revenue yet)" on quote-cap's business model (`quotecap.tsx:237`).
- "mechanism not public" for Setra402 (`quotecap.tsx:236`).
- "local anvil fork" on both pages.
- "saved at about Tempo mainnet block 42,298,273" (`deliverycut.tsx:120`). The "about" is kept. The untraceable figure is counted under finding 1, because the file it links to contains no block. The owner may disagree with that reading.
- "The fork run only charged fal and stablestudio; it did not test the other gateways." (`deliverycut.tsx:120`).

## Findings, ranked

1. **Medium, evidence.** `deliverycut.tsx:120` links the probe file, but the file has no block field and does not contain 42298273. The block figure on the page has no source in the file it cites. Fix: put the block in the probe file (or the proof file the page already loads) and link to that field.
2. **Medium, density.** Quote-cap is 3,580px at 1440 and 6,508px at 390, and the phone stats table still shows (`quotecap.tsx:176`). Fix: hide the `dl` blocks at `:139` and `:176` below `md`, and cut the Positioning columns (`:222-240`) to about 30 words each.
3. **Medium, consistency.** Quote-cap's phone bar has no state (`quotecap.tsx:104`), so it stays after pressing. Delivery-cut's bar hides after signing (`deliverycut.tsx:107`). Fix: hide quote-cap's bar once the quote has run, as the cut bar does after signing.
4. **Low, mobile.** Quote-cap's phone bar sits over the "Most this agent will pay" row (`quotecap.tsx:80`). Delivery-cut's first phone screen shows no sign action until scroll (`deliverycut.tsx:104`, `:107`). Fix: add bottom padding to quote-cap's phone layout equal to the bar height. Keep the cut bar as a deliberate choice.
5. **Low, evidence and slop.** The mpp.dev price line has no link (`quotecap.tsx:175`). The "The same ..." heading pattern appears at `quotecap.tsx:135` and `:173`. Fix: link the catalog and rename one of the two headings.

## Blind spots

- No browser this round. Hover and chip focus are unverified.
- The delivery-cut signed state was not captured and is judged from source (`deliverycut.tsx:93-95`).
- Mobile bar positions come from the 390px captures and assume an 844px viewport. They are not measured in the DOM.
- Full-page captures draw the fixed bars at their viewport position mid-page (`p-qc-full-390.png`, `p-qc-pressed-390.png`, `p-dc-full-390.png`). That is a capture artifact and is not graded.
- Contrast is computed from hex, not sampled from pixels.
- Widths from 672 to 1055 are untested.
- The owner's sub-12px count and the 390 scrollWidth were not re-run. The static grep covers source classes only, not computed sizes.
- The block 42,298,273 is not in the linked probe file. Its source is unknown. An artefact outside the files checked this round could hold it.
- "Nine other gateways": the recipient address appears 28 times in the probe file, but a distinct service count was not derived from it. The count stays unverified.
- The fork blocks 43,440,365 and 43,488,714 were not re-checked against the proof files this round.
- The "API unreachable" strip is not graded. `UtilityBar` is not rendered on these routes (`App.tsx:51`), so it does not appear in any capture.

## Critic scores (0-10)

hierarchy: 8.5
primary action: 8.5
typography: 8.5
density/whitespace: 7.5
color: 8.5
consistency across the two pages: 8.5
AI-slop absence: 8.5
mobile: 8.0
average: 8.4
min: 7.5
