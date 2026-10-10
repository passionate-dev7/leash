#!/usr/bin/env python3
"""scripts/fork/out/delivery-cut.json -> apps/web/public/delivery-cut-proof.json for the Delivery Cut page."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
d = json.loads((root / 'scripts/fork/out/delivery-cut.json').read_text())
usd = lambda a: f"${a/1e6:.3f}" if a else ''
LABEL = {'fund': 'Fund a fresh team account with 20 USDC.e (fork only)',
 'authorize': 'Authorize agent key: USDC.e transfer to fal and stablestudio, limit $1.00',
 'pay_fal': 'Agent pays fal $0.003, the amount in fal\'s real 402 for an empty-body FLUX call: settles',
 'pay_ss': 'Agent pays stablestudio $0.039: settles, image delivered',
 'cut': 'One root signature cuts fal from the agent key (AccountKeychain.setAllowedCalls)',
 'fal_next_charge': 'fal\'s next $0.003 charge: the chain refuses',
 'ss_after_cut': 'stablestudio after the cut: still paid'}
INFER = {'fal_next_charge': 'CallNotAllowed (inferred: recipient removed from key scope; the same transfer succeeded before the cut)'}
STATUS = {'success': 'success', 'reverted_onchain': 'reverted on chain'}
f = d['failure_pattern']
out = {'label': d['label'], 'fork': d['forked_from'], 'chainId': d['chain_id'], 'block': d['fork_block'],
 'vendor': {'name': 'fal', 'origin': f['origin'], 'endpoint': f['endpoint'], 'recipient': f['challenge']['recipient'], 'quoted': f['challenge']['amount']},
 'failure': {'status': f['post_payment_response']['status'], 'body': f['post_payment_response']['body'], 'source': f['post_payment_response']['source'], 'note': f['post_payment_response']['note']},
 'caveat': f['caveat'], 'decisions': d['decisions'], 'balances': d['balances'],
 'steps': [{'step': e['step'], 'label': LABEL.get(e['step'], e['label']), 'status': STATUS.get(e['status'], e['status']), 'tx': e.get('tx'),
            'error': INFER.get(e['step']) if e['status'] == 'reverted_onchain' else e.get('error')} for e in d['events']]}
(root / 'apps/web/public/delivery-cut-proof.json').write_text(json.dumps(out, indent=1) + '\n')
print('wrote apps/web/public/delivery-cut-proof.json')
