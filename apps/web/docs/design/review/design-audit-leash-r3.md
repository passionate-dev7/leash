# Design audit: Leash #/quote-cap and #/delivery-cut (round 3)

Mode: audit only. Inputs: the captures in `shots-r3/` (1440 and 390 widths, full page, plus the quote-cap refusal state after pressing the primary button), and read-only reads of `src/pages/quotecap.tsx`, `src/pages/deliverycut.tsx`, `src/index.css`, `src/App.tsx`, and `public/delivery-cut-proof.json`. No browser was driven, no scripts were run, no source was edited.

Design Score: B-
AI Slop Score: A- (A = no slop patterns, F = slop throughout)

Design Score is the average of the axes below (7.8). One High finding holds it down: the hero promises something the page's own policy control can break.

## Round 2 status

- R2-1 Delivery Cut overflow at 390: fixed. `p-dc-full-390.png` shows both cards inside the viewport. The `md:grid-cols-2` and the JSON `pre` are gone from `deliverycut.tsx`. `scrollWidth` was not measured.
- R2-2 Testnet strip on proof pages: fixed. `App.tsx:51` hides the utility bar on both routes. The footer still names Moderato (finding 4).
- R2-3 Delivery Cut action states no outcome: fixed. Consequence line at `deliverycut.tsx:88`, signed branch at `:80-84`.
- R2-4 Gap sentences: fixed for the quote-cap line and the fork label. The JSON `label` and `note` are no longer rendered. Partly open (finding 2).
- R2-5 Mono over-applied: fixed. `.hash` now sits only on transaction hashes and the payout address. One address still renders in sans (finding 5).
- R2-6 Drift between the pages: fixed. Both H1s are `text-display-md`, both containers are `max-w-[1120px]`, both section headings are `text-headline`.
- R2-7 Engineering name in result copy: open (finding 3).
- R2-8 Empty left column at 1440: open on quote-cap (finding 6).
- R2-9 Spaced hyphen reads as a dash: fixed on rendered pages.

## Findings

Ranked by severity.

1. **High. The hero promise is contradicted by the policy control.** `quotecap.tsx:190` says "Your agent never pays more than the listed price." The same card's "Allowed above the listing" control (`:89`) offers +50%, 2x and 4x. At 2x with "With prompt" selected, the ceiling is $0.078, so the $0.07 quote passes and the agent pays above the listing. The control exists to allow that, so the headline has to match it. Suggested: "Your agent pays only the price you allow." The 2x result comes from the ceiling arithmetic, not a browser run.

2. **Medium. Proof copy volunteers a limitation.** `deliverycut.tsx:102` and `quotecap.tsx:133` end with "These hashes exist only on that fork, and no real money moved." "A local anvil fork at block N" already carries the scoping, so "no real money moved" can go. `deliverycut.tsx:76` says "the 422 is replayed from vet402's report", which narrates provenance. Suggested: "Replayed on a local anvil fork of Tempo mainnet at block N. Hashes resolve on that fork." and "Status and error from vet402's report." Gap detail goes to `.progress/LEDGER.md`.

3. **Low. Engineering name in refusal copy.** `quotecap.tsx:113` reads "Leash threw QuoteCapExceeded inside the payment hook." It is visible in `p-qc-pressed-1440.png` and `p-qc-pressed-390.png`. Suggested: "Leash stopped the payment before signing. The quote asked for $10.00 against a $0.039 listing."

4. **Low. Footer names the testnet beside mainnet proofs.** `App.tsx:124` renders on every route, including both proof routes, and says the server holds agent keys "for agents Leash runs on Moderato testnet." Accurate, but under a mainnet proof it reads as the page's network. Either give the two proof routes their own footer line or move the testnet sentence to the Live and Mainnet pages.

5. **Low. Address renders in body type.** `deliverycut.tsx:103` shows `0xca4e...79Fe` in `text-body-sm` sans, because `{proof.caveat}` is one string. `deliverycut.tsx:88` puts the same kind of value in `hash`. Splitting the caveat so the address takes `hash` fixes it. Otherwise it is not a visible defect at 1440.

6. **Low. Quote-cap left column stays empty at 1440.** The hero copy ends near y=540 while the card runs to about y=900, close to round 2. Under "Two locks, in order" the left column is blank. Delivery-cut is balanced. Balance note only.

## What holds

- Quote-cap refusal state: the red 402 figure, the red left rule and "Refused before signing" read at a glance. The primary action is one full-width black button.
- Delivery Cut: the consequence sits above the button, and the decision line changes on sign (`deliverycut.tsx:80-84`).
- Mono is limited to hashes and the payout address. "Refused" (refused before signing) and "Reverted" (on chain) differ only where the meaning differs.
- Tokens: radius 0, ink on canvas, no gradients, pills, ghost numerals or "No data" empty states.
- Quote-cap stacks at 390, the toggle groups fit, and `p-qc-pressed-390.png` is 390 wide. The sticky header mid-page in that capture is a full-page capture artifact and is not counted.

## Owner complaints, checked

- Too dense: pass.
- No clear main action: pass on both pages.
- Walls of monospace: pass. Mono is limited to hashes.
- Unfinished left panel: partial. Finding 6 is a balance note only.

## Blind spots

- No live check. The captures are timestamped 19:07 and are not confirmed to match HEAD `e8ffb8a`.
- No `scrollWidth` measurement at 390. The overflow fix is judged from the screenshot only.
- Not captured: the Paid branch (Listed, Exact), the "With prompt" refusal, and the delivery-cut signed state. The signed state is read from source. The 2x ceiling in finding 1 rests on arithmetic.
- `p-1440.png` and `p-390.png` were not re-read in this pass. Findings come from the other six captures and the source.
- Widths 768 to 1055 are untested. Eight nav items sit at the `md` breakpoint.
- No hover, focus or keyboard pass. Contrast figures come from token values, not measurement.

## Critic scores (0-10)

hierarchy: 8
primary action: 8
typography: 7.5
density/whitespace: 7.5
color: 7.5
consistency across the two pages: 8
AI-slop absence: 8
mobile: 8
average: 7.8
min: 7.5
