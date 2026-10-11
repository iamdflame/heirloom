"""Run a worktree's tests/runtests.py after proving which django is imported.

Executed by the Django test venv's interpreter (not heirloom's):
    python _runtests_shim.py <worktree> <runtests args...>
Exits 97 if django is imported from anywhere other than <worktree>.
"""

import os
import runpy
import sys

wt = os.path.realpath(sys.argv[1])
tests_dir = os.path.join(wt, "tests")
sys.path[:0] = [tests_dir, wt]

import django  # noqa: E402

django_file = os.path.realpath(django.__file__ or "")
print(f"HEIRLOOM_DJANGO_FILE={django_file}", flush=True)
if not django_file.startswith(wt + os.sep):
    print(f"wrong tree: django from {django_file}, expected {wt}", file=sys.stderr)
    sys.exit(97)

os.chdir(tests_dir)
sys.argv = [os.path.join(tests_dir, "runtests.py"), *sys.argv[2:]]
runpy.run_path(sys.argv[0], run_name="__main__")
