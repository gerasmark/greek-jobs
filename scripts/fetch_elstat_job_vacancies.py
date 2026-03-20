from __future__ import annotations

from common import (
    DownloadedArtifact,
    extract_links,
    fetch_text,
    find_link,
    normalize_space,
    period_sort_key,
    root_path,
    write_json,
    xlsx_sheet_rows,
    download_file,
)


PUBLICATION_URL = "https://www.statistics.gr/en/statistics/-/publication/SJO41/-"
TABLE_LABEL = "Table 1. Job Vacancies to be filled in immediately, by economic activity section"


def _download_artifact() -> DownloadedArtifact:
    links = extract_links(fetch_text(PUBLICATION_URL))
    link = find_link(links, TABLE_LABEL)
    path = root_path("data", "raw", "elstat", "job_vacancies.xlsx")
    if not path.exists():
        cached = sorted(path.parent.glob("job_vacancies_*.*"))
        if cached:
            path = cached[-1]
        else:
            download_file(link["href"], path)
    return DownloadedArtifact(label=link["label"], url=link["href"], path=path)


def build() -> dict:
    artifact = _download_artifact()
    rows = xlsx_sheet_rows(artifact.path)
    header = rows[2]
    periods = [normalize_space(value) for value in header[2:] if normalize_space(value)]

    sectors = []
    for row in rows[3:]:
        code = normalize_space(row[0]) if len(row) > 0 else ""
        if not code or code == "Notes:":
            break
        label = normalize_space(row[1]) if len(row) > 1 else ""
        values = row[2 : 2 + len(periods)]
        history = []
        for period, raw in zip(periods, values):
            raw = normalize_space(raw)
            if not raw:
                continue
            history.append({"period": period, "vacancies": int(float(raw))})
        sectors.append(
            {
                "code": code,
                "label": label,
                "history": history,
                "latest_vacancies": history[-1]["vacancies"] if history else None,
            }
        )

    latest_period = sorted(periods, key=period_sort_key)[-1]
    latest_total = next(
        (
            sector["latest_vacancies"]
            for sector in sectors
            if sector["code"] == "TOTAL"
        ),
        None,
    )
    top_sectors = sorted(
        [sector for sector in sectors if sector["code"] != "TOTAL"],
        key=lambda sector: sector["latest_vacancies"] or 0,
        reverse=True,
    )[:5]

    return {
        "source": {
            "publication_url": PUBLICATION_URL,
            "table_label": artifact.label,
            "table_url": artifact.url,
        },
        "latest_period": latest_period,
        "latest_total": latest_total,
        "sectors": sectors,
        "top_sectors": top_sectors,
    }


def main() -> None:
    payload = build()
    write_json(root_path("data", "processed", "elstat_job_vacancies.json"), payload)
    print(
        "Wrote ELSTAT job vacancies data for",
        payload["latest_period"],
        "with total vacancies",
        payload["latest_total"],
    )


if __name__ == "__main__":
    main()
