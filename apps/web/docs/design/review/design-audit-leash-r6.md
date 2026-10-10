# Design audit: Leash #/quote-cap and #/delivery-cut (round 6)

Mode: audit only, report only. Commit 0c60b80. Read this round: `shots-r6/p-1440.png` and `shots-r6/p-390.png` (re-read as requested), the full-page captures `p-qc-full-1440.png`, `p-qc-full-390.png`, `p-dc-full-1440.png` and `p-dc-full-390.png`, and the pressed captures `p-qc-pressed-1440.png` and `p-qc-pressed-390.png`. Source read-only: `src/pages/quotecap.tsx`, `src/pages/deliverycut.tsx`, `src/index.css`, `src/App.tsx`, `src/components/shadcn/{button,toggle,toggle-group}.tsx`, and `public/delivery-cut-proof.json`. No browser was started, no script was run, no source was edited, nothing was committed or deployed. The only file written is this report.

Skipped under report-only mode: the gstack preamble and telemetry, the design-detector probe, DESIGN setup, and outside voices (Codex and subagent critics). The sub-12px count and the 390 scrollWidth were not re-run. Mobile CTA positions are estimated from the captures (see Blind spots).

Design Score: B+
AI Slop Score: A-

Design Score is the average of the eight axes below: 8.25, shown as 8.3. Bands as in r5: A- at 8.5 and up, B+ at 8.0 to 8.4. The grade holds at B+, up from r5's 8.2. Desktop is close to A-. Mobile is the drag: the fixes moved the quote check onto the first phone screen, but neither page shows its action there.

## Summary

Desktop is clean. At 1440 both pages put one decision top right, one solid ink action, and selected chips that no longer compete with it. Phones improved: on quote-cap the quote check starts about 480px down instead of about 1,600px, and on delivery-cut the decision follows the headline. Neither page shows its button on the first 844px phone screen. The delivery-cut claim that one cut stops three vendors has no capture behind it in the run file.

## Round 5 findings, checked against r6

1. **High, mobile decision below the fold: partly fixed.** Quote-cap: the card now directly follows the header block in DOM order (`quotecap.tsx:204-206`). The quote toggles and the 402 amount show on the first screen (`p-390.png`). The action is still about 1,130 to 1,180px down. Delivery-cut: the card follows the header (`deliverycut.tsx:65`), the red "Paid, not delivered" line shows on the first screen, and "Sign the cut" starts at about 922px (`p-dc-full-390.png`), just past the 844px fold.
2. **Medium, quote-cap lower left column empty at 1440: partly fixed.** The fork limits are now two rows (`quotecap.tsx:135-138`) and the route savings are two rows (`:169-172`). The route side is balanced. The fork side is still about 210px shorter than its seven-row list (`p-qc-full-1440.png`: copy ends at y 1,364, list ends at y 1,573).
3. **Low, "only" in fork copy: fixed.** Both pages read "Hashes resolve on that fork." (`quotecap.tsx:133`, `deliverycut.tsx:102`). A grep of both files finds no "only" in either sentence.
4. **Low, selected chips compete with the CTA: fixed.** Selected toggles are `surface-1` with an inset ink ring (`toggle.tsx:8`). The solid ink fill belongs to the CTA alone (`button.tsx:12`). In `p-1440.png`, "No prompt", "Exact" and "$1.00" are light with a ring, and the CTA is the only black block above the fold.
5. **Low, policy toggles at size sm: fixed.** A grep finds no `size="sm"` in either page. The policy groups render at the default 44px (`toggle.tsx:15`), and `p-1440.png` shows them 44px tall.
- Also open in r5: the delivery-cut H1 had no mobile size. Fixed. `deliverycut.tsx:59` uses `text-display-sm sm:text-display-md`, and the 390 H1 renders at 34px (`p-dc-full-390.png`).
- Residual red semantics: still open (finding 5).
- r4 hover note: partly verified. The CTA hover tone (`bg-primary-hover`, `button.tsx:12`) shows in the pressed captures. Chip hover is not verified.

## Owner complaints, checked

- **Too dense: partial.** Each 1440 screen reads clean. The page got taller: quote-cap is 2,207px tall at 1440, up from 2,064px in r5. Section gaps are still 128px (`lg:space-y-32`). On a 390 phone, the H1 and two paragraphs come before the card, about 400px of prose above the decision.
- **No clear main action: pass on desktop, fail on the 390 first screen.** One solid ink full-width `lg` button per page (`quotecap.tsx:102`, `deliverycut.tsx:91`). After signing, the cut button becomes an outline "Cut signed" (`deliverycut.tsx:91`). No CTA is on the first phone screen on either route.
- **Gray text under 12px: pass by source.** The smallest token is caption at 12px (`index.css:65`), used only for hashes. Muted body `#55554f` on canvas is about 7.0:1 and subtle `#6b6b65` about 5.0:1, computed from hex. The owner's capture count was not re-run.
- **Walls of monospace: pass.** Mono appears only on `.hash` elements: fork and route hashes and the payout address (`quotecap.tsx:148`, `deliverycut.tsx:87`, `:103`, `:113`).
- **Unfinished left panel: partial.** The top of quote-cap passes. The fork section is still about 210px short at 1440 (finding 4). Delivery-cut has a hole in its left column (finding 2).

## Findings, ranked

1. **High, mobile: no action on the first phone screen on either page.** Quote-cap's "Let the agent pay this quote" starts about 1,130px down (estimated from `p-qc-full-390.png` scaled 1.92x). Delivery-cut's "Sign the cut" starts about 922px down (`p-dc-full-390.png`). The first screen shows the decision readout and no control. Fix: below `md`, make the primary button sticky at the bottom of the viewport on both routes. On quote-cap the policy panel alone is about 500px, so moving the button higher is not enough. On delivery-cut, moving the lead paragraph (`deliverycut.tsx:60-63`) below the card would bring the button to about 760px, under the fold.

2. **Medium, 1440: delivery-cut's left column has a hole.** The lead ends at about y 460 and "Leash spots the paid-but-failed call" starts at about y 588, a gap of about 120px (`p-dc-full-1440.png`). The cause: the card at `deliverycut.tsx:65` uses `lg:row-span-2`, and the paragraph at `:96` lands in row 2, so row 1 stretches to share the card's height. Fix: move the paragraph at `:96` into the header block after the lead, and drop `lg:row-span-2` from the card. The left column then reads as one stack, and the card alone sets the row height. Quote-cap does not have this problem because its second left block (the locks) fits inside the card's span.

3. **Medium, claim: the payout-address sentence has no capture behind it in the run file.** `deliverycut.tsx:103` prints as fact that the address "is also the payout address in the 402s of openai and firecrawl on mpp.tempo.xyz, so this one cut stops all three." The run file records two decisions, fal (`delivery-cut-proof.json:30`) and stablestudio (`:22`). The only mention of openai and firecrawl is the `caveat` string (`:19`), which names them with no 402 response, call or block for either. Under the evidence rule, the figure needs the call that produced it and the block it was read at. Fix: capture the openai and firecrawl 402s at a stated block and attach them to the proof, or cut the clause to what the run shows.

4. **Medium, 1440: quote-cap's fork section still leaves its left column short.** The left copy and limit rows end at about y 1,364, while the seven-row list ends at about y 1,573 (`p-qc-full-1440.png`). The r5 blank was about 350px and is now about 210px. Fix: at `lg`, stack the fork heading, paragraph and limit rows full width, then the seven rows full width below them.

5. **Low-medium, color: red and green are used beyond the stated rule.** `index.css:6-7` says "Red only for a refusal, green only for an allow." Delivery-cut uses red for a vendor failure: "HTTP 422, no image" (`deliverycut.tsx:73`, tone bad), "Paid, not delivered" (`:86`), and the "Reverted" labels (`:115`). The signed state uses green for a completed cut (`:80-81`), which is neither an allow nor a refusal. Either widen the rule comment to cover a stop and a completed cut, or keep failures in ink and reserve red for Leash refusals. This is the r5 residual, still open.

Also open, not in the top five:
- Copy: "A local anvil fork at block ..." (`quotecap.tsx:133`, `deliverycut.tsx:102`) volunteers that the run is local. The H2 above it already names the fork. Dropping "local" removes a gap statement.
- Density: quote-cap is 143px taller than in r5. Section gaps are unchanged.
- Shared header: eight nav items at 1440 (`App.tsx:58`), plus "Create a team". Shared chrome, not scored here.

## Consistency across the two pages

Pass. Both pages share one frame: header and card in a 5fr/6fr or 5fr/7fr split at `lg`, the same H1 size at each breakpoint, the same card with ink border and canvas policy or result panel, the same verdict block with a 4px left rule, the same Settled and Refused labels, and the same single solid CTA. The transaction sections mirror each other. The only breaks in rhythm are the hole in finding 2 and the fork blank in finding 4.

## AI-slop absence

Pass. No gradient text, pill tags, ghost numbers, emoji, or rounded corners. The copy is specific: block numbers, hashes, a linked issue, dated catalog prices. One pattern to watch: quote-cap uses the "The same ..." H2 formula twice on one page.

## Blind spots

- No browser this round, so hover and focus were not rendered. The CTA hover tone is visible in the pressed captures. Chip hover and focus rings are unverified.
- Mobile CTA positions are estimated, not measured in the DOM. Quote-cap is scaled from its full-page capture (1.92x), roughly plus or minus 30px. Delivery-cut is read from the native 390px capture.
- Not in the captures: the signed delivery-cut state, the "With prompt" refusal, and the "Listed" paid state. These are judged from source (`quotecap.tsx:104-115`, `deliverycut.tsx:79-83`).
- Widths 672 to 1055 are untested. The nav switches to the menu at 1056 (`App.tsx:58`).
- The "API unreachable" strip is not in any r6 capture, and `App.tsx:51` excludes `UtilityBar` on both routes, so it cannot render here from this source. Per your note it is a preview CORS artifact, so it is not graded. If it shows on your preview, the served build is not the 0c60b80 source.
- The "stops all three" claim (finding 3) was checked against the run file only. Nothing was read from the chain or from openai or firecrawl.
- Source was read from the working tree, which matched HEAD at session start per `gitStatus`. The served bundle was not diffed against it.
- Contrast figures are computed from hex, not sampled from rendered pixels.
- The sub-12px count and the 390 scrollWidth are the owner's capture-script figures and were not re-run.

## Critic scores (0-10)

hierarchy: 8.5
primary action: 8.5
typography: 8.5
density/whitespace: 8.0
color: 8.0
consistency across the two pages: 9.0
AI-slop absence: 8.5
mobile: 7.0
average: 8.3
min: 7.0
