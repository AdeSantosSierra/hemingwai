#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json
import sys

from user_permissions import get_chatbot_permission, set_chatbot_permission


def _print_json(payload):
    print(json.dumps(payload, ensure_ascii=False))


def _coerce_bool(value, default=True):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "y", "on"}:
            return True
        if lowered in {"0", "false", "no", "n", "off"}:
            return False
    return default


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

        if action == "check_chatbot_access":
            result = get_chatbot_permission(
                user_id=data.get("userId"),
                email=data.get("email"),
                bootstrap_if_missing=_coerce_bool(data.get("bootstrapIfMissing"), default=True),
            )
        elif action == "set_chatbot_access":
            result = set_chatbot_permission(
                user_id=data.get("userId"),
                can_use_chatbot=data.get("canUseChatbot"),
                email=data.get("email"),
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
