#!/usr/bin/env python3
"""Study Workspace: start the local server.

    python server.py               open http://127.0.0.1:8765 in your browser
    python server.py --no-browser  only start the server
    python server.py --help        all options

On Arch Linux, use the `study-workspace` launcher instead to get the app in
its own window (see README.md).
"""

import sys

if sys.version_info < (3, 9):
    sys.exit("Study Workspace needs Python 3.9 or newer.")

from backend.app import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
