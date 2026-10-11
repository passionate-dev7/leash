# LEASH design audit, round 11 (v3 "night console", polish round)

Targets: `http://localhost:4179/#/quote-cap` and `http://localhost:4179/#/delivery-cut` (local vite preview of the v3 build, commit `88357c2`).
Mode: audit only, report mode. No browser driven. Evidence: the 12 Playwright captures in `docs/design/review/shots-r11/` (opened and viewed: `p-1440`, `p-390`, `p-qc-full-1440`, `p-qc-pressed-1440`, `p-qc-pressed-390`, `p-dc-full-1440`, `p-dc-signed-1440`, `p-dc-390`, `p-dc-signed-390`), plus a read-only pass over `src/pages/quotecap.tsx`, `src/pages/deliverycut.tsx`, `src/components/kit.tsx`, `src/components/shadcn/{button,toggle}.tsx`, `src/index.css`, `src/App.tsx`, `DESIGN.md`, `projects/leash/docs/design/contrast-r11.txt`, and the step ids in `public/fork-proof.json` and `public/delivery-cut-proof.json`.
Previous: `design-audit-leash-r10.md` (B+ / B+, average 8.3, min 7.5).
Classifier: HYBRID. First screen of each page is OPERATE (one decision on a real 402). Below the fold on quote-cap is PERSUADE / READ (judge path, Route, fork proof, rivals, business model).

Design Score: B+
AI Slop Score: A-

## Summary

Round 11 did what it was asked to do. The status system is real: five tones, each with a tint, a chip, a panel and a rail node, and every pair is documented at 4.5:1 or better (lowest 6.40:1, `ink-subtle` on `surface-1`). The headline proof on quote-cap is now pink "Refused before signing", and the same event is pink in the fork rail and the rail header, so the r10 colour split is closed. Route is now a real chart: per-API horizontal bars with a legend, green for the routed seller. The fork runs read as an event rail with numbered nodes coloured by outcome. The r10 desktop gap under the quote-cap lead is gone (lead ends y≈395, explainers start y≈431 in `p-1440.png`). Rivals are one panel with three columns and no nested boxes.

What holds the grade at B+ rather than A-:

1. **New, MEDIUM: green "Settled" on transactions that are not payments.** `stepTone` maps every `status: "success"` to paid, so "Fund a fresh team account", "Authorize agent key" and, on delivery-cut, "One root signature cuts fal" all wear the green "Settled" chip. The cut is violet "Cut signed" in the verdict panel and green "Settled" 700px lower in the rail. This is the same kind of split r10 Finding 2 had, moved to a new place.
2. **Card remainder below the fold.** The hero explainers are still two raised boxes with numbered discs, the judge steps carry three more discs, and Business model is still its own card holding one paragraph.
3. **Token drift around pink and violet.** Five near-pink tokens and two near-identical violets (`reverted #b9b0ff`, `accent-ink #b4abff`) now carry different meanings. `DESIGN.md` documents the new system in its Round 11 section but its original token block still contradicts it.

## Status of the r10 findings

| r10 finding | Status | Evidence this pass |
|---|---|---|
| 1 MEDIUM: quote-cap explainers float ~150px below the lead at 1440 | **Fixed** | `quotecap.tsx:312` adds `lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-8`. `p-1440.png`: lead ends y≈395, first explainer starts y≈431. The left column now reads as one block. |
| 2 MEDIUM: the headline refusal is red; the same event is violet further down | **Fixed** | Verdict is `panel-refused` + `Chip tone="refused"` (`quotecap.tsx:125-126`). "The 402 asks $10.00" turns `text-refused` on press (`:51`, `:88`). Fork rail step 5 node, its chip and the header count "1 refused by Leash" are the same pink (`p-qc-pressed-1440.png`). Remainder: the lead sentence's `$10.00` uses `text-error-ink #fda4af` (`:316`), a different pink from `refused #ff8fb8`. Polish, Finding 5. |
| 3 MEDIUM: quote-cap below the fold is a stack of cards | **Partly fixed** | Rivals are one `Card` split into three columns by hairlines, with no nested "Leash:" boxes (`:263`, `Rival` at `:246-256`). Still present: two `card-raised` hero explainers with numbered discs (`:324-331`), three judge-step discs (`:289`), and Business model as a separate `Card` (`:275`). Finding 2. |
| 4 POLISH: "Not run yet" is violet | **Fixed** | `Chip tone="neutral"` (`quotecap.tsx:133`), `chip-neutral` is grey-violet on `#30254d` (`index.css:128`). `p-1440.png` shows it grey. |
| 5 POLISH: Evidence card stretches | **Fixed** | `lg:items-start` (`deliverycut.tsx:125`). `p-dc-signed-1440.png`: Evidence card ends at its button. |
| 6 POLISH: block height is the biggest number in Fork run 1 | **Mostly fixed** | Block is forced to 28px (`quotecap.tsx:180`) while "$0.091" uses the 40px metric. In `p-qc-full-1440.png` the limit now reads as the outcome. Still a full metric tile for a block height; delivery-cut puts its block in the intro sentence. |
| 7 POLISH: "setAllowe / dCalls" breaks mid-word at 390 | **Fixed** | `p-dc-signed-390.png`: "(AccountKeychain.setAllowedCalls)" moves to its own line intact. |
| 8 POLISH: rows added on signing arrive with no cue | **Not fixed** | No arrival animation in `deliverycut.tsx:63` or `StepFeed`. The "See the three new transactions ↓" link remains the only cue. |
| 9 POLISH: copy button reads the full 66-char hash | **Not fixed** | `kit.tsx:42` still `aria-label={\`Copy ${value}\`}`; "Copied" is still an icon swap only. |
| 10 POLISH: sync DESIGN.md with shipped tokens | **Partly fixed** | New "Round 11 additions" section documents the status table, accents, type scale and contrast. But the token block above it (`DESIGN.md:21`, `:26`, `:27`) still says `ink-subtle #9a93a8`, inset `.04`, type scale `12/14/16/20/28/40/56`, which contradicts both the r11 section and `index.css`. `index.css:63` still says "12 hashes only"; hashes are 14px (`kit.tsx:40`), and 12px is the header tagline (`App.tsx:56`), the wallet line (`:64`) and the rail numerals. Finding 6. |

Score: 5 fixed, 2 mostly or partly fixed with a remainder, 1 partly fixed (documentation), 2 not fixed (both polish).

## Round 11 asks, checked

| Ask | Met | Evidence |
|---|---|---|
| Status colour system: paid green, refused pink (secondary accent), reverted violet, failed amber, neutral grey-violet | **Yes**, one mapping bug | Tokens `index.css:19-28`; chips `:124-128`; panels `:129-132`. Seen: green "Settled" and route bars; pink quote-cap verdict, rail step 5, "Leash:" labels; violet "Reverted", "Cut", "Cut signed"; amber "HTTP 422", "Paid, not delivered", 47%; grey "Not run yet", "Evidence", "Planned, no revenue yet". Bug: non-payment successes are painted paid (Finding 1). |
| Applied to chips, verdict panels and fork-feed nodes | Yes | Rail node uses `chip-${tone}` (`quotecap.tsx:156`); chip right of each row on desktop, under the label on phones (`:159`, `:162`); header counts per tone (`:185-187`). Status is never colour-only: every node has a text chip. |
| Route as horizontal price bars per API with a legend | Yes | `quotecap.tsx:208-240`. Legend "Routed to / Skipped", bars scaled to the dearest listing, seller and amount on each row, "% less" chip per API. Reads in two seconds. Polish: amounts have mixed precision (Finding 7). |
| Fork runs as a numbered event rail coloured by status | Yes | `StepFeed` (`:148-168`), rail line at `:155`. Used by both pages, so they now share one proof component. |
| Type scale + WCAG AA, every token pair listed | Yes | `projects/leash/docs/design/contrast-r11.txt`: 27 pairs, "0 below 4.5:1". Two pairs in use are not listed: `accent-ink` on `surface-3` (explainer and judge discs) and `accent-ink` on `neutral-tint` (the "Tempo mainnet 402" chip). Computed by hand: about 5.6:1 and 6.8:1, both pass. |
| r10 leftover: rivals as one panel with three columns | Yes | `p-qc-full-1440.png`: one panel, hairline dividers, Source link per column, pink "Leash:" lead-in. Stacks with `divide-y` on phones. |
| r10 leftover: Quote-Cap refusal panel pink "refused" | Yes | See r10 finding 2 above. |

## Owner complaints, checked

| Complaint | Verdict | Evidence |
|---|---|---|
| Too dense | Fixed on both first screens; improved below the fold | First screens: headline, lead, one card, one button. Quote-cap is 3789px at 1440 (r10: 3638) and 6992px at 390 (r10: 7118). Rivals lost their nested boxes; the "Leash:" paragraphs still run 40 to 50 words each in 14px three-column text (Finding 4). Delivery-cut stays tight. |
| No clear main action | Fixed | One lime button per page with an outcome label ("Let the agent pay this quote", "Sign the cut"); same inline-plus-conditional-bar pattern on phones (`quotecap.tsx:112-115`, `deliverycut.tsx:112-117`). Note: the selected toggles carry a `ring-primary/70` lime ring (`toggle.tsx:7`), so lime is no longer strictly button-only (Finding 8). |
| Gray text under 12px | Fixed | Capture script: 0 text nodes under 12px at both widths. Smallest are the 12px header tagline and 12px bold rail numerals. Lowest text contrast in use: `ink-subtle` on `surface-1`, 6.40:1. |
| Walls of monospace | Fixed | Mono only on short hashes, amounts and three script paths. No sentence is in mono. The fork labels ("Agent pays fal $0.003 ...") are Rubik. |
| Unfinished left panel | Fixed | Quote-cap 1440: explainers sit 36px under the lead. Delivery-cut 1440: metric tiles sit right under the lead (`p-dc-full-1440.png`). Both left columns end above the card's bottom without a hole. |

## First impression

Quote-cap, 1440 (`p-1440.png`). It reads as a working tool with a point of view. My eye goes to the headline, then the 28px mono `$10.00`, then the lime button. The left column is now one block: lead, then two short explainers. The lime ring on the three selected toggles is the only other bright thing in the card, and it is quiet enough. One word: assured.

Quote-cap, pressed (`p-qc-pressed-1440.png`). `$10.00` turns pink and a pink panel says "Refused before signing", with the two amounts in bold mono. Scrolling, the fork rail's step 5 is the same pink, and the header chip "1 refused by Leash" names it. The page now tells one colour story: pink is Leash saying no. Then I hit steps 1 and 2: "Fund a fresh team account" and "Authorize agent key", both green "Settled". Neither is a payment.

Delivery-cut, 1440 (`p-dc-full-1440.png`). Still the best single screen. Amber 47%, amber "HTTP 422, no image", amber "Paid, not delivered / $0.003 lost", lime "Sign the cut". After signing (`p-dc-signed-1440.png`), the verdict turns violet "Cut signed", the header chip says "Cut", and the button goes quiet. In the rail below, the cut transaction (step 3) is green "Settled", and the refused charge (step 4) is violet "Reverted". The verdict says violet means "cut"; the rail says violet means "refused" and the cut is green.

Phones (`p-390.png`, `p-dc-390.png`). Headline, lead, the facts, then the lime bar. On delivery-cut the two metric tiles sit between the lead and the card, which pushes the `$0.003 lost` panel below the first screen; the bar still names the action. Acceptable.

## Findings, ranked

**FINDING-1 (MEDIUM, color / consistency, new). Green "Settled" is applied to transactions that are not payments, including the cut itself.**
`stepTone` (`quotecap.tsx:144`) keys only on `status`, and both proof files mark `fund`, `authorize` and `cut` as `"success"`. So:
- Quote-cap rail: steps 1 ("Fund a fresh team account") and 2 ("Authorize agent key") read green "Settled", and the header says "4 settled" when two payments settled.
- Delivery-cut rail after signing: step 3, "One root signature cuts fal from the agent key", reads green "Settled". The verdict panel and header chip for the same event are violet "Cut signed" / "Cut".
`DESIGN.md` defines paid as "payment settled / routed-to seller", so this breaks the contract the round introduced.
Fix: tone by step kind, not status. `StepFeed` already receives the full step objects (they carry `step`). In `stepTone`, return `neutral` with label "Confirmed" for `fund` and `authorize`, and `reverted` with label "Cut" for `cut`, so the rail matches the verdict. Count only true payments in "N settled". About 6 lines in `quotecap.tsx:143-145`.

**FINDING-2 (MEDIUM, AI slop / layout, r10 F3 remainder). Five numbered discs and a one-paragraph Business model card remain.**
- Hero explainers: two `card-raised` boxes, each with a 32px `surface-3` disc ("1", "2") (`quotecap.tsx:324-331`). The order is not a sequence the user follows; the titles "Before signing" and "If the check is bypassed" already carry it.
- Judge steps: three more discs (`:289`). These earn their numbers, since the order matters.
- Business model: a `Card` holding a label, a chip and one paragraph (`:275-281`), right after the rivals panel.
Fix: drop the discs and box from the hero explainers (title plus paragraph, separated by a hairline or 24px). Set Business model as plain text under the rivals panel: label, neutral chip and paragraph, no card. Keep the judge discs.

**FINDING-3 (POLISH, color system). Violet carries two jobs at almost the same hue.**
`reverted #b9b0ff` (status: the chain refused) and `accent-ink #b4abff` (links, section eyebrows, explainer numerals, the "Signatures to cut 1" metric, the "Tempo mainnet 402" chip text) differ by about 2% luminance. On delivery-cut the violet "1" metric sits next to violet "Cut" and violet "Reverted", so it reads as a status. Either shift link/label violet cooler and paler (or use `ink` for eyebrows), or give the "Signatures to cut" metric `tone="neutral"` so violet numbers mean only "reverted / cut".

**FINDING-4 (POLISH, density / content). Rival "Leash:" paragraphs are long for 14px three-column text.**
Each column runs about 75 to 90 words (summary plus "Leash:"), at `text-body-sm` in roughly 45ch columns (`p-qc-full-1440.png`). Fermata's "Leash:" paragraph is 49 words. Cut each "Leash:" line to one sentence of difference (vet402: "grades sellers; Leash controls the agent's key"), and move the rest to the source link. This is the last part of quote-cap that feels dense.

**FINDING-5 (POLISH, color tokens). Five near-pinks.**
`--color-pink #fa7faa`, `--color-accent-2 #ff8fb8`, `--color-refused #ff8fb8`, `--color-error #fb7185`, `--color-error-ink #fda4af` (`index.css:15-16`, `:21`, `:47-48`). The lead sentence's `$10.00` uses `text-error-ink` (`quotecap.tsx:316`); the card's `$10.00` uses `text-refused` (`:51`). Side by side at 1440 they are one shade apart. Use `text-refused` in the lead, alias `accent-2` to `refused`, and drop `--color-pink` if nothing reads it.

**FINDING-6 (POLISH, system). `DESIGN.md` contradicts itself.**
The token block (`DESIGN.md:21`, `:26`, `:27`) still lists `ink-subtle #9a93a8`, inset `.04` and scale `12/14/16/20/28/40/56`, while the Round 11 section lists `#a9a2b8` and `12/14/16/18/20/28/34/44`. The r11 section says 12px is for "hashes, step numbers only" and `index.css:63` says "12 hashes only", but hashes ship at 14px (`kit.tsx:40`) and 12px is used by the header tagline and wallet line (`App.tsx:56`, `:64`). Update the block in place and correct both comments. Also record Finding 1's rule: paid means a payment, not any successful transaction.

**FINDING-7 (POLISH, data viz). Route amounts have mixed precision.**
`$0.008`, `$0.03`, `$0.005`, `$0.02`, `$0.002`, `$0.0126` (`p-qc-full-1440.png`). Tabular figures do not align decimals with different lengths, so the right column zigzags. Format every option to 4 decimals in this chart (`$0.0300`, `$0.0126`), or right-align on the decimal point.

**FINDING-8 (POLISH, color). Lime appears on selected toggles.**
`data-[state=on]:ring-primary/70` (`toggle.tsx:7`) puts a lime ring on "No prompt", "Exact" and "$1.00". It is muted, but r10's rule was lime only on the primary button. Use `ring-hairline-strong` (violet) for the selected toggle, and keep lime for the button and focus.

**FINDING-9 (POLISH, interaction). Rail rows have a hover background but nothing to click.**
`hover:bg-surface-1` on each `<li>` (`quotecap.tsx:154`) suggests the row is interactive. Only the copy button inside is. Remove the row hover.

**FINDING-10 (POLISH, motion and a11y, r10 F8 and F9 carried).** The three new rows still appear with no arrival cue; a one-time 600ms `surface-2`-to-transparent fade with ease-out would do it (reduced motion is handled at `index.css:114`). The copy button still announces the full 66-character hash and confirms "Copied" only by icon (`kit.tsx:42-46`).

## AI slop, judged

Absent: gradients, glow and halo, glassmorphism, emoji, stock imagery, fake avatars, filler sparklines, testimonial rows, hero eyebrow chips, uppercase tracked kickers and decorative left-border accents. Every number is a captured 402, a fork hash, a catalog price or a cited count. The two new data views are earned: Route's bars carry real per-seller prices, and the event rail is the actual transaction sequence with hashes. The pink secondary accent gives the console a second voice that means something (Leash said no), which moves it away from the generic "near-black plus one neon" look.

Present: five numbered discs and two boxed explainers, and a Business model card (Finding 2). Two section eyebrows remain ("Route · route: true", "Fork run N · ..."), each carrying a fact, so they are not counted.

Litmus: brand in first screen YES. One strong visual anchor YES (the decision card). Understandable from headings alone YES. Each section has one job YES. Cards necessary MOSTLY (decision card, rail, chart, rivals panel yes; hero explainers and Business model no). Motion improves hierarchy NO (colour transitions only). Premium with shadows removed YES.

## Consistency across the two pages

Shared: header and active nav pill, `5fr / 6fr` hero grid, h1 plus lead, decision card split by a hairline into facts and a tinted action half, a full-width lime button, inline button plus conditional fixed bar on phones, one `StepFeed` rail for both fork runs, one five-tone status system, the same pink-for-Leash / amber-for-vendor-loss / violet-for-chain rule.

Divergent:
- The cut's colour: violet in the delivery-cut verdict, green in its rail (Finding 1).
- Fork facts: quote-cap gives the block its own metric tile; delivery-cut puts it in the intro sentence (r10 F6 remainder).
- Vendor-fault colour: quote-cap's overcharge is pink (refused), delivery-cut's paid-but-failed call is amber (failed). This is now written down as two statuses in `DESIGN.md`, so it reads as a rule, not drift.

## Trunk test

Both pages PASS. Site: logo plus "Leash". Page: active nav pill plus h1. Sections: eight-item nav, hamburger at 390. Options at this level: one button. Location: the nav pill. Search does not apply to an eight-route console.

## Goodwill (from captures, not a live walk)

```
quote-cap   70 ████████████████████░░░░░░░░░░
  first screen, task obvious          70 → 80  (+10)
  phone: quote shown before button    80 → 85  (+5)
  refusal panel says what and why     85 → 95  (+10)
  "Authorize agent key ... Settled"   95 → 92  (-3 mislabel, small)
  FINAL 92/100

delivery-cut 70 ████████████████████░░░░░░░░░░
  loss stated in money above CTA      70 → 80  (+10)
  CTA on phone first screen           80 → 85  (+5)
  signed state + link to new rows     85 → 95  (+10)
  cut is violet above, green below    95 → 90  (-5 ambiguous signal)
  FINAL 90/100
```

## Category grades

| Category | Grade | Driver |
|---|---|---|
| Visual hierarchy | A- | One anchor and one button per page; polish 3 (violet metric reads as status) |
| Typography | A- | Scale documented, mono confined; polish 7 |
| Spacing and layout | A- | r10 gap and evidence stretch fixed; Finding 2 remainder |
| Color and contrast | B+ | Deliberate five-tone system, all AA; Finding 1; polish 3, 5, 8 |
| Interaction states | B+ | 44px copy targets, neutral pre-run state; polish 9, 10 |
| Responsive | A- | Rail chips move under labels on phones; identifier break fixed; quote-cap is still ~7000px tall at 390 |
| Content | B+ | Rival paragraphs long (polish 4); judge steps are instructions by design |
| AI slop | A- | Finding 2 |
| Motion | B | Nothing authored; reduced motion respected |
| Performance feel | not measured | Fonts self-hosted via @fontsource; no LCP or CLS in this run |

## Quick wins (each under 30 minutes)

1. Tone fork steps by kind: `fund` / `authorize` neutral "Confirmed", `cut` violet "Cut", count only payments as settled (Finding 1).
2. Strip the discs and boxes from the two hero explainers; un-card Business model (Finding 2).
3. `text-refused` on the lead's `$10.00`; alias `accent-2` to `refused` (Finding 5).
4. Selected toggle ring to `hairline-strong`; remove rail-row hover (Findings 8, 9).
5. Rewrite the `DESIGN.md` token block and the `index.css:63` comment to match what ships (Finding 6).

## Owner caveats kept (not counted as defects)

- "Planned, no revenue yet", "it did not test the other gateways", "The fork run only charged fal and stablestudio" and "Hashes resolve on that fork" are honest statements, graded on design only.
- "API unreachable" is not graded. `UtilityBar` is not rendered on these two routes (`App.tsx:51`), so it appears in no capture.
- The sticky header mid-page in `p-dc-signed-390.png` and `p-qc-pressed-390.png`, and fixed bars mid-page in the full 390 captures, are full-page stitching artifacts.
- The ~80px of empty card under "Not run yet" at 1440 is the `min-h-24` verdict slot (`quotecap.tsx:116`) that prevents layout shift on press.
- The disabled "Cut signed" button at 50% opacity is a deliberate done state; the violet verdict panel above it carries the message.

## Blind spots

- No live DOM this pass. Positions and gaps are read off the PNGs (1440 captures at 1:1); the full-page 390 quote-cap captures display at roughly 1:3.5, so below-the-fold phone layout was judged by structure, not line by line.
- The green "Paid / $X settled" verdict (reachable by choosing "Listed" or a looser tolerance) was not captured; its styling is read from source (`quotecap.tsx:119-123`).
- The two contrast pairs missing from `contrast-r11.txt` were computed by hand from hex values, not by the script.
- Hover, focus-visible and pressed states were read from source, not seen. Tablet (768) was not captured; with `md` at 1056px it gets the phone layout.
- No impeccable detector scan, no outside voice (Codex or subagent), no gstack preamble or telemetry: the run constraints forbid scripts, scratch files and browser work. These findings come from one reviewer.

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
