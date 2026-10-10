# Design audit: Leash #/quote-cap and #/delivery-cut (round 5)

Mode: audit only. Inputs: the r5 Playwright captures in `shots-r5/` (viewports `p-1440.png` and `p-390.png`, full pages `p-qc-full-*`, `p-qc-pressed-*` and `p-dc-full-*`), each opened and read, plus read-only reads of `src/pages/quotecap.tsx`, `src/pages/deliverycut.tsx`, `src/index.css`, `src/App.tsx`, and `src/components/shadcn/{button,toggle,toggle-group}.tsx`. Source is the r5 commit `e0df52f`. No browser was started, no script was run, no source was edited. The zero sub-12px count and the 390 scrollWidth are the capture script's figures as reported with this round, not re-measured here. Contrast figures are estimated from token hex.

Design Score: B+
AI Slop Score: A-

Design Score is the average of the axes below (8.2). Bands as in r4: A- at 8.5 and up, B+ at 8.0 to 8.4, B at 7.5 to 7.9. The grade holds at B+. The r4 fixes lift the desktop axes, but the mobile axis comes down from r4's 8 to 6.5 on this read, which offsets them. r4 scored mobile without recording where the quote check lands on a phone.

Desktop is in good shape. At 1440 the one decision sits top right beside the claim it proves, with a single full-width action, both pages share one system, and nothing reads as template output. The problem is phones: at 390 neither page shows an action on the first screen, and on quote-cap the check starts about 1,600px down, after the "Two locks" prose.

## Round 4 findings, checked against r5

1. **Medium, 1440 captures predate the r4 build: fixed.** The r5 1440 captures show the current H1 ("Your agent pays only the price you allow.") and the current refusal line ("Leash stopped it before the agent key signed.", `p-qc-pressed-1440.png`). "QuoteCapExceeded" is gone. The capture-script H1 assertion that prevents a recurrence is not visible in what I read; the owner reports the H1 was checked.
2. **Medium, quote-cap left column empty at 1440: fixed at the top.** "Two locks, in order" (`quotecap.tsx:196-205`) now fills the left column down to the card's bottom edge at 1440 (`p-1440.png`, `p-qc-full-1440.png`). The same empty-column pattern reappears lower on the page, see finding 2.
3. **Low, scope and refund phrasing: partly fixed.** The refund sentence is gone from the refusal card (`quotecap.tsx:113`) and from the old line at `:204`. "Nothing is signed, so nothing needs a refund" now appears once, in the first lock (`quotecap.tsx:199`). Still open: "Hashes resolve only on that fork" at `quotecap.tsx:133` and `deliverycut.tsx:102`.
4. **Low, instruction sentences in idle states: fixed.** `quotecap.tsx:117` now states the verdict ("This quote is above the policy."). `deliverycut.tsx` has no idle instruction line.
5. **Low, red before any verdict: fixed on quote-cap, residual on delivery-cut.** The 402 amount stays ink until the press (`quotecap.tsx:77` sets the tone only when `shown && !v.ok`, and `p-1440.png` shows it in ink). On delivery-cut the red is present before the press, but the verdict line ("Paid, not delivered") is also in the idle state, which is the r4 alternative fix. The residual: `index.css:6-7` reserves red for refusals, while `deliverycut.tsx:74` and `:87` use it for a vendor failure.

**Observation, "API unreachable" strip: not reproduced.** `App.tsx:51` does not render `UtilityBar` on either route, and no r5 capture shows the strip. The source and the running page agree, and the running page is the stronger evidence for this question. If the strip appears on this preview, the served bundle or the route differs from `e0df52f`, and that is the first thing to check.

**Quick wins from r4:**
- Drop "only" at `quotecap.tsx:133` and `deliverycut.tsx:102`: open.
- Delete the refund sentence at `quotecap.tsx:204`: done, the duplicate is gone.
- Keep the 402 amount in ink until the press (`quotecap.tsx:77`): done.
- Policy toggles at `size="sm"` (`quotecap.tsx:89`, `:95`): open.

## Owner complaints, checked

- **Too dense: pass on desktop, fail-ish on phones.** At 1440 quote-cap is 2064px tall with 96 to 128px between sections. The fork list has seven rows and the route list three. Delivery-cut is short. At 390, quote-cap runs 3549px and the decision sits after the prose.
- **No clear main action: pass on desktop, fail on the 390 first screen.** One full-width `lg` black button per page (`quotecap.tsx:102`, `deliverycut.tsx:92`). After signing, the cut button becomes an outline "Cut signed" (`deliverycut.tsx:92-94`). Competing solid-ink fills are in finding 4.
- **Gray text under 12px: pass.** The smallest token is caption at 12px (`index.css:62`). The capture script reports zero sub-12px nodes at both widths on both routes, as reported with this round. Muted body ink `#55554f` on canvas is about 6.9:1 and subtle `#6b6b65` about 5.1:1, estimated from hex.
- **Walls of monospace: pass.** Mono appears only on shortened hashes and payout addresses (`.hash` at `quotecap.tsx:144`, `deliverycut.tsx:88`, `:103`, `:113`). The 12px hashes in the fork and transaction lists read as a column of tags, not a wall of text.
- **Unfinished left panel: pass at the top of both pages, partial fail lower on quote-cap.** The "Two locks" column fills at 1440 and delivery-cut is balanced. The fork and route sections leave about 350px of blank under their left copy at 1440 (finding 2).

## Findings, ranked

1. **High, mobile: the decision sits below the fold on both pages.** On a 390 by 844 phone the first screen is the H1 and two paragraphs, with no control in view. On quote-cap the header, including the "Two locks" prose (`quotecap.tsx:188-206`), stacks above `QuoteCheck` (`:207`), so "Let the agent pay this quote" begins about 1,600px down (`p-qc-full-390.png`). The verdict sits under it. On delivery-cut the "Sign the cut" button begins about 1,130px down (`p-dc-full-390.png`). Fix: below `lg`, render `QuoteCheck` directly after the H1 and move "Two locks" below the card. On delivery-cut, put the card above the second intro paragraph on mobile.

2. **Medium, 1440: quote-cap's lower sections leave the left column empty.** The fork heading and paragraph (`quotecap.tsx:129-135`) and the route heading and paragraph (`:160-165`) sit in a 5fr column with about 350px of blank beneath them, beside a seven-row list and a three-row list (`p-qc-full-1440.png`, roughly y 1170 to 1520). It is the owner's "unfinished left panel" pattern, moved below the fold. Fix: move the fork's before and after limits, already in `proof.limitBefore` and `proof.limitAfter`, into two rows under the paragraph, and give the route savings one row the same way.

3. **Medium, copy: "Hashes resolve only on that fork" volunteers a scope gap.** It appears at `quotecap.tsx:133` and `deliverycut.tsx:102`. The public-surface rule keeps limits out of judge-facing copy, and the line above it already names the fork and the block. Fix: drop "only" as r4 said, or cut the sentence.

4. **Low-medium, primary action competes with the selected toggles.** A selected chip uses `bg-ink` (`toggle.tsx:8`) and the primary button uses `bg-primary` `#111111` (`button.tsx:12`), the same fill. Above the fold at 1440, quote-cap shows three black chips ("No prompt", "Exact", "$1.00") plus the black CTA (`p-1440.png`). The CTA is wider and larger, so it still wins, but the chips read as actions of equal weight. Fix: give the selected chip a `surface-2` fill with an ink border, and keep solid ink for the CTA.

5. **Low, touch targets in the decision card.** The tolerance and cap groups use `size="sm"` (`quotecap.tsx:89`, `:95`), which is `min-h-9`, 36px (`toggle.tsx:15`). They are the smallest targets in the card, and on a phone they are the controls the user must hit to change the policy. The CTA is 56px and the quote toggles 44px. Fix: drop `size="sm"` on both groups, the r4 quick win. The 36px size already clears WCAG 2.5.8, so this is about consistency and thumbs.

Also open, not in the top five: the delivery-cut H1 is 44px with no mobile size (`index.css:44`), so it wraps to four lines at 390. The r4 hover note is still unverified.

## Consistency across the two pages

Pass. Both pages share the same frame: header and card in a 5fr and 6fr split at `lg`, the same H1 size, the same card with an ink border and a canvas policy panel, the same verdict block with a 4px left rule, the same settled and refused labels, and the same CTA. Delivery-cut's transaction section mirrors quote-cap's fork and route sections. The only shared gap is finding 2.

## Blind spots

- Hover and focus were not rendered this round. Whether the selected chip's hover state turns light is still unverified.
- The Paid branch (Listed, Exact), the "With prompt" refusal, and the signed delivery-cut state are not in the r5 captures. They are judged from source (`quotecap.tsx:104-111`, `deliverycut.tsx:80-84`).
- Widths 672 to 1055 are untested. The nav switches to the menu at 1056 (`App.tsx:58`).
- `p-qc-pressed-390.png` shows the header mid-page. That is a full-page capture artifact of the `sticky top-0` header (`App.tsx:52`) after the press scrolled the page, not a layout defect.
- The sub-12px count and the 390 scrollWidth come from the owner's capture script and were not re-run here.

## Critic scores (0-10)

hierarchy: 8.5
primary action: 8.0
typography: 8.5
density/whitespace: 8.0
color: 8.5
consistency across the two pages: 9.0
AI-slop absence: 8.5
mobile: 6.5
average: 8.2
min: 6.5
