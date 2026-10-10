# Design audit: Leash #/quote-cap and #/delivery-cut (round 4)

Mode: audit only. Inputs: the Playwright captures in `shots-r4/` (viewport shots `p-1440.png` and `p-390.png`, full pages at 1440 and 390, and the quote-cap pressed state at both widths), plus read-only reads of `src/pages/quotecap.tsx`, `src/pages/deliverycut.tsx`, `src/App.tsx`, `src/index.css`, and `src/components/shadcn/{button,toggle,toggle-group,separator}.tsx`. Source at HEAD `7640692` (r4). No browser was driven, no scripts were run, no source was edited.

Design Score: B+
AI Slop Score: A- (A = no slop patterns, F = slop throughout)

Design Score is the average of the axes below (8.2). Grade bands used here: A- at 8.5 and up, B+ at 8.0 to 8.4, B at 7.5 to 7.9. Round 3 gave 7.8 a B-, so part of the move to B+ is the band, not only the fixes.

The round 3 high finding is fixed. The hero now promises what the policy control allows. Five of six round 3 findings are fixed in source. The one open item is the empty quote-cap left column at 1440. The 1440 captures predate the r4 build, so desktop copy was judged from source and the 390 captures (see provenance).

## Round 3 findings, checked against r4

1. **High, hero promise vs policy control: fixed.** `quotecap.tsx:190` now reads "Your agent pays only the price you allow." The control at `:89` still offers +50%, 2x and 4x, so copy and control agree. The 390 capture shows the new H1. The 1440 captures still show the old H1 (finding 1 below).
2. **Medium, proof copy volunteers a limitation: partly fixed.** "no real money moved" is gone. `deliverycut.tsx:76` now uses the suggested "Status and error from vet402's report." Still open: "Hashes resolve only on that fork" at `quotecap.tsx:133` and `deliverycut.tsx:102`, and the refund sentence at `quotecap.tsx:113` and `:204`.
3. **Low, engineering name in refusal copy: fixed in source.** `quotecap.tsx:113` now reads "Leash stopped it before the agent key signed." The 390 pressed capture shows it. The 1440 pressed capture still shows "QuoteCapExceeded" (stale build).
4. **Low, testnet footer on mainnet proof routes: fixed.** `App.tsx:51` and `App.tsx:122` hide the utility bar and footer on both proof routes.
5. **Low, address in body type: fixed.** `deliverycut.tsx:103` wraps the address in `.hash`. `:88` also uses `.hash`.
6. **Low, quote-cap left column empty at 1440: open.** The header at `quotecap.tsx:188-195` is shorter than the policy card at `:196`, and nothing fills the left column beneath it at 1440. Delivery-cut is balanced.
- R2-7 (engineering name in result copy): fixed, same change as item 3.
- R2-8 (empty left column at 1440): open, same as item 6.
- R2-1 to R2-6 and R2-9 from round 2 were fixed in r3. Not re-measured this round: `scrollWidth` was not captured at 390.

## Findings

1. **Medium, evidence: the 1440 captures predate the r4 build.** `p-1440.png`, `p-qc-full-1440.png` and `p-qc-pressed-1440.png` show the r3 H1, the refusal copy with "QuoteCapExceeded", and no "Two locks" intro. `p-dc-full-1440.png` shows older delivery-cut copy. The 390 captures show r4 copy. All eight files carry the same mtime (19:18), one minute after commit `7640692` at 19:17:51, so the file times do not say which set came from which build. Fix: recapture at 1440, assert the served H1 text before each capture, and add that assertion to the capture script so a stale build fails it. Until then, desktop copy is graded from source.

2. **Medium, layout: quote-cap left column is empty at 1440.** The header (`quotecap.tsx:188-195`) ends well above the policy card (`:196`), and the space beside the card is blank. This is the owner's "unfinished left panel" complaint, still true on this page. Fix: add a short fact list under the header (listed price, the 402 amount, the ceiling as three rows), or stack the policy card under the copy at lg.

3. **Low, copy: scope and refund phrasing.** "Hashes resolve only on that fork" (`quotecap.tsx:133`, `deliverycut.tsx:102`) still volunteers a scope gap. "Nothing is signed, so nothing needs a refund" repeats the refusal line at `quotecap.tsx:113`. Fix: drop "only" in both proof lines, and delete the sentence at `quotecap.tsx:204`.

4. **Low, copy: instruction sentences in idle states.** `quotecap.tsx:117` ("Pick a quote, set the policy, then press the button to see what the agent does.") and `deliverycut.tsx:120` ("Sign the cut to play the rest of the run.") tell the reader what to do rather than state what the page shows. Fix: state the result or remove the line.

5. **Low, color rule: red before any verdict.** `quotecap.tsx:77` paints the 402 amount red before the button is pressed, while "Refused before signing" appears only after the press. `deliverycut.tsx:87` does the same with "Paid, not delivered." The token comment in `index.css:6-7` says red is for a refusal. Idle red reads as a verdict the page has not reached. Fix: keep the amount in ink until the press, or show the verdict line in the idle state too.

**Observation, not scored.** The "API unreachable" strip the owner sees is not in source for these routes: `App.tsx:51` does not render `UtilityBar` on quote-cap or delivery-cut, and no capture shows it. If the strip appears on these URLs, the served build is not `7640692`. This ties to finding 1 and is the first thing to confirm on the next recapture.

## Owner complaints, checked

- **Too dense: pass with a note.** Delivery-cut is compact. Quote-cap stacks the check card, then three sections (Two locks, the fork run, the route list), so the page is long.
- **No clear main action: pass.** One full-width black button per page: `quotecap.tsx:102`, `deliverycut.tsx:92`.
- **Gray text under 12px: pass by static read.** The smallest text token is caption at 12px (`index.css:62`). No `text-[...px]` in the two pages or the shadcn files. No computed-size measurement exists: `docs/design/review/run-r4.log` is a model-catalog warning, not a measurement.
- **Walls of monospace: pass.** `.hash` only on transaction hashes and payout addresses (`quotecap.tsx:144`, `deliverycut.tsx:88`, `:103`, `:113`).
- **Unfinished left panel: fail on quote-cap (finding 2), pass on delivery-cut.**

## Quick wins

- Drop "only" at `quotecap.tsx:133` and `deliverycut.tsx:102`.
- Delete `quotecap.tsx:204`.
- Keep the 402 amount in ink until the press (`quotecap.tsx:77`).
- The two policy toggle groups use `size="sm"` (`quotecap.tsx:89`, `:95`), which is `min-h-9` (36px, `toggle.tsx:15`). That passes the WCAG 2.2 24px minimum but is smaller than the 44px default used for the quote toggles and buttons. Use the default size on these groups.

## Blind spots

- No browser or live check this round. Everything comes from eight captures and source, and the captures' build is unconfirmed (finding 1).
- Desktop copy is judged from source because the 1440 set predates r4.
- `scrollWidth` at 390 was not captured, so overflow is judged from screenshots only.
- Widths 672 to 1055 are untested. The nav switches to the menu below 1056px (`App.tsx:58`, `:93`).
- Not captured: the Paid branch (Listed, Exact), the "With prompt" refusal, and the delivery-cut signed state. The signed branch is read from `deliverycut.tsx:80-84`.
- Hover and focus were not checked. A selected toggle is `data-[state=on]:bg-ink` (`toggle.tsx:8`), and the base variant has `hover:bg-surface-1` (`:12`). Which one wins on hover depends on Tailwind's generated order. If hover wins, the selected option turns light with light text. Unverified until rendered.
- Contrast is estimated by hand from token hex, not measured: ink-muted on canvas about 7.0:1, ink-subtle about 5.0:1, error-ink about 6.1:1, success-ink about 5.3:1.
- The "API unreachable" strip was not reproduced (see observation).

## Critic scores (0-10)

hierarchy: 8.5
primary action: 8.5
typography: 8
density/whitespace: 7.5
color: 8
consistency across the two pages: 8.5
AI-slop absence: 8.5
mobile: 8
average: 8.2
min: 7.5
