"""Add per-step block numbers (and block timestamps where a receipt has logs) to the web proof files,
read from the cast receipts the fork runs saved under out/ and out/dc/. Local fork only: nothing is fetched."""
import json, re, glob, pathlib, datetime
here = pathlib.Path(__file__).parent
rec = {}
for f in glob.glob(str(here / 'out/raw-*.txt')) + glob.glob(str(here / 'out/dc/raw-*.txt')):
    for chunk in re.split(r'\n(?=blockHash\s)', pathlib.Path(f).read_text()):
        tx = re.search(r'^transactionHash\s+(0x[0-9a-f]{64})', chunk, re.M)
        bn = re.search(r'^blockNumber\s+(\d+)', chunk, re.M)
        if not (tx and bn): continue
        ts = re.search(r'"blockTimestamp":"(0x[0-9a-f]+)"', chunk)
        rec[tx.group(1)] = {'block': int(bn.group(1)), 'time': datetime.datetime.fromtimestamp(int(ts.group(1), 16), datetime.timezone.utc).isoformat().replace('+00:00', 'Z') if ts else None}
web = here.parent.parent / 'apps/web/public'
for name in ['fork-proof.json', 'delivery-cut-proof.json']:
    p = web / name; j = json.loads(p.read_text()); hit = 0
    for s in j['steps']:
        r = rec.get(s.get('tx') or '')
        if r: s['block'] = r['block']; s['time'] = r['time']; hit += 1
    p.write_text(json.dumps(j, indent=2) + '\n')
    print(name, f'{hit}/{sum(1 for s in j["steps"] if s.get("tx"))} steps with tx matched')
