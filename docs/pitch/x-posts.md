# Build-in-public X posts (as kamal)

1.
Asked an MPP API on Tempo for an image. Catalog price: $0.039. Its 402 asked for $10.00 because my prompt was missing. Default clients would sign that.

Building LEASH for Colosseum's World's Fair. It refuses any quote above the listed price before the agent signs. Paid nothing.

2.
LEASH update: ran the price check on a Tempo mainnet fork. The $0.07 quote got paid, the $10.00 quote was refused before signing, and a forced $10 payment reverted on chain against a $0.20 key limit.

Fork only, local hashes, reverts inferred.
leash-eiy.pages.dev

3.
Agents pay first, then learn if the API delivered. mpp#1034 logged 42 of 89 paid calls failing after payment.

New in LEASH: Delivery Cut. One signature cuts a vendor; the chain refuses its next charge. Catch: a shared payout address cuts sibling endpoints too. We show that.
