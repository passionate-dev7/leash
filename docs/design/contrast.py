# WCAG 2.x contrast for LEASH v3 token pairs. Run: python3 docs/design/contrast.py
import re, pathlib
css = pathlib.Path(__file__).resolve().parents[2].joinpath('apps/web/src/index.css').read_text()
T = dict(re.findall(r'--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})', css))
def L(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def ratio(a,b):
    la,lb=sorted([L(T[a]),L(T[b])],reverse=True); return (la+0.05)/(lb+0.05)
pairs=[('ink','canvas'),('ink','paper'),('ink-muted','canvas'),('ink-muted','paper'),('ink-muted','surface-1'),
 ('ink-subtle','canvas'),('ink-subtle','paper'),('ink-subtle','surface-1'),('accent-ink','paper'),('accent-ink','canvas'),('accent-2','paper'),
 ('on-primary','primary'),('paid','paid-tint'),('paid','paper'),('refused','refused-tint'),('refused','paper'),
 ('reverted','reverted-tint'),('reverted','paper'),('failed','failed-tint'),('failed','paper'),('neutral','neutral-tint'),
 ('ink','surface-2'),('ink','surface-3'),('error-ink','error-tint'),('warning-ink','warning-tint'),('success-ink','success-tint'),('ink-muted','surface-2')]
fails=0
for a,b in pairs:
    r=ratio(a,b); ok=r>=4.5; fails+=not ok
    print(f"{'AA ' if ok else 'FAIL'} {r:5.2f}:1  {a} ({T[a]}) on {b} ({T[b]})")
print(f"---- {fails} below 4.5:1"); raise SystemExit(fails>0)
