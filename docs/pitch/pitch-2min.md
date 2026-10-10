# LEASH: 2-minute pitch (spoken, about 290 words)

**Problem (0:00-0:25)**
AI agents now pay for APIs on their own. On Tempo, a seller tells the agent its price at the moment of payment, and the standard client simply pays whatever it is asked. Nobody checks that number against the price the seller advertised.

**Proof (0:25-0:55)**
We checked. On October 10, stablestudio listed an image call at 3.9 cents. When the request was missing its prompt, it asked for ten dollars. That is 256 times the listing. We captured the request and paid nothing. Across 273 live price requests we read, 13 did not match their listing. And builders are already saying this out loud: one GitHub issue describes being charged 450 dollars when 100 was authorized, and another buyer measured 42 of 89 paid calls failing after the money had already moved.

**Product (0:55-1:30)**
LEASH is a leash for an agent's wallet. First, Quote-Cap: before the agent signs anything, LEASH compares the asking price with the listed price and refuses anything above your limit. Second, Route: when several sellers offer the same API, LEASH picks the cheapest. Third, Delivery Cut: when a vendor takes payment and fails to deliver, one signature from the owner cuts that vendor off, and the chain itself refuses its next charge while healthy vendors keep getting paid. Behind the check sits an on-chain spending limit, so even a bypassed check cannot overspend. We showed all of this on a fork of Tempo mainnet.

**Why now (1:30-1:40)**
Agent payments on Tempo are new, the default tools have no price ceiling, and the complaints are already public.

**Positioning (1:40-2:00)**
Other teams here see the same problem. vet402 buys from sellers with its own money and publishes who delivered; its report is part of our evidence. Fermata holds each payment in escrow until a delivery proof. Cursus gives organizations roles and budgets for agents. LEASH is the piece on the agent's own wallet: it needs nothing from the vendor, refuses a wrong price before signing, and cuts a bad vendor with one signature that the chain enforces.
