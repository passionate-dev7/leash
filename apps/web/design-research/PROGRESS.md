# LEASH UI redesign progress (resume from here)

- r1-r5: refs (govuk, wise, mpp, tempo, uniswap) + DNA/REFERENCES.md, COMPONENTS.md (shadcn toggle-group/button/separator via uicraft add), uicraft read with research, design-review r2-r5 (r5: B+/A-, avg 8.2, mobile 6.5).
- r6 (10 Oct 2026): decision card follows the H1 on mobile on both pages, lower left columns filled (fork limits, route summary), selected chips outlined instead of solid ink, policy toggles 44px, 34px mobile H1.
- design-review r6: B+/A-, avg 8.3, min 7.0 (docs/design/review/design-audit-leash-r6.md). CRITIQUE.md FINAL line written.
- gate: docs/design/review/gate-r6.txt, exit 0. Tests: docs/design/review/tests-r6.txt, all green.
- Next (non-blocking r6 findings): sticky mobile CTA below md; delivery-cut left gap at 1440 (row-span-2); soften "this one cut stops all three"; red use on delivery-cut.
- Shots: docs/design/review/shots-r6 via `node design-research/shots.cjs <base> <prefix>` (Playwright; deepsurge was wedged).
