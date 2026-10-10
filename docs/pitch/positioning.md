# Positioning: LEASH vs Setra402 vs Rolepay

Source: /Users/kamal/Desktop/solana/cwf/docs/COMPETITORS.md (Tempo track). Only facts recorded there or in this repo.

| | LEASH | Setra402 | Rolepay |
|---|---|---|---|
| Pitch | Your agent never pays more than the listed price; cut vendors that take payment and fail | "Trust layer for agent payments" | Discord communities pay contributors in stablecoins on Tempo |
| Payer | AI agents paying MPP APIs | AI agents (per its pitch) | Humans (community admins) |
| Chain | Tempo (mainnet fork proof, Moderato testnet live spend desk) | Unknown, possibly Solana / x402 | Tempo |
| Public proof | Real stablestudio 402: $10.00 asked vs $0.039 listed, refused before signing; fork run with chain reverts; Delivery Cut on fal | Not verified by us | Not verified by us |
| Traction we saw | GitHub demand: mpp-specs#359, mpp#1034, mpp#840; X: @casaisdev, @prasanth_kuna, @jrcrypto_dev | 18 likes on launch post (x.com/510Sulove/status/2102234121171079449) | Unknown (x.com/filipebaleixo/status/2108676772212695189) |

**Against Setra402 (direct rival):** same theme, but LEASH shows a real overcharge from a live Tempo vendor refused before signing, and uses Tempo-native access keys (spending limits and recipient scopes) so the chain enforces the limit even if the check is bypassed. We have not verified Setra402's chain or product.

**Against Rolepay:** not a competitor for the same buyer. Rolepay moves money from people to people; LEASH controls money that software spends on its own.

**Limits we state openly:** chain proof is on a local anvil fork (hashes are local, revert reasons inferred); Route does not verify that sellers return equivalent output; the fal post-payment 422 comes from mpp#1034, not our own paid call.
