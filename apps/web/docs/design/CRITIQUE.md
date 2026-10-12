# LEASH critique log (critic: gstack /design-review, independent claude -p run per round)

## Round 2
Design Score: C+
AI Slop Score: A- (A = no slop patterns, F = slop throughout)
average: 6.8
min: 5.0
report: /Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r2.md

## Round 3
Design Score: B-
AI Slop Score: A- (A = no slop patterns, F = slop throughout)
average: 7.8
min: 7.5
report: /Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r3.md

## Round 4
Design Score: B+
AI Slop Score: A- (A = no slop patterns, F = slop throughout)
average: 8.2
min: 7.5
report: /Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r4.md

## Round 5
Design Score: B+
AI Slop Score: A-
average: 8.2
min: 6.5
report: /Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r5.md

## Round 6
Design Score: B+
AI Slop Score: A-
average: 8.3
min: 7.0
report: /Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r6.md

Round 6 open items (not blocking): sticky mobile CTA, delivery-cut left-column gap at 1440, 'stops all three' claim wording, fork column height, red for vendor failure.

r6 FINAL (superseded): 8.3 min=7.0 round=6 critic=design-review review=/Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r6.md

## Round 7
Design Score: B+
AI Slop Score: A-
average: 8.2
min: 7.5
report: /Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r7.md
Kept on purpose (owner asked for honest claims): the "no revenue yet", "not seen its chain", fork-only hashes and "did not test the other gateways" caveats that the critic flagged as volunteered gaps.
Open: delivery-cut fixed bar covers the "fal answered" row on the first 390 screen; quote-cap bottom blocks add ~1,070px at 1440 with lone H2s; fork column ~210px short; probe file has no block number.

r7 FINAL (superseded): 8.2 min=7.5 round=7 critic=design-review review=/Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r7.md

## Round 8
Design Score: B+
AI Slop Score: A-
average: 8.3
min: 7.5
report: /Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r8.md
Open: probe evidence has no block/link; quote-cap long (3,573px at 1440); mobile bar covers part of the delivery-cut mechanism sentence; signed cut is green; two fork runs at different blocks not labelled.

r8 FINAL (superseded): 8.3 min=7.5 round=8 critic=design-review review=/Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r8.md

## Round 9
Design Score: B+
AI Slop Score: A-
average: 8.4
min: 7.5
report: /Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r9.md

r9 FINAL (superseded): 8.4 min=7.5 round=9 critic=design-review review=/Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r9.md

## Round 10 (v3 night console rebuild, 11 Oct 2026)

Self-critique of it1 (1440 + 390): reads as a product now, dark violet surfaces, cards with shadow, chips for every status, one lime button per page.
Top 3 fixed in it2: "42 / 89" metric wrapped on phones; Route metric column stretched into empty tiles; judge step 1 was not clickable while 2 and 3 were.
Independent review r10a (design-review): B-/B-, 7.4 min 6.0. Fixed: 422px overflow on Delivery Cut after signing, template pills/uppercase labels/lime borders, repeated hero numbers, no Sign the cut on the first phone screen, two faces for amounts.
Review r10b: B/B, 7.9 min 7.5. Fixed: lime on non-buttons (info tone now violet), red on refusals that prove the product, pre-run chip leaking the result, phone order (card before explainers), mono status text, 24px copy buttons, stale root DESIGN.md.
Review r10c: B+/B+, 8.3 min 7.5. Then fixed its quick ones: left-column gap at 1440 (grid-rows auto/1fr), neutral "Not run yet" chip, Evidence card stretch.
Known, accepted: Quote-Cap below the fold is still card-heavy; the Quote-Cap refusal panel stays red (a refused overcharge is the alarm state).
r10 FINAL (superseded, line kept): 8.3 min=7.5 round=10 critic=design-review review=/Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r10.md

## Round 11 (polish on approved v3: status system, data viz, AA)

Added: paid/refused/reverted/failed/neutral status tokens + secondary accent pink (refusals, "Leash:" notes); Route price bars with legend; numbered event rail for both fork runs; all text token pairs >= 4.5:1 (docs/design/contrast-r11.txt); rivals in one 3-column panel; Quote-Cap refusal is pink "refused", not error red.
Self-critique r11 shots: the 390 event rail squeezed labels next to the chip; moved the chip under the label on phones.
Review r11 (design-review): B+ / A-, 8.5 min 8.0. Fixed after it: fund/authorize rows now neutral "Confirmed" and the cut violet "Cut" (only real payments are green); lead $10.00 uses the refused token; stale CSS comment. Left (polish): hero explainers still boxed, violet shared by links and "reverted", long rival copy.
r10 FINAL (superseded): 8.3 min=7.5 round=10
r11 FINAL (superseded): 8.5 min=8.0 round=11 critic=design-review review=/Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r11.md

## Round 12 (Web3-grade: primary metric, % over, link hue, cut summary, fork trust)

Self-critique of r12 shots after audit fixes: metric is now 2 of 2 recorded 402s ($9.99) with an honest basis and fork 2x policy named; metric sits in the left column so the lime button returns to the first desktop screen; delivery-cut "Before you sign" is plain text in the left column at lg and stays in the card on phones; explainer discs/boxes and the Business model card are gone; Route premiums are ink-subtle; mono only wraps digits; ForkNote says some steps lack a block time; sticky header is opaque (overlap scan).
Independent review r12 first pass (design-review): B / A-, 8.0 min 7.5 → report archived as design-audit-leash-r12a.md. Second pass after the fixes: B+ / A-, 8.5 min 8.0. Top findings fixed: metric basis (HIGH), button below the fold (HIGH), unfinished left panel on delivery-cut (MEDIUM), numbered explainer discs + Business model card (MEDIUM), Route pink / 25,541% noise (POLISH). Residue: ~140px empty band in the delivery-cut card, mono on "of" via metric-value inheritance.
FINAL: 8.5 min=8.0 round=12 critic=design-review review=/Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r12.md

## Round 12 (Web3-grade pass: primary metric, consequences, link hue, cut summary, trust; overlap fix)

Overlap scan (test/overlap.mjs, 1440/768/390, scroll-through incl. pressed/signed): live r11 had 66 hits, all text bleeding through the 95%-opaque sticky header while scrolling; no text-on-text collisions. Header made opaque; scan now 0. Wired as apps/web/test/overlap.test.ts.
Review r12a: B / A-, 8.0 min 7.5. Fixed: headline basis overstated (3 quotes; one was the listing) -> "2 of 2 real 402s" with the fork's 2x allowance noted; primary button below the 1440 fold on both pages; delivery-cut left-column hole (summary moved there).
Review r12b: B+ / A-, 8.5 min 8.0. Then fixed: "of" no longer mono; basis time in UTC like the fork; metric relabelled "Total overcharge"; toggle ring no longer lime. Left: delivery-cut card has ~140px under the button at 1440; Route decimals vary.
r11 FINAL (superseded, line kept): 8.5 min=8.0 round=11
FINAL: 8.5 min=8.0 round=12 critic=design-review review=/Users/kamal/Desktop/solana/cwf/tempo/projects/leash/apps/web/docs/design/review/design-audit-leash-r12.md
