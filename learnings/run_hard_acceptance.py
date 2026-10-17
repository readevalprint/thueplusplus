#!/usr/bin/env python3
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
from run_limits import bounded_run
root = pathlib.Path('/workspaces/thueplusplus')
cases = []
for line in pathlib.Path('/tmp/thue-lisp-pda/hard_acceptance_cases.tsv').read_text().splitlines():
    if not line.strip():
        continue
    name, inp, expected = line.split('\t')
    cases.append((name, inp, expected))

attempts = sys.argv[1:] or [
    '/tmp/thue-lisp-pda/attempt-ba-lisp.thue',
    '/tmp/thue-lisp-pda/attempt-bb-lisp.thue',
    '/tmp/thue-lisp-pda/attempt-ar-integrated-fuller-acceptance.thue',
    '/tmp/thue-lisp-pda/attempt-ax-arbitrary-vtypes-strict-lazy-array.thue',
]
for attempt in attempts:
    print(f'## {pathlib.Path(attempt).name}')
    passed = 0
    for name, inp, expected in cases:
        try:
            cp = bounded_run(
                ['uv','run','thue',attempt,'--input',inp,'--max-evals','60000','--max-steps','1000000','--max-state-bytes','8388608'],
                timeout=8,
                cwd=root,
            )
            out = cp.stdout.strip()
            err = cp.stderr.strip()
            ok = (cp.returncode == 0 and out == expected and err == '')
            if ok:
                passed += 1
                print(f'  PASS {name}')
            else:
                short = (err or out or f'exit {cp.returncode}')[:140].replace('\n','\\n')
                print(f'  FAIL {name}: rc={cp.returncode} out={out!r} err={err!r}')
        except RuntimeError as exc:
            print(f'  TIMEOUT {name}: {exc}')
    print(f'  => {passed}/{len(cases)} passed\n')
