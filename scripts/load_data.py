"""
Load the pickles produced by notebooks/kestrel_ingest.ipynb into Supabase.

Usage:
    pip install -r scripts/requirements.txt
    python scripts/load_data.py data/kestrel_data.zip        # or a folder of .pkl files
    python scripts/load_data.py data/kestrel_data.zip --yes  # skip the confirmation

Needs DATABASE_URL in .env.local (Supabase > Project Settings > Database >
Connection string > Session pooler).

It REPLACES the knowledge base: documents, chunks, employees, finance,
campaigns, canaries and the generated eval cases. Red-team eval cases,
users, audit logs and access requests are kept.

Only load pickles you produced yourself: unpickling runs code, so a
pickle from an untrusted source can execute anything on your machine.
"""
import io
import pickle
import sys
import zipfile
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

from _env import load_env, need

FILES = [
    "documents.pkl",
    "chunks.pkl",
    "employees.pkl",
    "finance_quarterly.pkl",
    "campaigns.pkl",
    "canaries.pkl",
    "eval_cases.pkl",
]


def read_inputs(source: Path) -> dict:
    data = {}
    if source.is_file() and source.suffix == ".zip":
        with zipfile.ZipFile(source) as z:
            for name in FILES:
                data[name] = pickle.load(io.BytesIO(z.read(name)))
    elif source.is_dir():
        for name in FILES:
            with open(source / name, "rb") as f:
                data[name] = pickle.load(f)
    else:
        raise SystemExit(f"{source} is not a .zip or a folder")
    return data


def vec(values) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in values) + "]"


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    load_env()
    data = read_inputs(Path(args[0]).expanduser())
    for name in FILES:
        print(f"  {name:24s} {len(data[name]):6d} rows")

    if "--yes" not in sys.argv:
        answer = input("\nThis replaces the knowledge base tables in Supabase. Continue? [y/N] ")
        if answer.strip().lower() != "y":
            raise SystemExit("Cancelled.")

    conn = psycopg2.connect(need("DATABASE_URL"))
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("delete from public.chunks")
            cur.execute("delete from public.documents")
            cur.execute("delete from public.employees")
            cur.execute("delete from public.finance_quarterly")
            cur.execute("delete from public.marketing_campaigns")
            cur.execute("delete from public.canaries")
            cur.execute("delete from public.eval_cases where source <> 'redteam'")

            execute_values(
                cur,
                "insert into public.documents (id, title, department, doc_type, source, flagged, flag_reason) values %s",
                [(d["id"], d["title"], d["department"], d["doc_type"], d["source"], d["flagged"], d["flag_reason"])
                 for d in data["documents.pkl"]],
            )
            execute_values(
                cur,
                "insert into public.chunks (id, document_id, department, chunk_index, content, embedding, flagged) values %s",
                [(c["id"], c["document_id"], c["department"], c["chunk_index"], c["content"], vec(c["embedding"]), c["flagged"])
                 for c in data["chunks.pkl"]],
                template="(%s, %s, %s, %s, %s, %s::vector, %s)",
                page_size=100,
            )
            execute_values(
                cur,
                """insert into public.employees (employee_id, full_name, email, phone, department, job_role, job_level,
                   monthly_income, years_at_company, performance_rating, attrition, overtime, gender, age, marital_status,
                   hire_date) values %s""",
                [(e["employee_id"], e["full_name"], e["email"], e["phone"], e["department"], e["job_role"], e["job_level"],
                  e["monthly_income"], e["years_at_company"], e["performance_rating"], e["attrition"], e["overtime"],
                  e["gender"], e["age"], e["marital_status"], e["hire_date"]) for e in data["employees.pkl"]],
            )
            execute_values(
                cur,
                "insert into public.finance_quarterly (year, quarter, region, category, revenue, profit, orders, avg_discount) values %s",
                [(r["year"], r["quarter"], r["region"], r["category"], r["revenue"], r["profit"], r["orders"], r["avg_discount"])
                 for r in data["finance_quarterly.pkl"]],
            )
            execute_values(
                cur,
                """insert into public.marketing_campaigns (campaign, quarter, channel, budget_usd, customers_targeted,
                   accepted, acceptance_rate, cost_per_acceptance) values %s""",
                [(c["campaign"], c["quarter"], c["channel"], c["budget_usd"], c["customers_targeted"], c["accepted"],
                  c["acceptance_rate"], c["cost_per_acceptance"]) for c in data["campaigns.pkl"]],
            )
            execute_values(
                cur,
                "insert into public.canaries (token, department) values %s on conflict do nothing",
                [(c["token"], c["department"]) for c in data["canaries.pkl"]],
            )
            execute_values(
                cur,
                """insert into public.eval_cases (source, role, question, expected, must_refuse, must_not_contain)
                   values %s on conflict (role, question) do nothing""",
                [(e["source"], e["role"], e["question"], e["expected"], e["must_refuse"], list(e["must_not_contain"]))
                 for e in data["eval_cases.pkl"]],
                template="(%s, %s, %s, %s, %s, %s::text[])",
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    flagged = [d["id"] for d in data["documents.pkl"] if d["flagged"]]
    print("\nLoaded. Flagged at ingestion (stored, never retrievable):", ", ".join(flagged) or "none")


if __name__ == "__main__":
    main()
