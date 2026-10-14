import json
import math
import sys
from dataclasses import asdict

from link_sense import analysis, history, native, scorer, store

DEFAULT_LIMIT = 2000
DEFAULT_MAX_RESULTS = 500
RESPONSE_BUDGET = 900 * 1024  # stay well under Chrome's 1 MB host-to-browser limit


def _serialize(entry: scorer.ScoredEntry) -> dict:
    d = asdict(entry)
    d["last_visit_time"] = entry.last_visit_time.isoformat()
    return d


def _fits(resp: dict) -> bool:
    return len(json.dumps(resp, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) <= RESPONSE_BUDGET


def handle_analyze(req: dict) -> dict:
    limit = int(req.get("limit", DEFAULT_LIMIT))
    max_results = int(req.get("max_results", DEFAULT_MAX_RESULTS))
    entries = history.read_all(req.get("browser", "auto"), limit)
    if not entries:
        raise ValueError("No history found. Check that Chrome or Firefox is installed.")

    saved_meta = store.all_bookmarks()
    candidates, saved = analysis.split(scorer.score(entries), saved_meta)

    saved_out = []
    for e in saved:
        d = _serialize(e)
        d["folder"] = saved_meta.get(e.url, {}).get("folder", "")
        saved_out.append(d)

    cands = [_serialize(e) for e in candidates[:max_results]]
    truncated = len(candidates) > len(cands)
    while True:
        resp = {"type": "analyze", "candidates": cands, "saved": saved_out, "truncated": truncated}
        if _fits(resp) or not cands:
            return resp
        cands = cands[: int(len(cands) * 0.8)]
        truncated = True


def _validate_apply(req: dict) -> tuple[list[dict], list[str]]:
    adds, removes = req.get("adds", []), req.get("removes", [])
    if not isinstance(adds, list) or not isinstance(removes, list):
        raise ValueError("adds and removes must be lists")
    normalized = []
    for item in adds:
        if not isinstance(item, dict) or not isinstance(item.get("url"), str) or not item["url"]:
            raise ValueError("every add needs a non-empty string url")
        title, folder, score = item.get("title", ""), item.get("folder", ""), item.get("score", 0.0)
        if not isinstance(title, str) or not isinstance(folder, str):
            raise ValueError("title and folder must be strings")
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score):
            raise ValueError("score must be a finite number")
        normalized.append({"url": item["url"], "title": title, "score": float(score), "folder": folder})
    if not all(isinstance(u, str) and u for u in removes):
        raise ValueError("every remove must be a non-empty string url")
    return normalized, removes


def handle_apply(req: dict) -> dict:
    adds, removes = _validate_apply(req)  # validate and normalize everything before touching the store
    added, removed, missing = [], [], []
    for item in adds:
        store.add(item["url"], title=item["title"], score=item["score"], folder=item["folder"])
        added.append(item["url"])
    for url in removes:
        (removed if store.remove(url) else missing).append(url)
    return {"type": "apply", "added": added, "removed": removed, "missing": missing}


HANDLERS = {"analyze": handle_analyze, "apply": handle_apply}


def handle(req) -> dict:
    if not isinstance(req, dict):
        return {"type": "error", "message": "request must be a JSON object"}
    try:
        kind = req.get("type")
        handler = HANDLERS.get(kind)
        if handler is None:
            raise ValueError(f"unknown request type: {kind!r}")
        resp = handler(req)
    except Exception as exc:  # report every failure to the UI instead of dying
        resp = {"type": "error", "message": str(exc)}
    if "id" in req:
        resp["id"] = req["id"]
    return resp


def _send(stdout, resp: dict) -> None:
    try:
        native.write_message(stdout, resp)
    except native.FrameError as exc:
        err = {"type": "error", "message": str(exc)}
        if "id" in resp:
            err["id"] = resp["id"]
        native.write_message(stdout, err)


def main(stdin, stdout) -> None:
    while True:
        try:
            req = native.read_message(stdin)
        except native.FrameError as exc:
            _send(stdout, {"type": "error", "message": str(exc)})
            return  # the stream is out of sync; stop
        except ValueError as exc:
            _send(stdout, {"type": "error", "message": f"invalid message: {exc}"})
            continue
        if req is None:
            return
        _send(stdout, handle(req))


def run() -> None:
    stdin, stdout = sys.stdin.buffer, sys.stdout.buffer
    real_stdout = sys.stdout
    sys.stdout = sys.stderr  # stray prints must never reach the protocol stream
    try:
        main(stdin, stdout)
    finally:
        sys.stdout = real_stdout
