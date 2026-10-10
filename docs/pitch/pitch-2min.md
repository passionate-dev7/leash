# LEASH: 2-minute pitch (spoken, about 290 words)

**Problem (0:00-0:25)**
AI agents now pay for APIs on their own. On Tempo, a seller tells the agent its price at the moment of payment, and the standard client simply pays whatever it is asked. Nobody checks that number against the price the seller advertised.

**Proof (0:25-0:55)**
We checked. On October 10, stablestudio listed an image call at 3.9 cents. When the request was missing its prompt, it asked for ten dollars. That is 256 times the listing. We captured the request and paid nothing. Across 273 live price requests we read, 13 did not match their listing. And builders are already saying this out loud: one GitHub issue describes being charged 450 dollars when 100 was authorized, and another buyer measured 42 of 89 paid calls failing after the money had already moved.

**Product (0:55-1:30)**
LEASH is a leash for an agent's wallet. First, Quote-Cap: before the agent signs anything, LEASH compares the asking price with the listed price and refuses anything above your limit. Second, Route: when several sellers offer the same API, LEASH picks the cheapest. Third, Delivery Cut: when a vendor takes payment and fails to deliver, one signature from the owner cuts that vendor off, and the chain itself refuses its next charge while healthy vendors keep getting paid. Behind the check sits an on-chain spending limit, so even a bypassed check cannot overspend. We showed all of this on a fork of Tempo mainnet.

**Why now (1:30-1:45)**
Agent payments on Tempo are new, the default tools have no price ceiling, and the complaints are already public. This is the moment to set the safe default.

**Positioning (1:45-2:00)**
Setra402 also pitches trust for agent payments, but we could not confirm its chain or show its proof. Rolepay pays human contributors in Discord. LEASH is built on Tempo's own spending keys, and its proof is a real ten-dollar quote, refused.
