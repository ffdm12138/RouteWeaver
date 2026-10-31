"""Verify current candidate file inventory, exact entry bytes and bounded evidence."""
from pathlib import Path
import json
from current_audit import verify


def main():
    try:
        result = verify(Path(__file__).resolve().parents[1])
    except (ValueError, KeyError, OSError, TypeError) as error:
        print(json.dumps({'status': 'FAIL', 'error': str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
