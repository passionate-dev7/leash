#!/usr/bin/env python3
"""scripts/fork/out/fork-run.json -> apps/web/public/fork-proof.json for the Quote-Cap page."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
d = json.loads((root / 'scripts/fork/out/fork-run.json').read_text())
usd = lambda a: f"${a/1e6:.3f}".rstrip('0').rstrip('.') if a is not None else ''
INFER = {'bypass_chain_refusal': 'SpendingLimitExceeded (inferred: $10.00 > $0.20 key limit)', 'scope_refusal': 'CallNotAllowed (inferred: recipient not in key scope)'}
STATUS = {'success': 'success', 'reverted_onchain': 'reverted on chain', 'not_sent': 'refused, nothing signed'}
LABEL = {
  'fund': lambda e: 'Fund a fresh team account with 20 USDC.e (fork only)',
  'authorize': lambda e: f"Authorize agent key: USDC.e transfer to stablestudio only, limit {usd(e['amount'])}",
  'paid': lambda e: f"Quote-Cap passes {usd(e['amount'])} quote, agent pays stablestudio",
  'guard_refused': lambda e: f"Quote-Cap refuses the {usd(e['amount'])} quote (listed $0.039): no transaction signed",
  'bypass_chain_refusal': lambda e: f"Guard bypassed, agent key signs {usd(e['amount'])} anyway: the chain refuses",
  'scope_refusal': lambda e: f"Agent key tries to pay a different vendor {usd(e['amount'])}: the chain refuses",
}
steps = [{'step': e['step'], 'label': LABEL.get(e['step'], lambda e: e['label'])(e), 'status': STATUS.get(e['status'], e['status']),
          'tx': e.get('tx'), 'error': INFER.get(e['step']) if e['status'] == 'reverted_onchain' else e.get('error')} for e in d['events']]
out = {'fork': d['forked_from'], 'chainId': d['chain_id'], 'block': d['fork_block'], 'note': d['note'],
       'limitBefore': d['remaining_limit_before'], 'limitAfter': d['remaining_limit_after'], 'balances': d['balances'], 'steps': steps}
(root / 'apps/web/public/fork-proof.json').write_text(json.dumps(out, indent=1) + '\n')
print('wrote apps/web/public/fork-proof.json', len(steps), 'steps')
