from __future__ import annotations

import re
from urllib.parse import urljoin

from common import (
    DownloadedArtifact,
    extract_links,
    fetch_text,
    find_link,
    greek_month_to_number,
    normalize_space,
    root_path,
    write_json,
    xlsx_sheet_rows,
    download_file,
)


PAGE_URL = "https://www.dypa.gov.gr/statistika"
TABLE_LABEL = "Στοιχεία ανέργων και επιδοτούμενων"


def _download_artifact() -> DownloadedArtifact:
    links = extract_links(fetch_text(PAGE_URL))
    link = find_link(links, TABLE_LABEL)
    file_url = urljoin(PAGE_URL, link["href"])
    path = root_path("data", "raw", "dypa", "registered_unemployment.xlsx")
    if not path.exists():
        cached = sorted(path.parent.glob("registered_unemployment_*.xlsx"))
        if cached:
            path = cached[-1]
        else:
            download_file(file_url, path)
    return DownloadedArtifact(label=link["label"], url=file_url, path=path)


def _sheet_title_to_period(value: str) -> str | None:
    text = normalize_space(value)
    match = re.search(r"([Α-ΩA-ZΪΫ]+)\s+(\d{4})", text.upper())
    if not match:
        return None
    month = greek_month_to_number(match.group(1))
    year = int(match.group(2))
    if month is None:
        return None
    return f"{year}-{month:02d}"


def build() -> dict:
    artifact = _download_artifact()
    rows = xlsx_sheet_rows(artifact.path, sheet_name="ΣΥΝΟΛΟ")

    report_title = normalize_space(rows[1][0])
    period = _sheet_title_to_period(report_title)

    subsidized_total = int(rows[4][3])
    paid_and_still_eligible = int(rows[4][4])
    new_applications = int(rows[4][5])

    over_12 = int(rows[7][2])
    under_12 = int(rows[8][2])
    total_registered = int(rows[9][2])

    regions = []
    for row in rows[23:]:
        if len(row) < 4:
            continue
        region = normalize_space(row[0])
        if not region:
            continue
        if region.startswith("ΣΥΝΟΛΟ"):
            break
        long_term = int(float(row[1]))
        short_term = int(float(row[2]))
        total = int(float(row[3]))
        regions.append(
            {
                "region": region,
                "registered_over_12_months": long_term,
                "registered_under_12_months": short_term,
                "registered_total": total,
            }
        )

    top_regions = sorted(
        regions,
        key=lambda region: region["registered_total"],
        reverse=True,
    )[:5]

    return {
        "source": {
            "page_url": PAGE_URL,
            "table_label": artifact.label,
            "table_url": artifact.url,
        },
        "period": period,
        "report_title": report_title,
        "registered_over_12_months": over_12,
        "registered_under_12_months": under_12,
        "registered_total": total_registered,
        "subsidized_total": subsidized_total,
        "paid_and_still_eligible": paid_and_still_eligible,
        "new_subsidy_applications": new_applications,
        "top_regions": top_regions,
    }


def main() -> None:
    payload = build()
    write_json(
        root_path("data", "processed", "dypa_registered_unemployment.json"),
        payload,
    )
    print(
        "Wrote DYPA registered unemployment data for",
        payload["period"],
        "with total",
        payload["registered_total"],
    )


if __name__ == "__main__":
    main()
