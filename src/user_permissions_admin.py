#!/usr/bin/env python
# -*- coding: utf-8 -*-

import argparse
import json
import sys

from user_permissions import get_chatbot_permission, set_chatbot_permission


def build_parser():
    parser = argparse.ArgumentParser(
        description="Administra permisos de chatbot en Base_de_datos_noticias.user_permissions."
    )
    parser.add_argument("--user-id", required=True, help="Clerk userId (ej. user_3A5Yak5hMjC03bDnQCUpI8bSWCG).")
    parser.add_argument("--email", default=None, help="Email opcional para asociar al registro.")

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--status", action="store_true", help="Consultar permiso actual del usuario.")
    group.add_argument("--grant", action="store_true", help="Conceder acceso al chatbot (canUseChatbot=true).")
    group.add_argument("--revoke", action="store_true", help="Revocar acceso al chatbot (canUseChatbot=false).")
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.status:
        result = get_chatbot_permission(args.user_id, email=args.email, bootstrap_if_missing=True)
    elif args.grant:
        result = set_chatbot_permission(args.user_id, True, email=args.email)
    else:
        result = set_chatbot_permission(args.user_id, False, email=args.email)

    if result.get("ok"):
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    print(json.dumps(result, ensure_ascii=False, indent=2), file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
