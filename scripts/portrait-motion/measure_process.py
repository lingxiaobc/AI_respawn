"""Measure a command and its descendant RSS on CPU; no private environment dump."""
import argparse
import json
import subprocess
import time
from pathlib import Path
import psutil

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--report',required=True);p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args()
    command=a.command[1:] if a.command[:1]==['--'] else a.command
    if not command:p.error('command required')
    started=time.monotonic();child=subprocess.Popen(command);peak=0
    while child.poll() is None:
        try:
            process=psutil.Process(child.pid);rss=0
            for item in [process]+process.children(recursive=True):
                try:rss+=item.memory_info().rss
                except psutil.Error:pass
            peak=max(peak,rss)
        except psutil.Error:pass
        time.sleep(.1)
    report={'exitCode':child.returncode,'elapsedSeconds':time.monotonic()-started,'peakProcessTreeRSSBytes':peak,'limitBytes':1610612736,'memoryPassed':peak<=1610612736,'method':'sum parent and descendant RSS sampled every 100ms; short peaks may be missed'}
    Path(a.report).parent.mkdir(parents=True,exist_ok=True)
    Path(a.report).write_text(json.dumps(report,indent=2));print(json.dumps(report))
    raise SystemExit(child.returncode or (0 if report['memoryPassed'] else 1))
