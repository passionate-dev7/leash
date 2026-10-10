# Design audit: Leash #/quote-cap and #/delivery-cut (round 7)

Mode: audit only, report only. Captures from the round 7 preview in `shots-r7/`. Read this round: `p-1440.png` and `p-390.png` (re-read), `p-qc-full-1440.png`, `p-qc-full-390.png`, `p-qc-pressed-1440.png`, `p-qc-pressed-390.png`, `p-dc-full-1440.png`, `p-dc-full-390.png`. Source read-only: `quotecap.tsx`, `deliverycut.tsx`, `index.css`, `toggle.tsx`, `apps/web/public/delivery-cut-proof.json`, and the probe file `research/platform/scripts/probe-all402.json` for the payout-address claim. No browser was started, no script was run, no source was edited, nothing was committed or deployed. The only file written is this report.

Skipped under report-only mode: the gstack preamble and telemetry, the design-detector probe, DESIGN setup, and outside voices. The sub-12px count and the 390 scrollWidth are the owner's capture-script figures and were not re-run.

Design Score: B+
AI Slop Score: A-

Design Score is the average of the eight axes below: 8.2. Bands as in r5 and r6: A- at 8.5 and up, B+ at 8.0 to 8.4. Desktop is clean and the phone action problem from r6 is solved. Two things hold the grade: quote-cap is about half again taller at 1440, and the new bottom blocks repeat the empty left-column pattern. Separately, the public copy fails the no-confession rule in four sentences. That does not change the design grade, but it blocks judge-facing ship until fixed.

## Summary

At 1440 both pages read clean: one solid ink action, selected chips light with an ink ring, and the delivery-cut left-column hole is gone. Both routes now have a fixed action below `md`. Three things went the wrong way. The delivery-cut bar sits over the failed-call row on the first phone screen. Quote-cap grew by about 1,070px at 1440. The new copy says what Leash does not do.

## Round 6 findings, checked

1. **Mobile, no action on the first phone screen: fixed, with a side effect.** Both routes render a fixed bottom button below `md` (`quotecap.tsx:104-106`, `deliverycut.tsx:96`). The action is on the first screen. The bar also covers evidence on delivery-cut (finding 2 below).
2. **Delivery-cut left column hole: fixed.** The second lead paragraph moved into the header (`deliverycut.tsx:58-64`) and the card no longer uses `row-span-2` (`:66`). `p-dc-full-1440.png` shows no gap.
3. **Payout-address claim unsourced: partly fixed.** The page now names its source: "our unpaid 402 probes of mpp.tempo.xyz on 3 Oct 2026", with openai, firecrawl and nine other gateways (`deliverycut.tsx:108`). The probe file exists and records the address as recipient for firecrawl and openai (lines 428 and 530). The probe records no block number, and the page links no file. See finding 5.
4. **Quote-cap fork left column short: open, unchanged.** The copy and two limit rows end at about y 1,364, while the seven-row list ends at about y 1,573 (`p-qc-full-1440.png`). Same measurement as r6. The 5fr/7fr split is still at `quotecap.tsx:133`.
5. **Red and green beyond the rule: partly fixed.** Vendor failure is now amber (`deliverycut.tsx:74` tone warn, `:86` warning border). "Reverted" stays red (`:120`), which is a chain refusal and fits the rule. Still open: the signed cut is green (`:81`), which is neither an allow nor a refusal, and the `index.css:6-7` comment does not mention amber.

Other r6 items:
- "A local anvil fork at block …" is still open (`quotecap.tsx:137`, `deliverycut.tsx:107`). A new instance now sits at `quotecap.tsx:221`.
- Density: worse. Quote-cap is 3,280px tall at 1440, up from 2,207px in r6.
- Shared nav with eight items plus "Create a team" (`App.tsx:58`): open, not scored.
- Hover: the CTA hover tone shows in the pressed captures. Chip hover is unverified.

## Owner complaints, checked

- **Too dense: worse.** Each 1440 screen reads clean. The page does not. Quote-cap grew by about 1,070px at 1440. That is the two new blocks plus their section gaps (`space-y-32` at `lg`, `quotecap.tsx:255`). At 390 the page is 5,483px tall. The "Business model" block alone is three paragraphs of 18px muted prose, about 470px at 1440.
- **No clear main action: pass.** Desktop has one solid ink button per page (`quotecap.tsx:103`, `deliverycut.tsx:92`). After pressing, the quote-cap CTA goes graphite and the verdict turns red (`p-qc-pressed-1440.png`). Phones have a fixed action on both routes. Caveat in finding 2.
- **Gray text under 12px: pass by source.** The smallest text is 12px caption, used only on hash lines (`quotecap.tsx:152`, `deliverycut.tsx:118`). Route notes and sub-lines are 14px (`quotecap.tsx:172`, `:186`). Not re-run.
- **Walls of monospace: pass.** Mono appears only on hashes and on the three file paths and one command in "Check it in two minutes" (`quotecap.tsx:223`). Those are short and read as code.
- **Unfinished left panel: worse.** The quote-cap fork section is still about 210px short. The two new blocks put only an H2 in the left column. "Business model and neighbours" leaves about 430px empty beside its text, and "Check it in two minutes" about 330px (`Block`, `quotecap.tsx:199`). Delivery-cut has no such gap.

## Quote-cap bottom sections: density and honesty

Density. Both blocks together are about 830px at 1440, plus two 128px section gaps. The business model is the densest prose on either page. Cut it to one paragraph or move it off the judge path. "Check it in two minutes" is the right size: four short steps.

Honesty. The public-surface rule is mandatory. Four sentences volunteer gaps, and the fork label appears in two more places:
- `quotecap.tsx:209`: "Business model (planned, no revenue yet)." Drop the parenthetical. "would" already marks it as a plan. Move "no revenue yet" to `.progress/LEDGER.md`.
- `quotecap.tsx:210`: "We have not seen its chain or mechanism, so we compare only what Leash shows." This is a refusal to guess with its reason, which the rule allows, but it belongs under its own heading, phrased as the decision: "We compare only what Leash runs on a fork."
- `quotecap.tsx:221`: "These hashes exist only on a local anvil fork of Tempo mainnet." Delete it. `quotecap.tsx:137` already says "Hashes resolve on that fork."
- `deliverycut.tsx:108`: "The fork run only charged fal and stablestudio; it did not test the other gateways." Keep "charged fal and stablestudio" as the positive fact and move the untested-gateways gap to the ledger.
- `quotecap.tsx:137` and `deliverycut.tsx:107`: "A local anvil fork at block N." Use "A fork of Tempo mainnet at block N." It is accurate and drops the adjective the rule flags.

"Hosted spend desk" (`quotecap.tsx:209`) appears only in that sentence within `apps/web/src`. The sentence is conditional ("would pay"), so it reads as a plan rather than a shipped capability. Keep it conditional.

## Findings, ranked

1. **High, honesty: four sentences on public pages volunteer gaps.** This breaks the mandatory public-surface rule. Fix the five lines listed under "Honesty" above, then run `backstage gate --fail-on HIGH` before any commit that touches these files.

2. **High, mobile: the delivery-cut bar covers the evidence on the first phone screen.** At 390 the fixed "Sign the cut" bar (`deliverycut.tsx:96`) sits over the "fal answered HTTP 422, no image" row and the empty-body line (`p-dc-full-390.png`, bar at about y 772 to 828). That row is the failure itself. Fix: on phones, move the two lead paragraphs (`deliverycut.tsx:60-63`) after the card with CSS `order`. The card, its verdict and the bar then sit above the bar line, with the H1 still on top. Moving only the bar's trigger does not help, because the verdict is below the fold and the bar would still show over the rows.

3. **Medium, density: quote-cap's bottom blocks add about 1,070px at 1440 with empty left columns.** The "Business model" block is about 470px of 18px prose, and both new H2s sit alone at left (`quotecap.tsx:197-204`). Fix: put each H2 full width above its text, and cut the business model to one paragraph.

4. **Medium, 1440: quote-cap's fork section is still about 210px short.** Unchanged from r6 finding 4 (`quotecap.tsx:133-146`). Fix: at `lg`, stack the heading, paragraph and two limit rows full width, then the seven rows below them.

5. **Medium, evidence: the payout-address claim cites a probe with no block number and no link.** The claim is backed. `research/platform/scripts/probe-all402.json` records `0xca4e835F…` as recipient for firecrawl and openai (lines 428 and 530), dated 2026-10-03 in the proof caveat. The page gives a date but no block, and it links no file. Fix: cite the probe path in the ledger and state on the page that the probe records no block, or name the block it ran at.

## Consistency across the two pages

Pass, with two breaks. Both pages share one frame: header and card in a 5fr/6fr or 5fr/7fr split at `lg`, the same H1 scale, the same card and verdict block, the same Settled and Refused labels, and one solid CTA. The breaks: quote-cap's bar stays after pressing while delivery-cut's bar hides after signing. Quote-cap also has two extra blocks that delivery-cut lacks, which is acceptable.

## AI-slop absence

Pass. No gradient text, pill tags, ghost numbers, emoji or rounded corners. Copy is specific: block numbers, hashes, dated catalog prices and a linked issue. One pattern to watch: quote-cap uses the "The same …" H2 formula twice on one page.

## Blind spots

- No browser this round. Hover and focus are unverified. Pressed states come from `p-qc-pressed-*.png` only.
- Mobile bar positions are read from 390px captures and assume an 844px viewport. They are not measured in the DOM, and real phones with browser chrome will differ.
- The pressed and full-page 390 captures show the top bar mid-page after scrolling, which suggests the header is sticky or fixed. Not confirmed in `App.tsx`.
- Sub-12px count and 390 scrollWidth are the owner's figures and were not re-run. The source check finds 12px only on hash lines.
- Contrast figures are computed from hex, not sampled from rendered pixels.
- Signed delivery-cut state, the "With prompt" refusal and the "Listed" paid state are not in the captures. They are judged from source.
- Widths 672 to 1055 are untested.
- The probe file was checked for the openai and firecrawl recipients only. The "nine other gateways" count was not verified.
- The "API unreachable" strip is not graded, per the brief, and is not in any capture.

## Critic scores (0-10)

hierarchy: 8.5
primary action: 8.5
typography: 8.5
density/whitespace: 7.5
color: 8.0
consistency across the two pages: 8.5
AI-slop absence: 8.5
mobile: 7.5
average: 8.2
min: 7.5
