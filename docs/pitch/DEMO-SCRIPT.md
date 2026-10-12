# LEASH: demo script (2:50, max 3:00)

Live site https://leash-eiy.pages.dev, desktop 1440x900. Labels below match the live pages as of 12 Oct 2026, 07:20 IST (deploy after commit 3f48963). No real money moves at any point.

| # | Time | Shot / on screen | Action | Voiceover |
|---|---|---|---|---|
| 1 | 0:00-0:12 | `#/quote-cap` hero: "Your agent pays only the price you allow." | Page loaded, hold | "Agents pay for APIs on Tempo, and the default client pays whatever price the seller names. Leash checks that price first." |
| 2 | 0:12-0:30 | Quote card, "No prompt" selected: Listed price $0.039, The 402 asks $10.00, Most this agent will pay $0.039 | Point at the three rows | "This is a real price request from stablestudio. The listing says 3.9 cents. Without a prompt, it asked ten dollars, 256 times the listing. We saved it and paid nothing." |
| 3 | 0:30-0:42 | Same card | Click **Let the agent pay this quote** | "Refused before signing. No credential, no transaction, nothing to refund." |
| 4 | 0:42-1:02 | Quote card, Agent policy | Click **With prompt** ($0.07), press the button (refused at Exact), set *Allowed above the listing* to **2x**, press again | "A normal request asked 7 cents, almost twice the listing. At exact price it's refused. Allow 2x, and the agent pays." |
| 5 | 1:02-1:12 | "Before signing" / "If the check is bypassed" blocks | Slow scroll | "Two locks. The check runs before signing. If it's bypassed, the agent's key can only pay that vendor, up to a daily limit." |
| 6 | 1:12-1:30 | Route section: "The same API, from the cheapest seller", Largest saving 84% | Scroll, hover Firecrawl scrape ($0.002 vs $0.0126) | "Route. The same API sold by two sellers at different prices. With route turned on, the call goes to the cheapest listing, and that seller is held to its own price." |
| 7 | 1:30-1:52 | "Fork run 1 · Quote-Cap": 2 settled, 1 refused by Leash, 2 reverted by the chain | Scroll through steps 3 to 7 | "The same quotes on a local fork of Tempo mainnet. Two payments settle, the ten-dollar quote is refused, and when we force it, the chain reverts it. Paying a different vendor reverts too. These hashes exist only on the fork." |
| 8 | 1:52-2:10 | `#/delivery-cut` hero, "Paid, then failed 47%, 42 of 89 calls", fal card HTTP 422 | Click **Delivery Cut** in the nav, hold on the fal card | "Second problem: paid but not delivered. vet402 found 42 of 89 paid calls failed. Here fal asked 0.3 cents; the 402 is real, and the 422 failure comes from vet402's report." |
| 9 | 2:10-2:28 | fal card, then "Fork run 2 · Delivery Cut" | Click **Sign the cut**, scroll to the replayed transactions | "One signature removes fal from the agent's key. On the fork, fal's next charge reverts, and stablestudio still gets paid." |
| 10 | 2:28-2:42 | Evidence block: "A cut removes a payout address, not a brand." | Scroll, hold | "Honest caveat: fal shares its payout address with openai, firecrawl and nine other gateways, so this cut stops those too. The page says so." |
| 11 | 2:42-2:50 | Back to `#/quote-cap`, "Check it in 60 seconds: three clicks" | Click **Quote-Cap** in the nav, scroll to the judge steps | "Three clicks to check it yourself. Leash: your agent never pays more than the price on the menu." |
