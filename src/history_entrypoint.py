#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json
import sys

from user_history import get_user_history, upsert_user_history_item


def _print_json(payload):
    print(json.dumps(payload, ensure_ascii=False))


def main():
    try:
        raw = sys.stdin.read()
        if not raw and len(sys.argv) > 1:
            raw = sys.argv[1]
        if not raw:
            _print_json({"ok": False, "error": "Se requiere JSON de entrada via stdin."})
            return 1

        data = json.loads(raw)
        action = data.get("action")
        user_id = data.get("userId")
        limit = data.get("limit", 4)

        if action == "get_history":
            result = get_user_history(user_id=user_id, limit=limit)
        elif action == "push_history":
            result = upsert_user_history_item(
                user_id=user_id,
                item=data.get("item") or {},
                limit=limit,
            )
        else:
            result = {"ok": False, "error": "Acción no soportada."}

        _print_json(result)
        return 0 if result.get("ok") else 1
    except json.JSONDecodeError:
        _print_json({"ok": False, "error": "Entrada inválida. Se espera JSON."})
        return 1
    except Exception as exc:
        _print_json({"ok": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
