# Quote-Cap guard: refuse a 402 quote above catalog_amount*(1+tolerance). Decodes the real captured challenge when present.
import json,sys,base64
q=json.load(open(sys.argv[1])); cap=q['catalog_amount']*(1+q['tolerance_pct']/100)
for x in q['quotes']:
  a=x['amount']
  if x['request_b64']:
    s=x['request_b64']; d=json.loads(base64.urlsafe_b64decode(s+'='*(-len(s)%4))); assert int(d['amount'])==a; assert d['methodDetails']['chainId']==4217
  print(f"{x['name']}|{a}|{'PASS' if a<=cap else 'REFUSE (cap %d)'%cap}")
