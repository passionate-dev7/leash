# LEASH UI redesign progress (resume from here)

- r1-r5: refs (govuk, wise, mpp, tempo, uniswap) + DNA/REFERENCES.md, COMPONENTS.md (shadcn toggle-group/button/separator via uicraft add), uicraft read with research, design-review r2-r5 (r5: B+/A-, avg 8.2, mobile 6.5).
- r6 (10 Oct 2026): decision card follows the H1 on mobile on both pages, lower left columns filled (fork limits, route summary), selected chips outlined instead of solid ink, policy toggles 44px, 34px mobile H1.
- design-review r6: B+/A-, avg 8.3, min 7.0 (docs/design/review/design-audit-leash-r6.md). CRITIQUE.md FINAL line written.
- gate: docs/design/review/gate-r6.txt, exit 0. Tests: docs/design/review/tests-r6.txt, all green.
- Next (non-blocking r6 findings): sticky mobile CTA below md; delivery-cut left gap at 1440 (row-span-2); soften "this one cut stops all three"; red use on delivery-cut.
- Shots: docs/design/review/shots-r6 via `node design-research/shots.cjs <base> <prefix>` (Playwright; deepsurge was wedged).
- Deployed r6 to https://leash-eiy.pages.dev (deployment 72c01d60) after gate exit 0; live verification shots in docs/design/review/shots-live-r6; PRODUCTS.md updated.
- r7 (10-11 Oct 2026): sticky mobile CTA (both pages), delivery-cut gap fixed, amber vendor failure, shared-address caveat sourced to probe-all402.json (3 Oct), business model + Setra402/Rolepay + judge steps on #/quote-cap and README. design-review r7 B+/A- 8.2/7.5; gate-r7.txt; tests-r7.txt.
