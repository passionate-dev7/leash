# LEASH demo walkthrough (target 2:45, max 3:00)

Viewport 1440x900. Live site https://leash-eiy.pages.dev. Recorded by `record-demo.mjs`.

| Time | On screen | Action | Voiceover |
|---|---|---|---|
| 0:00-0:15 | `#/quote-cap` hero | Page loads, pause | "Agents pay APIs on Tempo, and the default client pays whatever price the seller asks. LEASH checks that price first." |
| 0:15-0:40 | Quote check card, "No prompt" selected | Hover the three rows: Listed $0.039, 402 asks $10.00 | "This is a real price request from stablestudio. Listed at 3.9 cents, it asked for ten dollars when the prompt was missing. We captured it and paid nothing." |
| 0:40-0:55 | Same card | Click "Let the agent pay this quote" | "Refused before signing. No credential, no transaction." |
| 0:55-1:15 | Policy toggles | Select "With prompt", set "Allowed above the listing" to 2x, click the button | "A normal request asked 7 cents. With a 2x tolerance it fits, so the agent pays." |
| 1:15-1:40 | Scroll to Route and fork proof sections | Slow scroll | "Route picks the cheapest seller of the same API. Below, the same quotes run on a local fork of Tempo mainnet: paid calls settle, the ten-dollar bypass and an off-list vendor revert on chain. Those hashes exist only on the fork, and the revert reasons are inferred." |
| 1:40-2:05 | `#/delivery-cut` | Navigate, pause on the failed call | "Delivery Cut. fal asked 0.3 cents for an image; a public bug report, mpp issue 1034, shows fal settling these calls and then answering 422." |
| 2:05-2:25 | Same page | Click "Sign the cut" | "One signature from the owner removes fal from the agent's key. On the fork, fal's next charge fails and stablestudio is still paid." |
| 2:25-2:40 | Shared payout note | Scroll to the caveat | "Honest caveat: fal shares a payout address with other endpoints, so this cut stops those too. LEASH shows that before you sign." |
| 2:40-2:50 | Back to `#/quote-cap` top | Navigate | "LEASH: your agent never pays more than the price on the menu." |
