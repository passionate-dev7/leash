# For events reverted on chain, fetch the revert data via debug_traceTransaction on the fork and name it.
import json,sys,urllib.request
rpc,path=sys.argv[1],sys.argv[2]
names={'8a9e71ea':'SpendingLimitExceeded','576b38b4':'CallNotAllowed','54cfe659':'PolicyForbids'}
ev=[json.loads(l) for l in open(path)]
for e in ev:
  if e['status']=='reverted_onchain' and e['tx']:
    q=json.dumps({"jsonrpc":"2.0","id":1,"method":"debug_traceTransaction","params":[e['tx'],{"tracer":"callTracer"}]}).encode()
    try:
      r=json.load(urllib.request.urlopen(urllib.request.Request(rpc,q,{'content-type':'application/json'}),timeout=30)).get('result') or {}
      out=(r.get('output') or '')[2:10]; e['revert_data']=r.get('output'); e['error']=names.get(out, r.get('error') or ('0x'+out if out else 'unknown'))
    except Exception as x: e['error']='trace failed: '+str(x)[:120]
open(path,'w').write(''.join(json.dumps(e)+'\n' for e in ev))
