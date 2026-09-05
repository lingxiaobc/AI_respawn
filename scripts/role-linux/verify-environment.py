"""Record the actual Linux host; reject secret-bearing test source copies."""
import json
import os
import platform
import subprocess
import sys
import time
from pathlib import Path

runtime = Path(sys.argv[1]).resolve()
if sys.platform != 'linux':
    raise SystemExit('Linux required')
release = platform.freedesktop_os_release()
if release.get('ID') != 'ubuntu':
    raise SystemExit('Existing Ubuntu required')
if Path('.env').exists() or any(Path('AI_output').rglob('.calls')):
    raise SystemExit('Isolated test copy must not contain credentials or paid ledgers')
record = {'os': release, 'kernel': platform.release(), 'architecture': platform.machine(),
          'python': platform.python_version(), 'node': subprocess.check_output(['node', '--version'], text=True).strip(),
          'cpuCount': os.cpu_count(), 'gpuInference': False, 'scope': 'local WSL Ubuntu; cached replay, no new paid calls; not production deployment'}
(runtime / 'environment.json').write_text(json.dumps(record, indent=2))
mode = sys.argv[2] if len(sys.argv) > 2 else 'worker'
if mode not in ('worker', 'ui'):
    raise SystemExit('Expected worker or ui mode')
if mode == 'ui':
    command = ['node', 'scripts/verify-role-admin.mjs']
else:
    source = Path('AI_output/normalized/\u9752\u5e74-cf1a11df052a/source.png')
    role_root = Path('AI_output/role-worker-test') / str(time.time_ns())
    os.environ['ROLE_OUTPUT_DIR'] = str(role_root)
    command = ['node', '--experimental-strip-types', 'scripts/role-resources.ts', 'submit', str(source)]
code = subprocess.call([sys.executable, 'scripts/portrait-motion/measure_process.py',
                        '--report', str(runtime / f'linux-{mode}-memory.json'), '--', *command])
if mode == 'worker':
    jobs = list(role_root.glob('*/job.json'))
    job = json.loads(jobs[0].read_text()) if len(jobs) == 1 else {}
    passed = job.get('status') == 'awaiting_review' and len(job.get('completed', {})) == 12
    (runtime / 'worker-validation.json').write_text(json.dumps({
        'passed': passed and code == 0, 'jobPath': str(jobs[0]) if jobs else None,
        'status': job.get('status'), 'completedStages': list(job.get('completed', {})),
        'scope': 'server worker and all descendants including QA browser; excludes simulated client browser'
    }, indent=2))
    if not passed:
        raise SystemExit('Worker did not complete all stages to awaiting_review')
raise SystemExit(code)
