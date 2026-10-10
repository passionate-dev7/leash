# LEASH web: design (v2, 2026-10-10)

Read: "quote check for teams whose AI agents pay APIs over MPP, calm receipt-and-checkout" (uicraft read, dials 4/3/3, see .uicraft-read.json).
References: docs/design/REFERENCES.md (Wise calculator north star, Uniswap swap card, GOV.UK check answers).

- Type: Geist for everything. Geist Mono ONLY on amounts and hashes (`.num`).
- Sizes: 44 display, 28 section, 20 result, 18 lead, 16 body, 14 secondary, 12 hashes only. Nothing under 12px.
- Palette: paper #f7f7f5 / #ffffff, ink #111111, muted ink #55554f, hairline #e4e4e0. Red #d92d20 / #b42318 only for a refusal, green #067647 only for a settlement.
- Radius 0 everywhere. No shadows, blur, gradients.
- Layout: split hero (claim left, quote check card right), then calm two-column sections with 96-128px between them.
- One primary action per page: Quote-Cap "Let the agent pay this quote"; Delivery Cut "Sign the cut". Nav "Create a team" is a text link, not a button.
- Components: shadcn/ui ToggleGroup, Button, Separator (see docs/design/COMPONENTS.md), restyled to these tokens.
- Banned: mono paragraphs, gray text under 12px, rotated stamps, perforation svgs, decorative receipts, more than one filled button in view.
