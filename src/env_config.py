import os
from pathlib import Path
from typing import Iterable, Optional

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - fallback if python-dotenv is unavailable
    load_dotenv = None


def _load_project_dotenv() -> None:
    """Carga .env del proyecto sin sobreescribir variables ya exportadas."""
    if load_dotenv is None:
        return

    root_dir = Path(__file__).resolve().parent.parent
    dotenv_path = root_dir / ".env"
    if dotenv_path.exists():
        load_dotenv(dotenv_path=dotenv_path, override=False)


_load_project_dotenv()


def get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    return value if value else default


def get_env_first(names: Iterable[str], default: Optional[str] = None) -> Optional[str]:
    for name in names:
        value = get_env(name)
        if value is not None:
            return value
    return default


def has_any_env(names: Iterable[str]) -> bool:
    return get_env_first(names) is not None


def get_env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def get_env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def get_env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return default


def validate_required(keys: Iterable[str], active: bool = True, context: str = "module") -> None:
    if not active:
        return
    missing = [k for k in keys if get_env(k) is None]
    if missing:
        raise RuntimeError(f"[{context}] Missing required env vars: {', '.join(missing)}")


def validate_required_any(groups: dict, active: bool = True, context: str = "module") -> None:
    if not active:
        return
    missing = []
    for logical_name, names in groups.items():
        if not has_any_env(names):
            missing.append(f"{logical_name} ({' | '.join(names)})")
    if missing:
        raise RuntimeError(f"[{context}] Missing required env groups: {', '.join(missing)}")
