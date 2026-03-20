from __future__ import annotations

import re
from urllib.parse import urljoin
from xml.etree import ElementTree as ET

from common import (
    download_file,
    extract_links,
    fetch_text,
    greek_month_to_number,
    normalize_space,
    root_path,
    write_json,
)


PAGE_URL = "https://ypergasias.gov.gr/apascholisi/ektheseis-p-s-ergani/"
MONTH_PATTERN = re.compile(
    r"(Ιανουάριος|Φεβρουάριος|Μάρτιος|Απρίλιος|Μάιος|Μάϊος|Ιούνιος|Ιούλιος|Αύγουστος|Σεπτέμβριος|Οκτώβριος|Νοέμβριος|Δεκέμβριος)\s+(\d{4})"
)
NUMBER_PATTERN = r"[-+]?\d{1,3}(?:\.\d{3})+|[-+]?\d+"


def greek_number_to_int(text: str | None) -> int | None:
    if text is None:
        return None
    cleaned = text.replace(".", "").replace(" ", "")
    if not cleaned:
        return None
    return int(cleaned)


def decode_doc_bytes(blob: bytes) -> str:
    # The current ERGANI .doc files expose readable UTF-16LE text streams.
    return blob.decode("utf-16le", errors="ignore")


def decode_docx_bytes(blob: bytes) -> str:
    from zipfile import ZipFile
    import io

    with ZipFile(io.BytesIO(blob)) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    return "".join(node.text or "" for node in root.iter() if node.tag.endswith("}t"))


def extract_metrics(text: str) -> dict[str, int | str | None]:
    compact = text.replace("\x07", " ").replace("\r", " ")
    compact = normalize_space(compact)

    def capture(pattern: str) -> int | None:
        match = re.search(pattern, compact, re.IGNORECASE)
        if not match:
            return None
        return greek_number_to_int(match.group(1))

    monthly_hires = capture(r"οι αναγγελίες πρόσληψης ανήλθαν σε\s+(" + NUMBER_PATTERN + r")")
    monthly_departures = capture(r"ενώ οι αποχωρήσεις σε\s+(" + NUMBER_PATTERN + r")")
    voluntary_departures = capture(r"οι\s+(" + NUMBER_PATTERN + r")\s+προήλθαν από οικειοθελείς αποχωρήσεις")
    dismissals_and_expiries = capture(
        r"και οι\s+(" + NUMBER_PATTERN + r")\s+από καταγγελίες συμβάσεων αορίστου χρόνου ή λήξεις συμβάσεων ορισμένου χρόνου"
    )
    monthly_balance = capture(
        r"ισοζύγιο προσλήψεων[^.]*?κατά\s+(" + NUMBER_PATTERN + r")\s+θέσεις εργασίας"
    )
    previous_year_same_month_balance = capture(
        r"ισοζυγίου\s+\((" + NUMBER_PATTERN + r")\)\s+τον\s+Δεκέμβριο του 2024"
    )
    annual_balance = capture(
        r"Το ισοζύγιο των ροών μισθωτής απασχόλησης του έτους\s+\d{4}\s+είναι\s+\S+\s+και διαμορφώνεται στις\s+(" + NUMBER_PATTERN + r")\s+νέες θέσεις εργασίας"
    )
    annual_hires = capture(
        r"Αθροιστικά για την περίοδο.*?οι αναγγελίες προσλήψεων ανήλθαν στις\s+(" + NUMBER_PATTERN + r")\s+θέσεις εργασίας"
    )
    annual_departures = capture(
        r"Αθροιστικά για την περίοδο.*?οι αποχωρήσεις έφτασαν τις\s+(" + NUMBER_PATTERN + r")"
    )
    final_annual_balance = capture(
        r"τελική τιμή του ισοζυγίου ροών μισθωτής απασχόλησης[^.]*?διαμορφώνεται στις\s+(" + NUMBER_PATTERN + r")\s+νέες θέσεις εργασίας"
    )

    return {
        "monthly_balance": monthly_balance,
        "monthly_hires": monthly_hires,
        "monthly_departures": monthly_departures,
        "voluntary_departures": voluntary_departures,
        "dismissals_and_expiries": dismissals_and_expiries,
        "previous_year_same_month_balance": previous_year_same_month_balance,
        "annual_balance": annual_balance,
        "annual_hires": annual_hires,
        "annual_departures": annual_departures,
        "final_annual_balance_with_manual_submissions": final_annual_balance,
    }


def parse_report(report: dict) -> dict | None:
    if report is None:
        return None
    raw_dir = root_path("data", "raw", "ergani")
    raw_dir.mkdir(parents=True, exist_ok=True)
    filename = report["url"].rsplit("/", 1)[-1]
    destination = raw_dir / filename
    if not destination.exists():
        download_file(report["url"], destination)

    blob = destination.read_bytes()
    if destination.suffix.lower() == ".doc":
        text = decode_doc_bytes(blob)
    elif destination.suffix.lower() == ".docx":
        text = decode_docx_bytes(blob)
    else:
        return {
            "status": "unsupported_format",
            "path": str(destination),
            "format": destination.suffix.lower(),
        }

    metrics = extract_metrics(text)
    return {
        "status": "parsed",
        "path": str(destination),
        "format": destination.suffix.lower(),
        "metrics": metrics,
    }


def build() -> dict:
    links = extract_links(fetch_text(PAGE_URL))
    reports = []
    for link in links:
        label = normalize_space(link["label"])
        match = MONTH_PATTERN.search(label)
        is_special_issue = "Ειδικό" in label or "Ειδικό τεύχος" in label
        if not match and not is_special_issue:
            continue
        year = None
        month = None
        if match:
            month = greek_month_to_number(match.group(1))
            year = int(match.group(2))
        else:
            year_match = re.search(r"(\d{4})", label)
            year = int(year_match.group(1)) if year_match else None
        reports.append(
            {
                "label": label,
                "url": urljoin(PAGE_URL, link["href"]),
                "year": year,
                "month": month,
                "kind": "special_issue" if is_special_issue else "monthly_report",
            }
        )

    monthly_reports = sorted(
        [report for report in reports if report["kind"] == "monthly_report"],
        key=lambda report: (report["year"] or 0, report["month"] or 0),
        reverse=True,
    )
    special_issues = sorted(
        [report for report in reports if report["kind"] == "special_issue"],
        key=lambda report: report["year"] or 0,
        reverse=True,
    )
    latest_report = monthly_reports[0] if monthly_reports else (special_issues[0] if special_issues else None)
    parsed_latest_report = parse_report(latest_report)
    return {
        "source": {"page_url": PAGE_URL},
        "latest_report": latest_report,
        "latest_monthly_report": monthly_reports[0] if monthly_reports else None,
        "latest_special_issue": special_issues[0] if special_issues else None,
        "latest_report_parsed": parsed_latest_report,
        "reports": reports,
        "parsing_status": (
            "parsed_latest_report"
            if parsed_latest_report and parsed_latest_report.get("status") == "parsed"
            else "discovery_only - latest reports are published as a mix of doc/docx/pdf files"
        ),
    }


def main() -> None:
    payload = build()
    write_json(root_path("data", "processed", "ergani_sources.json"), payload)
    if payload["latest_report"] is None:
        print("No ERGANI reports discovered")
    else:
        print("Wrote ERGANI source index for", payload["latest_report"]["label"])


if __name__ == "__main__":
    main()
