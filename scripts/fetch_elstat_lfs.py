from __future__ import annotations

from pathlib import Path

from common import (
    DownloadedArtifact,
    extract_links,
    fetch_text,
    find_link,
    normalize_quarter_label,
    normalize_space,
    period_sort_key,
    root_path,
    thousands_to_people,
    write_json,
    xls_sheet_rows,
    download_file,
)
from occupation_groups import BY_SOURCE_TITLE, normalize_group_title


PUBLICATION_URL = "https://www.statistics.gr/en/statistics/-/publication/SJO01/-"
OCCUPATION_LABEL = "04. Persons employed 15+ (one-digit groups of individual occupations)"
TOTALS_LABEL = "01. Population 15+ (employment status (Greece, total))"


def _download_artifact(label_substring: str, destination_name: str) -> DownloadedArtifact:
    links = extract_links(fetch_text(PUBLICATION_URL))
    link = find_link(links, label_substring)
    path = root_path("data", "raw", "elstat", destination_name)
    if not path.exists():
        cached = sorted(path.parent.glob(destination_name.replace(".xls", "_*.xls")))
        if cached:
            path = cached[-1]
        else:
            download_file(link["href"], path)
    return DownloadedArtifact(label=link["label"], url=link["href"], path=path)


def _parse_occupation_history(path: Path) -> dict[str, dict[str, int]]:
    rows = xls_sheet_rows(path)
    series_by_group: dict[str, dict[str, int]] = {}
    periods: list[str] = []

    for row in rows:
        label = normalize_space(str(row[0])) if row else ""
        if not label:
            continue

        if label.startswith("One-digit groups of individual occupations"):
            periods = []
            for cell in row[1:]:
                period = normalize_quarter_label(str(cell))
                if period is not None:
                    periods.append(period)
            continue

        if not periods:
            continue

        if label.startswith("SOURCE") or label.startswith("1 2011 data"):
            continue

        title_key = normalize_group_title(label)
        if title_key not in BY_SOURCE_TITLE:
            continue

        values = row[1 : 1 + len(periods)]
        group_history = series_by_group.setdefault(title_key, {})
        for period, raw_value in zip(periods, values):
            people = thousands_to_people(raw_value)
            if people is not None:
                group_history[period] = people

    return series_by_group


def _parse_totals(path: Path) -> dict[str, dict[str, float]]:
    rows = xls_sheet_rows(path)
    totals: dict[str, dict[str, float]] = {}
    for row in rows[4:]:
        if not row:
            continue
        period = normalize_quarter_label(str(row[0]))
        if period is None:
            continue
        employed = row[4] if len(row) > 4 else None
        unemployed = row[6] if len(row) > 6 else None
        unemployment_rate = row[7] if len(row) > 7 else None
        labour_force = row[2] if len(row) > 2 else None
        inactive = row[9] if len(row) > 9 else None
        totals[period] = {
            "employed_thousands": float(employed),
            "employed": thousands_to_people(employed),
            "unemployed_thousands": float(unemployed),
            "unemployed": thousands_to_people(unemployed),
            "unemployment_rate": float(unemployment_rate),
            "labour_force_thousands": float(labour_force),
            "labour_force": thousands_to_people(labour_force),
            "inactive_thousands": float(inactive),
            "inactive": thousands_to_people(inactive),
        }
    return totals


def build() -> dict:
    occupation_artifact = _download_artifact(
        OCCUPATION_LABEL,
        "lfs_occupation_groups.xls",
    )
    totals_artifact = _download_artifact(
        TOTALS_LABEL,
        "lfs_population_status.xls",
    )

    series_by_group = _parse_occupation_history(occupation_artifact.path)
    totals_by_period = _parse_totals(totals_artifact.path)

    available_periods = sorted(totals_by_period, key=period_sort_key)
    latest_period = available_periods[-1]

    groups = []
    for key, metadata in BY_SOURCE_TITLE.items():
        history = series_by_group.get(key, {})
        ordered_history = [
            {"period": period, "jobs": history[period]}
            for period in sorted(history, key=period_sort_key)
        ]
        groups.append(
            {
                "code": metadata["code"],
                "slug": metadata["slug"],
                "title": metadata["title"],
                "label_el": metadata["label_el"],
                "category": metadata["category"],
                "description": metadata["description"],
                "source_label": metadata["title"],
                "latest_jobs": history.get(latest_period),
                "history": ordered_history,
            }
        )

    payload = {
        "source": {
            "publication_url": PUBLICATION_URL,
            "occupation_series_label": occupation_artifact.label,
            "occupation_series_url": occupation_artifact.url,
            "totals_series_label": totals_artifact.label,
            "totals_series_url": totals_artifact.url,
        },
        "latest_period": latest_period,
        "totals_by_period": totals_by_period,
        "latest_totals": totals_by_period[latest_period],
        "groups": sorted(groups, key=lambda item: item["code"]),
    }
    return payload


def main() -> None:
    payload = build()
    write_json(root_path("data", "processed", "elstat_lfs.json"), payload)
    print(
        "Wrote ELSTAT LFS data for",
        payload["latest_period"],
        "with",
        len(payload["groups"]),
        "occupation groups",
    )


if __name__ == "__main__":
    main()
