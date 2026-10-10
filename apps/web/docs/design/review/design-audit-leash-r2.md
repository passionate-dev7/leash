# Design audit: Leash #/quote-cap and #/delivery-cut (round 2)

Mode: audit only. Inputs: the captures in `shots-r2/` (1440 and 390 widths, full page, plus the quote-cap state after pressing the primary button), and read-only reads of `src/pages/quotecap.tsx`, `src/pages/deliverycut.tsx`, `src/index.css`, `src/App.tsx`, and `src/components/shadcn/{toggle-group,button,separator}.tsx`. No browser was driven, no scripts were run, no source was edited.

Design Score: C+
AI Slop Score: A- (A = no slop patterns, F = slop throughout)

Design Score is the average of the axes below (6.8). Two high findings hold it down: the delivery-cut overflow at 390px and the testnet label on mainnet proof pages.

## Findings

Ranked by severity.

1. **High. Delivery Cut overflows the 390px viewport.** `shots-r2/p-dc-full-390.png` is captured about 644px wide at a 390px viewport, with the right side blank. The fal and HTTP 422 cards clip mid-word ("captured unp", "type/lo"), and the JSON body is cut at the right edge. A phone user cannot read or reach the right side of both cards. Source candidates: `deliverycut.tsx:53` (`md:grid-cols-2`) and `:63` (the `pre`). The root cause is not confirmed from source. Confirm with `document.documentElement.scrollWidth` at 390 on the preview. Quote-cap has no overflow at 390 (`p-qc-full-390.png` and `p-qc-pressed-390.png` are both 390 wide).

2. **High. Proof pages show the testnet strip.** Both routes render "Moderato testnet, chain 42431. Agent payments settle in OUSD." `quotecap.tsx:70` says "Tempo mainnet", the quote uses USDC.e, and the delivery proof is chain 4217. `App.tsx:25` reads the global network, and only `#mainnet` is wrapped in `NetworkProvider` (`App.tsx:116-120`), so these routes fall back to the testnet context. A judge sees mainnet claims under a testnet label.

3. **High. Delivery Cut's one action states no outcome.** Nothing before "Sign the cut" says what it removes, which is fal's recipient from the agent key. After signing, the decision line still reads "Paid, not delivered: $0.003 lost to 0xca4e83…4779Fe", because `deliverycut.tsx:71` branches only on `decision.cut` and ignores `signed`. The button becomes a disabled "Cut signed", and the only feedback is a new row in the list below. Add a consequence line before the button and a signed branch for the decision line, e.g. "Cut. fal's next charge is refused on chain."

4. **Medium. Gap sentences on a public surface.** The public-surface rule forbids volunteering gaps. Offenders:
   - `quotecap.tsx:164`: "Outputs were not compared with paid calls."
   - The Delivery Cut label and caveat, rendered at `deliverycut.tsx:95-96`: "LOCAL FORK ONLY - not mainnet, no real funds, tx hashes exist only on this fork." and the caveat paragraph.
   - `deliverycut.tsx:64` (`failure.note`): "...the msg wording is the standard FastAPI/pydantic text and is illustrative. LEASH did not pay fal on mainnet to re-observe it."
   The strings come from `public/delivery-cut-proof.json`. Reframe in present-tense product voice and keep the facts, e.g. "Replayed on a local fork of Tempo mainnet. Hashes exist on that fork." and "Status and error type from vet402's report. Message text is the standard FastAPI wording." Move the gap detail to `.progress/LEDGER.md`. Run `backstage gate --fail-on HIGH` before any commit touching these files.

5. **Medium. Red and monospace are over-applied.**
   - `index.css:6-7` says red only for a refusal. `App.tsx:31` renders "API unreachable" in red on static proof pages that do not call the API. The red is expected on this preview origin because it is outside the CORS allowlist, but the strip should not appear on routes that never use the API.
   - The capture script reported monospace only on dollar amounts, percentages, and shortened hashes. The screenshots and source disagree: the endpoint path and "HTTP 422" (`deliverycut.tsx:56`, `:62`), the JSON body (`:63`), block numbers, and the word "less" in "73% less" (`quotecap.tsx:176` puts `num` on the whole string). Set the word and the non-value text in sans.

6. **Medium. The two pages drift apart.**
   - H1 is 44px on quote-cap (`quotecap.tsx:190`, `text-display-md`) and 28px on delivery-cut (`deliverycut.tsx:47`, `text-headline`).
   - Content width is 1120px on quote-cap (`:187`) and 880px on delivery-cut (`:45`).
   - Status words are "Settled"/"Refused" (`quotecap.tsx:147`) against raw lowercase "success" (`deliverycut.tsx:85`).
   - Section labels are body-size `h2` on delivery-cut and semibold body on quote-cap.
   Pick one display H1, one content width, and one status vocabulary.

7. **Low. Engineering names in result copy.** `quotecap.tsx:113`: "Leash threw QuoteCapExceeded inside the payment hook." Judge-facing version: "Leash stopped the payment before signing. The quote asked for $10.00 against a $0.039 listing." Keep the class name out of the UI.

8. **Low. Left column goes empty.** On quote-cap at 1440 the hero copy ends near y=570 while the card runs to about y=900. Under "Two locks, in order" and the fork heading, the left column is empty. This is editorial spacing, not broken, but the first fold is lopsided.

9. **Low. Spaced hyphen reads as a dash.** "LOCAL FORK ONLY - not mainnet" uses " - ". It is not an em dash, but it reads like one. Resolved by the reframe in finding 4.

## What holds

- Quote-cap hierarchy: one H1, one card, one full-width black action, and the refusal state in red with a left rule. The primary action is unambiguous.
- Tokens: radius 0 everywhere, ink on off-white, no gradients, pills, ghost numerals, emoji, or "No data" empty states. Ink-muted on canvas is about 7:1 by token value (not measured).
- No text under 12px on either page at either width, per the capture script (not re-run).
- Quote-cap stacks cleanly at 390, and the toggle groups fit.

## Owner complaints, checked

- Too dense: pass. Quote-cap spacing is generous and delivery-cut is calm.
- No clear main action: quote-cap passes. Delivery-cut partially fails (finding 3).
- Gray text under 12px: pass per capture.
- Walls of monospace: partial. Mono is now limited to short values, but finding 5 widens it again.
- Unfinished left panel: quote-cap's left panel is complete. Finding 8 is a balance note only.

## Blind spots

- No live check. The captures are from the preview at an earlier time and are not confirmed to match HEAD `0c132c3`.
- Only 1440 and 390 were captured. The 768-1055 range, where eight nav items sit in the `md` breakpoint, is untested.
- The pressed state was captured only for the refusal branch (No prompt, default policy). The Paid branch (Listed, Exact), "With prompt", and the delivery-cut post-sign state were not captured.
- The sticky header overlapping content in `p-qc-pressed-390.png` is a full-page capture artifact and is not counted.
- No hover, focus, or keyboard pass. Contrast figures come from token values, not measurement.

## Critic scores (0-10)

hierarchy: 7.5
primary action: 7
typography: 6.5
density/whitespace: 7.5
color: 7
consistency across the two pages: 5.5
AI-slop absence: 8
mobile: 5
average: 6.8
min: 5.0
