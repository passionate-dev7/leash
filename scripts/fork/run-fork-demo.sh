#!/usr/bin/env bash
# LEASH Quote-Cap fork demo: Tempo mainnet fork (anvil --network tempo). NO real funds move.
# Output: out/fork-run.json (+ out/fork-run.log) for the UI.
set -uo pipefail; cd "$(dirname "$0")"
F=${FOUNDRY_BIN:-./.foundry-bin}; [ -x "$F/anvil" ] || ./setup-foundry.sh >/dev/null
PORT=${PORT:-8557}; R=http://127.0.0.1:$PORT; M=${LEASH_FORK_SOURCE_RPC:-https://rpc.mainnet.tempo.xyz}
T=0x20c000000000000000000000b9537d11c60e8b50     # USDC.e, the currency in stablestudio's real 402
SS=0x07F067959297767c887dbfA3C72379c66E82a045    # stablestudio recipient from its real 402
OTHER=0x1111111111111111111111111111111111111111 # some other vendor
FUNDER=${FUNDER:-0x1ec34cbcd685587f8015dcbf6c1b8665cc93d567} # real mainnet USDC.e holder, impersonated ON THE FORK ONLY to fund a fresh root
G="--gas-limit 5000000 --gas-price 0 --priority-gas-price 0"
LIMIT=${LIMIT:-200000}  # 0.20 USDC.e periodic limit for the agent key
"$F/anvil" --network tempo --fork-url $M --port $PORT --chain-id 4217 --base-fee 0 --gas-price 0 --no-priority-fee > out/anvil.log 2>&1 &
AP=$!; trap 'kill $AP 2>/dev/null' EXIT
for i in $(seq 1 60); do bn=$("$F/cast" block-number --rpc-url $R 2>/dev/null || echo 0); [ "$bn" -gt 1000 ] && break; kill -0 $AP 2>/dev/null || { echo "anvil exited, see out/anvil.log"; exit 1; }; sleep 1; done
[ "$bn" -gt 1000 ] || { echo "fork not ready"; exit 1; }
C(){ "$F/cast" "$@"; }
AGJ=$(C wallet new --json); AG=$(echo "$AGJ" | python3 -c "import sys,json;print((lambda d:(d['data'] if isinstance(d,dict) else d)[0])(json.load(sys.stdin))['address'])"); APK=$(echo "$AGJ" | python3 -c "import sys,json;print((lambda d:(d['data'] if isinstance(d,dict) else d)[0])(json.load(sys.stdin))['private_key'])")
RJ=$(C wallet new --json); ROOT=$(echo "$RJ" | python3 -c "import sys,json;print((lambda d:(d['data'] if isinstance(d,dict) else d)[0])(json.load(sys.stdin))['address'])"); RPK=$(echo "$RJ" | python3 -c "import sys,json;print((lambda d:(d['data'] if isinstance(d,dict) else d)[0])(json.load(sys.stdin))['private_key'])")
C rpc anvil_impersonateAccount $FUNDER --rpc-url $R >/dev/null
EV=out/events.jsonl; : > $EV
rec(){ # step label amount; cast output on stdin (raw kept in out/raw-<step>.txt)
  tee -a "out/raw-$1.txt" | python3 parse_receipt.py "$1" "$2" "$3" >> $EV
}
bal(){ C call $T 'balanceOf(address)(uint256)' $1 --rpc-url $R | cut -d' ' -f1; }
C send $T 'transfer(address,uint256)' $ROOT 20000000 --from $FUNDER --unlocked $G --rpc-url $R 2>&1 | rec fund "fork-only: fund fresh root with 20 USDC.e from impersonated holder" 20000000
B0_ROOT=$(bal $ROOT); B0_SS=$(bal $SS); FB=$(C block-number --rpc-url $R)
# (2) per-vendor spending-limit tx: agent key may only call USDC.e.transfer to stablestudio, with a periodic limit
C keychain authorize $AG secp256k1 --enforce-limits --limit "${T}:${LIMIT}" --scope "${T}:transfer@${SS}" --private-key $RPK $G --rpc-url $R 2>&1 | rec authorize "per-vendor limit: agent key -> USDC.e.transfer@stablestudio, limit ${LIMIT}" $LIMIT
RL0=$(C keychain rl $ROOT $AG $T --rpc-url $R 2>&1 | tail -1)
# (3) Quote-Cap replay of the real recorded 402 quotes, (1) paid call + refusal
python3 replay_quotes.py quotes.json > out/guard-decisions.txt
while IFS='|' read -r name amount verdict; do
  if [ "$verdict" = PASS ]; then
    C send $T 'transfer(address,uint256)' $SS $amount --tempo.access-key $APK --tempo.root-account $ROOT $G --rpc-url $R 2>&1 | rec "paid" "guard PASS: $name" $amount
  else
    echo "guard refused before signing" | rec "guard_refused" "guard REFUSE: $name ($verdict)" $amount
    C send $T 'transfer(address,uint256)' $SS $amount --tempo.access-key $APK --tempo.root-account $ROOT $G --rpc-url $R 2>&1 | rec "bypass_chain_refusal" "guard bypassed, agent key signs anyway: $name" $amount
  fi
done < out/guard-decisions.txt
C send $T 'transfer(address,uint256)' $OTHER 10000 --tempo.access-key $APK --tempo.root-account $ROOT $G --rpc-url $R 2>&1 | rec "scope_refusal" "agent key pays a different vendor 0.01" 10000
python3 enrich_reverts.py $R $EV
RL1=$(C keychain rl $ROOT $AG $T --rpc-url $R 2>&1 | tail -1)
python3 - <<P > out/fork-run.json
import json
ev=[json.loads(l) for l in open('out/events.jsonl')]
print(json.dumps({"kind":"anvil-tempo-mainnet-fork","forked_from":"$M","fork_block":$FB,"chain_id":4217,"anvil":"foundry v1.8.5 --network tempo",
 "note":"local fork; no real funds; root is a real mainnet USDC.e holder impersonated on the fork only; tx hashes exist only on this fork",
 "token":"$T","vendor":{"name":"stablestudio","recipient":"$SS","catalog_amount":39000},"root":"$ROOT","funder":"$FUNDER","agent_limit":$LIMIT,"agent_key":"$AG",
 "quotes_source":"quotes.json (real mainnet 402 challenges captured 2026-10-10 IST)",
 "remaining_limit_before":"$RL0","remaining_limit_after":"$RL1",
 "balances":{"root_before":"$B0_ROOT","root_after":"$(bal $ROOT)","stablestudio_before":"$B0_SS","stablestudio_after":"$(bal $SS)"},
 "events":ev},indent=1))
P
cat out/fork-run.json
