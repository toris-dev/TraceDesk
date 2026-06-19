import os
from urllib.parse import urlparse

import httpx


_ORIGINAL_REQUEST = httpx.Client.request
_TOPIC_FILTER_PATCHED = False


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


def _topic_filters() -> list[str]:
    raw = os.getenv("DEVPULSE_TOPIC_FILTERS", "")
    return [part.strip().lower() for part in raw.replace(",", "\n").splitlines() if part.strip()]


def _expanded_limit(limit: int | None) -> int | None:
    if not isinstance(limit, int) or limit <= 0:
        return limit
    return min(max(limit * 5, limit), 200)


def _post_matches_topic(post: dict, filters: list[str]) -> bool:
    if not filters:
        return True

    haystack = " ".join(
        str(post.get(key) or "")
        for key in ("title", "summary", "raw_content", "url", "source", "feed_type", "author")
    ).lower()
    return any(keyword in haystack for keyword in filters)


def _filter_posts(posts: list[dict], filters: list[str], limit: int | None = None) -> list[dict]:
    filtered = [post for post in posts if _post_matches_topic(post, filters)]
    if isinstance(limit, int) and limit > 0:
        return filtered[:limit]
    return filtered


def _patch_topic_filtering() -> None:
    global _TOPIC_FILTER_PATCHED
    if _TOPIC_FILTER_PATCHED:
        return

    filters = _topic_filters()
    if not filters:
        _TOPIC_FILTER_PATCHED = True
        return

    try:
        from pipeline.collectors import geeknews
        from pipeline import runner
    except Exception:
        return

    original_collect = geeknews.collect_all_feeds

    def collect_all_feeds_filtered(*args, **kwargs):
        effective_kwargs = dict(kwargs)
        requested_limit = effective_kwargs.get("limit")
        expanded_limit = _expanded_limit(requested_limit)
        if expanded_limit != requested_limit:
            effective_kwargs["limit"] = expanded_limit
        posts = original_collect(*args, **effective_kwargs)
        return _filter_posts(posts, filters, requested_limit)

    geeknews.collect_all_feeds = collect_all_feeds_filtered
    runner.collect_all_feeds = collect_all_feeds_filtered
    _TOPIC_FILTER_PATCHED = True


httpx.Client.request = _request_with_openai_auth
_patch_topic_filtering()
