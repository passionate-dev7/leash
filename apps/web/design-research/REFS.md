# LEASH research references (captured 2026-10-10 18:15-18:45 IST)

Capture: `design-research/refshot-pw.cjs`, a Playwright port of ui-craft `scripts/refshot.py` (same junk refusals and TOKENS_JS). The bhn deepsurge capture hung on this Mac, so it was replaced. Tokens: `refs/<name>-1440.tokens.json`. ramp.com timed out twice and was replaced by lithic.com.
North star: Wise send-money calculator. Secondaries: Uniswap swap card, GOV.UK check-answers.

## Wise: send-money pricing calculator (north star)
Screen: the pricing page with the live calculator card on the right: "You send 25,000.00 GBP / Recipient gets 29,438.04 EUR", then fee lines (paying with, arrives, total fees) and one green "Send money now" button. Move worth stealing: the amount you pay and the amount that arrives are the two biggest numbers in the card, around 40px, and every fee is a labelled line beneath them, so the price is checked before you commit. h2 Inter 45.46px, tracking -1.36px, leading 57px. Pill buttons 9999px. Numbers are the hero, and there is one primary action per card. Do NOT take: the lime #9FE870 flood, the 89px weight-900 display headline, or pill radii (our radius is 0).
PNG: refs/wise-1440.png, refs/wise-390.png

## Uniswap: swap card (secondary)
Screen: app.uniswap.org/swap. A single centred card with Sell / Buy fields, a 36px placeholder amount (Basel 36px, weight 485, rgba(19,19,19,.35)), a swap arrow, and one full-width pink primary button "Get started". Move worth stealing: the whole screen is one decision with one button; the quote sits inside the card and nothing else competes. Empty state is a 0 at 36px rather than a message. Do NOT take: the pink, the centred-on-blank layout for the whole page, or the token pills.
PNG: refs/uniswap-1440.png, refs/uniswap-390.png

## GOV.UK Design System: check answers pattern (secondary)
Screen: design-system.service.gov.uk/patterns/check-answers. A summary list of key / value rows with "Change" links, then one green primary button (rgb(15,122,82), 19px GDS Transport, 0px radius). h1 48px / leading 50px, body 19px / leading 25px on rgb(244,248,251). Move worth stealing: generous 19px body, one action per page, rows that read like a receipt: label left, value right, plenty of air. Square buttons with a 2px bottom shadow. Do NOT take: the GOV.UK blue chrome, the crown header, or the cookie banner.
PNG: refs/govuk-1440.png, refs/govuk-390.png

## mpp.dev: the protocol home (domain)
Screen: mpp.dev landing with a terminal block "MPP TERMINAL" showing an agent paying. Geist Variable h1 48px weight 400, tracking -1.44px, leading 48px on rgb(16,16,16); paragraphs in Geist Mono 14px oklch(0.58 0 0). Move worth stealing: Geist + Geist Mono is the native type of this ecosystem; mono reserved for terminal output. Primary action is a bordered mono button. Do NOT take: the dark flood and the ASCII rain background, and do not set paragraphs in mono (Kamal's complaint).
PNG: refs/mpp-1440.png, refs/mpp-390.png

## Tempo: chain home (domain)
Screen: tempo.xyz hero. Pilat h1 53.33px weight 500, tracking -2.13px, leading 50.67px, on rgb(245,245,245); body 16px / 22px rgb(67,67,67). One black primary button "Talk with our team" beside a quiet secondary. Move worth stealing: near-white paper, near-black type, one black button, very little else; payment infrastructure tone. Do NOT take: the photographic band or the logo wall.
PNG: refs/tempo-1440.png, refs/tempo-390.png

## Stripe Docs: build a payments page (domain)
Screen: docs.stripe.com/payments/checkout. Left nav, h1 32px weight 700 leading 40px rgb(26,31,54), body 14px / 20px rgb(65,69,82), buttons radius 8px. Move worth stealing: the content column is narrow and calm, code appears only where code is the point, and figures are captioned. Do NOT take: system-ui fonts, the dense left nav, or 14px body (we keep 16px).
PNG: refs/stripe-1440.png, refs/stripe-390.png

## Rabby: wallet home (domain, transaction preview genre)
Screen: rabby.io landing. Download button 16px SF Pro weight 500, rgb(76,101,255) on white, radius 12px, page bg rgb(250,251,252). Move worth stealing: the wallet genre's promise, "see what you sign before you sign", which is exactly Quote-Cap's job. Do NOT take: the gradient headline highlight, the blue, the rabbit mascot.
PNG: refs/rabby-1440.png, refs/rabby-390.png

## Privacy.com: virtual cards with spend limits (domain)
Screen: privacy.com home. Inter h1 80px weight 800, tracking -1.6px; testimonial p 12px weight 600 rgb(130,130,153). Move worth stealing: the product idea (a merchant-locked card with a limit) maps to a merchant-scoped access key. Do NOT take: 80px weight-800 heroes, purple, 12px gray text (Kamal flagged sub-12px gray), the floating card render.
PNG: refs/privacy-1440.png, refs/privacy-390.png

## Lithic: card issuing platform (domain)
Screen: lithic.com hero. ABC Monument Grotesk h1 64px weight 500, tracking -1.28px, leading 64px; h2 32px / 38.4px; body 16px / 22.4px. Move worth stealing: one grotesque at two weights, tight negative tracking on display only, 16px body with 1.4 leading. Do NOT take: the dark hero with orange glow or the card render.
PNG: refs/lithic-1440.png, refs/lithic-390.png

## Flighty: flight tracker (outside domain: a promise checked against reality)
Screen: flighty.com home: the app shows the scheduled time beside the real one ("Landed in New York, 22m early") as a plain status line. h1 65px weight 700, tracking -1px, leading 78px. Move worth stealing: promised vs actual shown as one sentence with the delta, not a chart; status words carry the colour. Do NOT take: system-ui, the phone mock, or the cookie modal.
PNG: refs/flighty-1440.png, refs/flighty-390.png
