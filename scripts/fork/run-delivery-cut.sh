#!/usr/bin/env bash
# LEASH Delivery Cut fork demo. LOCAL ANVIL FORK of Tempo mainnet only (anvil --network tempo). NO real funds move.
# Replays a real third-party failure pattern (delivery/failure.json): fal.mpp.tempo.xyz quotes 0.003 USDC.e for an
# empty-body FLUX request (real captured 402), settles, then answers 422 (tempoxyz/mpp#1034, vet402).
# Output: out/delivery-cut.json for the UI.
set -uo pipefail; cd "$(dirname "$0")"
F=${FOUNDRY_BIN:-./.foundry-bin}; [ -x "$F/anvil" ] || ./setup-foundry.sh >/dev/null
PORT=${PORT:-8558}; R=http://127.0.0.1:$PORT; M=${LEASH_FORK_SOURCE_RPC:-https://rpc.mainnet.tempo.xyz}
T=0x20c000000000000000000000b9537d11c60e8b50
FAL=0xca4e835F803cB0b7C428222B3A3B98518d4779Fe   # fal.mpp.tempo.xyz recipient from its real 402
SS=0x07F067959297767c887dbfA3C72379c66E82a045    # stablestudio recipient from its real 402 (keeps delivering)
FUNDER=${FUNDER:-0x1ec34cbcd685587f8015dcbf6c1b8665cc93d567}
G="--gas-limit 5000000 --gas-price 0 --priority-gas-price 0"
FAL_AMT=$(python3 -c "import json;print(json.load(open('delivery/failure.json'))['challenge']['amount'])")
mkdir -p out/dc; rm -f out/dc/*
"$F/anvil" --network tempo --fork-url $M --port $PORT --chain-id 4217 --base-fee 0 --gas-price 0 --no-priority-fee > out/dc/anvil.log 2>&1 &
AP=$!; trap 'kill $AP 2>/dev/null' EXIT
for i in $(seq 1 60); do bn=$("$F/cast" block-number --rpc-url $R 2>/dev/null || echo 0); [ "$bn" -gt 1000 ] && break; kill -0 $AP 2>/dev/null || { echo "anvil exited"; exit 1; }; sleep 1; done
[ "$bn" -gt 1000 ] || { echo "fork not ready"; exit 1; }
C(){ "$F/cast" "$@"; }
nw(){ C wallet new --json | python3 -c "import sys,json;d=json.load(sys.stdin);d=(d['data'] if isinstance(d,dict) else d)[0];print(d['address'],d['private_key'])"; }
read AG APK <<<"$(nw)"; read ROOT RPK <<<"$(nw)"
C rpc anvil_impersonateAccount $FUNDER --rpc-url $R >/dev/null
EV=out/dc/events.jsonl; : > $EV
rec(){ tee -a "out/dc/raw-$1.txt" | python3 parse_receipt.py "$1" "$2" "$3" >> $EV; }
bal(){ C call $T 'balanceOf(address)(uint256)' $1 --rpc-url $R | cut -d' ' -f1; }
C send $T 'transfer(address,uint256)' $ROOT 20000000 --from $FUNDER --unlocked $G --rpc-url $R 2>&1 | rec fund "fork-only: fund fresh root with 20 USDC.e from impersonated holder" 20000000
FB=$(C block-number --rpc-url $R); B0_FAL=$(bal $FAL); B0_SS=$(bal $SS)
SC="[{\"target\":\"$T\",\"selectors\":[{\"selector\":\"transfer\",\"recipients\":[\"$FAL\",\"$SS\"]}]}]"
C keychain authorize $AG secp256k1 --enforce-limits --limit "${T}:1000000" --scopes "$SC" --private-key $RPK $G --rpc-url $R 2>&1 | rec authorize "agent key: USDC.e.transfer to fal + stablestudio, limit 1.00" 1000000
# 1. the agent pays fal's real quote; it settles
P1=$(C send $T 'transfer(address,uint256)' $FAL $FAL_AMT --tempo.access-key $APK --tempo.root-account $ROOT $G --rpc-url $R 2>&1); echo "$P1" | rec pay_fal "agent pays fal 0.003 (real 402 quote, empty body)" $FAL_AMT
P2=$(C send $T 'transfer(address,uint256)' $SS 39000 --tempo.access-key $APK --tempo.root-account $ROOT $G --rpc-url $R 2>&1); echo "$P2" | rec pay_ss "agent pays stablestudio 0.039 (delivered)" 39000
H1=$(echo "$P1" | awk '/^transactionHash/{print $2}'); H2=$(echo "$P2" | awk '/^transactionHash/{print $2}')
# 2. vendor answers after settlement: replay the recorded fal outcome (422) and a delivered stablestudio call
python3 - "$H1" "$H2" "$FAL_AMT" <<'P' > out/dc/outcomes.json
import json,sys
f=json.load(open('delivery/failure.json'))
print(json.dumps([{"vendor":"stablestudio","recipient":"0x07F067959297767c887dbfA3C72379c66E82a045","amount":"39000","settlementTx":sys.argv[2] or None,"status":200},
 {"vendor":"fal","recipient":f['challenge']['recipient'],"amount":sys.argv[3],"settlementTx":sys.argv[1] or None,"status":f['post_payment_response']['status'],"body":f['post_payment_response']['body']}]))
P
(cd ../../packages/sdk && node_modules/.bin/tsx ../../scripts/fork/delivery/judge.ts ../../scripts/fork/out/dc/outcomes.json $AG $T "$FAL,$SS") > out/dc/judge.json
python3 -c "import json;d=json.load(open('out/dc/judge.json'));json.dump(d['decisions'],open('out/dc/decisions.json','w'))"
# 3. ONE root signature: the SDK's planDeliveryCuts calldata (AccountKeychain.setAllowedCalls without fal), sent as one tx
NCALLS=$(python3 -c "import json;d=json.load(open('out/dc/judge.json'));print(sum(len(c['plan']['calls']) for c in d['cuts']))")
[ "$NCALLS" = 1 ] || { echo "expected exactly 1 cut call, got $NCALLS"; exit 1; }
read CTO CDATA <<<"$(python3 -c "import json;c=json.load(open('out/dc/judge.json'))['cuts'][0]['plan']['calls'][0];print(c['to'],c['data'])")"
C send $CTO $CDATA --private-key $RPK $G --rpc-url $R 2>&1 | rec cut "ONE root signature: cut fal (AccountKeychain.setAllowedCalls without 0xca4e...79Fe, planned by @leash/sdk)" 0
SCOPE_AFTER=$(C keychain check $ROOT $AG --rpc-url $R 2>&1 | tr '\n' ' ' | cut -c1-600)
# 4. fal's next charge is refused by the chain; stablestudio still works
C send $T 'transfer(address,uint256)' $FAL $FAL_AMT --tempo.access-key $APK --tempo.root-account $ROOT $G --rpc-url $R 2>&1 | rec fal_next_charge "fal's next charge after the cut" $FAL_AMT
C send $T 'transfer(address,uint256)' $SS 39000 --tempo.access-key $APK --tempo.root-account $ROOT $G --rpc-url $R 2>&1 | rec ss_after_cut "stablestudio after the cut (still allowed)" 39000
python3 enrich_reverts.py $R $EV
python3 - <<P > out/delivery-cut.json
import json
ev=[json.loads(l) for l in open('out/dc/events.jsonl')]
print(json.dumps({"kind":"anvil-tempo-mainnet-fork","label":"LOCAL FORK ONLY - not mainnet, no real funds, tx hashes exist only on this fork","forked_from":"$M","fork_block":$FB,"chain_id":4217,
 "failure_pattern":json.load(open('delivery/failure.json')),"root":"$ROOT","agent_key":"$AG","key_check_after_cut":"""$SCOPE_AFTER""","cut_plan":json.load(open('out/dc/judge.json'))['cuts'],"outcomes":json.load(open('out/dc/outcomes.json')),"decisions":json.load(open('out/dc/decisions.json')),
 "balances":{"fal_before":"$B0_FAL","fal_after":"$(bal $FAL)","stablestudio_before":"$B0_SS","stablestudio_after":"$(bal $SS)"},"events":ev},indent=1))
P
python3 -c "import json;[print(e['step'],e['status'],e.get('error'),e['tx']) for e in json.load(open('out/delivery-cut.json'))['events']]"
