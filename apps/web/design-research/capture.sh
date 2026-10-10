#!/bin/bash
# refshot.py captures (ui-craft research protocol). Usage: capture.sh name url [name url ...]
R=~/.agents/skills/ui-craft/scripts/refshot.py
cd "$(dirname "$0")"
while [ $# -gt 1 ]; do
  n=$1; u=$2; shift 2
  echo "== $n $u"
  timeout 100 node refshot-pw.cjs "$u" refs/$n-1440.png 1440 900 2>&1 | tail -2
  timeout 100 node refshot-pw.cjs "$u" refs/$n-390.png 390 844 2>&1 | tail -2
done
echo DONE
