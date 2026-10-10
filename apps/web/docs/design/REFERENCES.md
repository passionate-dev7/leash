# LEASH v2 references (hallmark study, URL mode)

Captured 2026-10-10 18:15-18:45 IST with `design-research/refshot-pw.cjs` (Playwright port of ui-craft refshot.py; bhn deepsurge hung on this Mac). Tokens are measured computed styles from each live page, not guesses. Ten references are logged in `apps/web/design-research/REFS.md`; the three DNA cards below drive the build. Negative reference: `negative-leash-v1-1440.png` / `negative-leash-v1-390.png` (the v1 page Kamal scored 6.0).

## DNA card 1: Wise send-money calculator (north star)
Shots: ref-wise-1440.png, ref-wise-390.png, tokens ref-wise-tokens.json. URL https://wise.com/gb/pricing/send-money
- macrostructure: split hero, copy left, live tool right; hero H2-Split, pitch = the tool itself
- display_role: heavy display sans (Wise Sans 89px w900); body_role: neutral grotesque (Inter 18px); label_role: none
- pairing_logic: two families; paper_band light >85, paper rgb(255,255,255); accent green rgb(159,232,112) flood >15%
- signature move: the two money amounts (you send / they get) are the largest type inside the card (~40px), fees are labelled rows beneath, one primary button ends the card
- take: price rows + one action per card. leave: lime flood, w900 display, pill radius 9999px

## DNA card 2: Uniswap swap card
Shots: ref-uniswap-1440.png, ref-uniswap-390.png, tokens ref-uniswap-tokens.json. URL https://app.uniswap.org/swap
- macrostructure: single tool, centred; nav N1 thin top bar; no footer above the fold
- display_role: none (the amount is the display: Basel 36px w485); body Basel 16px / 24px
- paper rgb(255,255,255), accent pink, footprint small, used only on the primary button
- signature move: one card, one decision, one full-width primary button; the quote lives inside the card
- take: full-width primary button that closes the card; empty state as a value. leave: pink, token pills, centring the whole page

## DNA card 3: GOV.UK check answers
Shots: ref-govuk-1440.png, ref-govuk-390.png, tokens ref-govuk-tokens.json. URL https://design-system.service.gov.uk/patterns/check-answers/
- macrostructure: docs column; summary list of key / value rows, then one action
- display GDS Transport 48px / 50px w700; body 19px / 25px; button rgb(15,122,82) radius 0px
- paper rgb(244,248,251), neutral-cool; accent green footprint small
- signature move: check before you commit; label left, value right, generous row height, square buttons
- take: 16-19px body, square controls, key/value rows with air. leave: GOV.UK blue chrome and crown

Supporting domain refs (shots + tokens here too): ref-tempo-* (Pilat 53px, near-white rgb(245,245,245), one black button) and ref-mpp-* (Geist / Geist Mono, mono only for terminal output).

## What LEASH v2 takes
A Wise-style split: claim left, the quote check card right. Inside the card: listed price, the 402's ask (28px mono, red when refused), the agent's ceiling, then the policy controls and ONE full-width primary button "Let the agent pay this quote". Everything below the fold is calm two-column prose sections. Mono only on amounts and hashes. Radius 0. No text under 12px.
