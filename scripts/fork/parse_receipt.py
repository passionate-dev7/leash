# Parses `cast send` text output (stdin) into one JSON event line for out/events.jsonl
import sys,json,re
step,label,amt=sys.argv[1:4]; t=sys.stdin.read()
h=re.search(r'^transactionHash\s+(0x[0-9a-fA-F]{64})',t,re.M); s=re.search(r'^status\s+(\S+)',t,re.M); g=re.search(r'^gasUsed\s+(\d+)',t,re.M)
e=re.search(r'revertReason\s+(.*)',t) or re.search(r'(Error:[^\n]*)',t)
err=e.group(1).strip() if e else None
names={'0x8a9e71ea':'SpendingLimitExceeded','0x576b38b4':'CallNotAllowed','0x54cfe659':'PolicyForbids'}
if err:
  for k,v in names.items():
    if k in err: err=v+' ('+k+') '+err
ok=bool(h and s and s.group(1).lower() in('true','0x1','1'))
status="success" if ok else ("reverted_onchain" if h else ("rejected_before_inclusion" if err else "not_sent"))
print(json.dumps({"step":step,"label":label,"amount":int(amt) if amt.isdigit() else None,"tx":h.group(1) if h else None,"status":status,"gasUsed":int(g.group(1)) if g else None,"error":err}))
