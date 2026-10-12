# LEASH: pitch script (Colosseum brief, max 2 minutes)

Brief: "tell us what you're building, and tell us why you're the people to build it. Nothing fancy required. We're interested in how you think and communicate."

---

Hi, I'm Kamal, and I'm building Leash.

AI agents now pay for APIs on their own. On Tempo, they use MPP: the seller replies with a price, and the agent's wallet pays it. The standard client pays whatever price the seller names. Nobody checks it.

So I checked. On October 10, stablestudio listed an image call at 3.9 cents. I sent a request without a prompt, and it asked for ten dollars. That's 256 times the listed price. I saved the request and paid nothing. Overcharging isn't the only problem. Another team, vet402, reported that 42 of its 89 paid calls on Tempo took the money and then failed.

Leash is a spend guard for these agents. It does three things. First, before the agent signs anything, it compares the asking price with the listed price, and refuses anything above your limit. Second, when several sellers offer the same API, it sends the call to the cheapest one. Third, when a vendor takes the money and doesn't deliver, one signature removes that vendor from the agent's key. The chain refuses its next charge, and the good vendors keep getting paid.

Why me? I started building on Tempo's agent keys in September, so the cut-off part existed before this hackathon. For the World's Fair, I didn't want to guess at a problem. I pulled real price requests from live sellers, read the public bug reports, and built against those. I ran everything on a copy of Tempo mainnet, without spending real money. And I keep a written audit of what works and what doesn't. Where something is only partly proven, like the exact reason the chain gives for a refusal, I say so.

That's how I'll keep building it: real data first, honest about the gaps.

Try it at leash-eiy.pages.dev. Thanks.
