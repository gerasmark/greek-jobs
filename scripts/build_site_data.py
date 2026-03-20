from __future__ import annotations

import json
from datetime import datetime, timezone

from common import period_sort_key, root_path, write_json
from occupation_groups import BY_SOURCE_TITLE


def read_json(path: str) -> dict:
    return json.loads(root_path(path).read_text())


def compute_growth(history_map: dict[str, int], latest_period: str, years_back: int) -> float | None:
    latest_year, latest_quarter = latest_period.split("-Q")
    base_period = f"{int(latest_year) - years_back}-Q{latest_quarter}"
    latest_value = history_map.get(latest_period)
    base_value = history_map.get(base_period)
    if not latest_value or not base_value:
        return None
    return round(((latest_value - base_value) / base_value) * 100, 1)


def build() -> tuple[list[dict], dict]:
    lfs = read_json("data/processed/elstat_lfs.json")
    vacancies = read_json("data/processed/elstat_job_vacancies.json")
    dypa = read_json("data/processed/dypa_registered_unemployment.json")
    ergani = read_json("data/processed/ergani_sources.json")
    ergani_metrics = (ergani.get("latest_report_parsed") or {}).get("metrics", {})

    latest_period = lfs["latest_period"]
    total_employed = lfs["latest_totals"]["employed"]

    data = []
    for group in lfs["groups"]:
        metadata = BY_SOURCE_TITLE["".join(ch for ch in group["title"].lower() if ch.isalnum())]
        history = sorted(group["history"], key=lambda item: period_sort_key(item["period"]))
        history_map = {entry["period"]: entry["jobs"] for entry in history}
        jobs = history_map.get(latest_period)
        if jobs is None:
            continue
        data.append(
            {
                "title": group["title"],
                "label_el": group["label_el"],
                "slug": f"isco-{metadata['code'].lower()}-{group['slug']}",
                "category": group["category"],
                "isco_major_group": metadata["code"],
                "jobs": jobs,
                "employment_share": round(jobs / total_employed, 4),
                "history": history,
                "yoy_pct": compute_growth(history_map, latest_period, 1),
                "five_year_pct": compute_growth(history_map, latest_period, 5),
                "description": group["description"],
                "exposure": metadata["exposure"],
                "exposure_rationale": metadata["exposure_rationale"],
                "source_period": latest_period,
                "url": lfs["source"]["publication_url"],
            }
        )

    meta = {
        "title": "Greece Jobs Explorer",
        "build_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "latest_period": latest_period,
        "source_period": latest_period,
        "total_employed": total_employed,
        "total_jobs": total_employed,
        "unemployment_rate": lfs["latest_totals"]["unemployment_rate"],
        "registered_unemployed": dypa["registered_total"],
        "registered_unemployment_period": dypa["period"],
        "registered_unemployed_over_12_months": dypa["registered_over_12_months"],
        "registered_unemployed_under_12_months": dypa["registered_under_12_months"],
        "top_registered_unemployment_regions": dypa["top_regions"],
        "vacancies_total": vacancies["latest_total"],
        "vacancies_period": vacancies["latest_period"],
        "top_vacancy_sectors": [
            {
                "code": sector["code"],
                "label": sector["label"],
                "vacancies": sector["latest_vacancies"],
            }
            for sector in vacancies["top_sectors"]
        ],
        "ergani_latest_report": ergani["latest_report"],
        "ergani_latest_monthly_report": ergani.get("latest_monthly_report"),
        "ergani_latest_special_issue": ergani.get("latest_special_issue"),
        "ergani_parsing_status": ergani["parsing_status"],
        "private_sector_monthly_balance": ergani_metrics.get("monthly_balance"),
        "private_sector_monthly_hires": ergani_metrics.get("monthly_hires"),
        "private_sector_monthly_departures": ergani_metrics.get("monthly_departures"),
        "private_sector_annual_balance": ergani_metrics.get("annual_balance"),
        "private_sector_final_annual_balance": ergani_metrics.get(
            "final_annual_balance_with_manual_submissions"
        ),
        "sources": {
            "lfs": lfs["source"],
            "vacancies": vacancies["source"],
            "dypa": dypa["source"],
            "ergani": ergani["source"],
        },
        "summary": {
            "total_jobs": total_employed,
            "source_period": latest_period,
        },
    }
    return data, meta


def main() -> None:
    data, meta = build()
    write_json(root_path("site", "data.json"), data)
    write_json(root_path("site", "meta.json"), meta)
    write_json(root_path("site", "_meta.json"), meta)
    write_json(root_path("data", "processed", "site_data.json"), {"data": data, "meta": meta})
    print("Wrote site/data.json with", len(data), "tiles")
    print("Latest period:", meta["latest_period"])


if __name__ == "__main__":
    main()
