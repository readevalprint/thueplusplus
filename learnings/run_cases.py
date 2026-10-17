#!/usr/bin/env python3
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
from run_limits import bounded_run
root = pathlib.Path('/workspaces/thueplusplus')
case_file = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].endswith('.tsv') else pathlib.Path('/tmp/thue-lisp-pda/hard_acceptance_cases.tsv')
attempts = sys.argv[2:] if len(sys.argv) > 1 and sys.argv[1].endswith('.tsv') else sys.argv[1:]
if not attempts:
    attempts = ['/tmp/thue-lisp-pda/attempt-be-fixed-shape-lambda-let-boundary.thue']
cases=[]
for line in case_file.read_text().splitlines():
    if line.strip():
        cases.append(line.split('\t'))
for attempt in attempts:
    print(f'## {pathlib.Path(attempt).name} on {case_file.name}')
    passed=0
    for name, inp, expected in cases:
        try:
            cp=bounded_run(['uv','run','thue',attempt,'--input',inp,'--max-evals','80000','--max-steps','1000000','--max-state-bytes','8388608'],timeout=8,cwd=root)
            out=cp.stdout.strip(); err=cp.stderr.strip()
            ok=cp.returncode==0 and out==expected and err==''
            print(('  PASS ' if ok else '  FAIL ')+f'{name}: rc={cp.returncode} out={out!r} err={err!r}')
            passed += int(ok)
        except RuntimeError as exc:
            print(f'  TIMEOUT {name}: {exc}')
    print(f'  => {passed}/{len(cases)} passed\n')
