"""Issue Similarity Service — AI-based previous issue recognition.

Flow:
  issue (title/description/error/system/client/process/category)
    -> search text
    -> embedding (OpenAI-compatible API when EMBEDDING_API_URL is configured,
       otherwise a deterministic local feature-hashing embedder — zero external
       dependencies required)
    -> pgvector cosine search (server-side, NEVER in the browser)
    -> ranked matches stored in issue_similarity_results

API keys live only in backend environment variables and are never sent to the
frontend. The AI only RECOMMENDS — it never modifies anything automatically.
"""
import json
import math
import re
import urllib.request

from ..config import settings
from ..database import fetchall, fetchone, execute

_WORD_RE = re.compile(r"[^a-z0-9\s]+")


def tokenize(text: str) -> list[str]:
    return [t for t in _WORD_RE.sub(" ", str(text or "").lower()).split() if t]


def _hash(s: str, seed: int) -> int:
    h = seed & 0xFFFFFFFF
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h


def fallback_embed(text: str, dim: int | None = None) -> list[float]:
    """Deterministic feature-hashing embedder (words + character trigrams,
    L2-normalized). Mirrors the JS demo engine so behaviour is consistent."""
    dim = dim or settings.embedding_dimensions
    vec = [0.0] * dim
    for w in tokenize(text):
        vec[_hash(w, 0) % dim] += 1.0
    chars = re.sub(r"[^a-z0-9]", "", str(text or "").lower())
    for i in range(max(0, len(chars) - 2)):
        vec[_hash(chars[i:i + 3], 7) % dim] += 0.5
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed(text: str) -> tuple[list[float], str]:
    """Returns (vector, model_name). Uses the configured embedding API when
    available, otherwise the built-in local embedder."""
    if settings.embedding_api_url and settings.embedding_api_key:
        try:
            body = json.dumps({
                "model": settings.embedding_model,
                "input": text[:8000],
                "dimensions": settings.embedding_dimensions,
            }).encode("utf-8")
            req = urllib.request.Request(
                settings.embedding_api_url.rstrip("/") + "/embeddings",
                data=body,
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {settings.embedding_api_key}"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            vec = [float(x) for x in data["data"][0]["embedding"]]
            return vec, settings.embedding_model
        except Exception:
            pass  # fall through to the local embedder
    return fallback_embed(text), "local-hash"


def _vec_str(vec: list[float]) -> str:
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"


def get_thresholds() -> dict:
    """Similarity thresholds are stored in the database (app_settings) with
    environment-variable defaults. Editable via Settings -> AI Similarity."""
    row = fetchone("select value from app_settings where key = 'similarity_settings'")
    value = row["value"] if row and row.get("value") else {}
    return {
        "high": float(value.get("high", settings.similarity_high_threshold)),
        "medium": float(value.get("medium", settings.similarity_medium_threshold)),
    }


def build_search_text(i: dict) -> str:
    parts = [
        i.get("issue_title"), i.get("issue_description"), i.get("error_message"),
        i.get("system_name"), i.get("process_name"), i.get("category_name"),
        i.get("client_name"),
    ]
    return " | ".join(p for p in parts if p)


def store_embedding(issue_id: str, text: str, vec: list[float], model: str) -> None:
    execute(
        """
        insert into issue_embeddings (issue_id, embedding, search_text, model)
        values (%s, %s::vector, %s, %s)
        on conflict (issue_id) do update
        set embedding = excluded.embedding, search_text = excluded.search_text, model = excluded.model
        """,
        (issue_id, _vec_str(vec), text, model),
    )


def _enrich_rows(rows: list[dict]) -> list[dict]:
    """Attach the latest completed RCA detail used by the AI recommendation."""
    for r in rows:
        rca = fetchone(
            "select technical_cause, contributing_factors, preventive_action "
            "from rca_logs where issue_id = %s and status = 'Completed' "
            "order by rca_date desc limit 1",
            (r["id"],),
        )
        if rca:
            r["technical_cause"] = rca.get("technical_cause")
            r["contributing_factors"] = rca.get("contributing_factors")
            r["preventive_action"] = rca.get("preventive_action")
        if r.get("similarity") is not None:
            r["similarity"] = float(r["similarity"])
    return rows


def find_similar(issue_row: dict, top_k: int = 5) -> list[dict]:
    """Server-side pgvector similarity search. Stores results in
    issue_similarity_results for dashboard metrics and instant display."""
    text = build_search_text(issue_row)
    vec, model = embed(text)
    try:
        store_embedding(issue_row["id"], text, vec, model)
    except Exception:
        pass
    v = _vec_str(vec)
    rows = fetchall(
        """
        select i.id, i.issue_id, i.issue_title, i.status, i.priority, i.recurrence_count,
               i.root_cause, i.permanent_solution, i.temporary_solution,
               c.client_name, p.process_name,
               (1 - (e.embedding <=> %s::vector))::float as similarity
        from issue_embeddings e
        join tech_issues i on i.id = e.issue_id
        left join clients c on c.id = i.client_id
        left join processes p on p.id = i.process_id
        where e.issue_id <> %s and e.embedding is not null
        order by e.embedding <=> %s::vector asc
        limit %s
        """,
        (v, issue_row["id"], v, top_k),
    )
    _enrich_rows(rows)
    try:
        execute("delete from issue_similarity_results where issue_id = %s", (issue_row["id"],))
        for r in rows:
            if (r.get("similarity") or 0) >= 0.05:
                execute(
                    """
                    insert into issue_similarity_results (issue_id, similar_issue_id, similarity)
                    values (%s, %s, %s)
                    on conflict (issue_id, similar_issue_id) do update set similarity = excluded.similarity
                    """,
                    (issue_row["id"], r["id"], r["similarity"]),
                )
    except Exception:
        pass
    return rows


def stored_matches(issue_id: str, limit: int = 5) -> list[dict]:
    """Matches cached from the last similarity search for an issue."""
    rows = fetchall(
        """
        select r.similarity, i.id, i.issue_id, i.issue_title, i.status, i.priority,
               i.recurrence_count, i.root_cause, i.permanent_solution,
               c.client_name, p.process_name
        from issue_similarity_results r
        join tech_issues i on i.id = r.similar_issue_id
        left join clients c on c.id = i.client_id
        left join processes p on p.id = i.process_id
        where r.issue_id = %s order by r.similarity desc limit %s
        """,
        (issue_id, limit),
    )
    return _enrich_rows(rows)


def recompute_recurrence(issue_id: str) -> None:
    """Recurrence is based on CONFIRMED same_issue/recurrence links."""
    cnt = fetchone(
        "select count(*) as c from issue_relationships "
        "where issue_id = %s and relationship_type in ('same_issue','recurrence') and confirmed",
        (issue_id,),
    )["c"]
    execute(
        "update tech_issues set recurrence = %s, recurrence_count = %s where id = %s",
        (cnt > 0, cnt, issue_id),
    )
