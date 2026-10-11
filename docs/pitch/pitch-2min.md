# LEASH: 2-minute pitch (spoken)

**Problem (0:00-0:20)**
AI agents now pay for APIs by themselves. On Tempo, the seller states its price at the moment of payment, and the standard payment client pays whatever it is asked. Nobody checks that price against the one the seller advertised.

**Proof (0:20-0:50)**
We checked. On October 10, stablestudio listed an image call at 3.9 cents. When the request had no prompt, it asked for ten dollars, 256 times the listing. We saved that request and paid nothing. People are already reporting this on GitHub. One person was charged 450 dollars after approving 100. vet402, a service that buys from sellers to grade them, found that 42 of its 89 paid calls failed after the money had moved.

**Product (0:50-1:30)**
Leash puts limits on an agent's wallet. Quote-Cap compares the asking price with the listed price before the agent signs anything, and refuses anything above your limit. Route sends each call to the cheapest seller of the same service. Delivery Cut handles a vendor that takes the money and then fails: one signature from the owner removes it from the agent's key, the chain refuses its next charge, and the other vendors keep getting paid. We ran all of this on a copy of Tempo mainnet without spending real money.

**Why now (1:30-1:40)**
Agent payments on Tempo are new, the default tools have no price ceiling, and the complaints are already public.

**Positioning (1:40-2:00)**
Other teams see the same problem. vet402 grades sellers, and its report is part of our evidence. Fermata holds each payment until the seller proves it delivered. Cursus gives agents roles and budgets. Leash sits on the agent's own key. Sellers change nothing, a wrong price is refused before signing, and a bad vendor is cut with one signature.
