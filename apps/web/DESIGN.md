---
name: leash-receipt-printer
description: "Receipt printer / spend terminal. Source: cwf/docs/DESIGN-DIRECTIONS.md (LEASH). Replaces the earlier IBM Carbon file."
---

Fonts: Geist (UI), Geist Mono (amounts, tabular). Palette: paper #F7F7F5, ink #111111, hairline #E4E4E0, refuse red #D92D20 only for a refusal, allow green #12B76A only for an allow. No blue.
Sizes: 32 / 20 / 16 / 14 / 12. Weights 400 and 600. One radius: 0.
Layout: left policy rail (settings sheet) + vertical stream of 402 quotes.
Signature: the receipt (src/pages/quotecap.tsx Receipt): narrow mono slip, perforated edges, listed / ceiling / asked, stamped REFUSED or PAID.
Banned: Carbon tab bar, full-bleed colored verdict panels, light-weight display headlines, colored left-border cards, gradients, blur, shadows.
