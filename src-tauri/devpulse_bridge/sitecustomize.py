import os
from urllib.parse import urlparse

import httpx


_ORIGINAL_REQUEST = httpx.Client.request


def _needs_openai_auth(url: str, headers: dict[str, str] | None) -> bool:
    if os.getenv("LLM_PROVIDER", "").strip().lower() != "openai":
        return False
    if not os.getenv("OPENAI_API_KEY", "").strip():
        return False
    if headers and any(key.lower() == "authorization" for key in headers):
        return False

    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    return path.endswith("/chat/completions")


def _request_with_openai_auth(self, method, url, *args, **kwargs):
    headers = dict(kwargs.get("headers") or {})
    if _needs_openai_auth(str(url), headers):
        headers["Authorization"] = f"Bearer {os.environ['OPENAI_API_KEY'].strip()}"
        kwargs["headers"] = headers
    return _ORIGINAL_REQUEST(self, method, url, *args, **kwargs)


httpx.Client.request = _request_with_openai_auth
