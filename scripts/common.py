from __future__ import annotations

import html
import json
import re
import sys
import urllib.parse
import urllib.request
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor"
USER_AGENT = "Mozilla/5.0"
XML_NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def ensure_vendor_path() -> None:
    if str(VENDOR) not in sys.path:
        sys.path.insert(0, str(VENDOR))


def root_path(*parts: str) -> Path:
    return ROOT.joinpath(*parts)


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def safe_url(url: str) -> str:
    return urllib.parse.quote(url, safe=":/?&=%#-._~")


def fetch_bytes(url: str, *, timeout: int = 30) -> bytes:
    try:
        url.encode("ascii")
        request_url = url
    except UnicodeEncodeError:
        request_url = safe_url(url)
    request = urllib.request.Request(
        request_url,
        headers={"User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch_text(url: str, *, timeout: int = 30) -> str:
    return fetch_bytes(url, timeout=timeout).decode("utf-8", errors="ignore")


def download_file(url: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(fetch_bytes(url))
    return destination


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def parse_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = normalize_space(str(value))
    if not text:
        return None
    text = text.replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


def thousands_to_people(value: Any) -> int | None:
    number = parse_number(value)
    if number is None:
        return None
    return int(round(number * 1000))


def period_sort_key(period: str) -> tuple[int, int]:
    year, quarter = period.split("-Q")
    return int(year), int(quarter)


def greek_month_to_number(name: str) -> int | None:
    normalized = unicodedata.normalize("NFD", name.upper())
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    mapping = {
        "ΙΑΝΟΥΑΡΙΟΣ": 1,
        "ΦΕΒΡΟΥΑΡΙΟΣ": 2,
        "ΜΑΡΤΙΟΣ": 3,
        "ΑΠΡΙΛΙΟΣ": 4,
        "ΜΑΙΟΣ": 5,
        "ΜΑΪΟΣ": 5,
        "ΙΟΥΝΙΟΣ": 6,
        "ΙΟΥΛΙΟΣ": 7,
        "ΑΥΓΟΥΣΤΟΣ": 8,
        "ΑΥΓΟΥΣΤΟΣ": 8,
        "ΣΕΠΤΕΜΒΡΙΟΣ": 9,
        "ΟΚΤΩΒΡΙΟΣ": 10,
        "ΝΟΕΜΒΡΙΟΣ": 11,
        "ΔΕΚΕΜΒΡΙΟΣ": 12,
    }
    return mapping.get(normalized)


class LinkExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[dict[str, str]] = []
        self._href: str | None = None
        self._text_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        attrs_dict = dict(attrs)
        self._href = attrs_dict.get("href")
        self._text_parts = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or self._href is None:
            return
        label = normalize_space(html.unescape("".join(self._text_parts)))
        href = html.unescape(self._href)
        self.links.append({"label": label, "href": href})
        self._href = None
        self._text_parts = []


def extract_links(page_html: str) -> list[dict[str, str]]:
    parser = LinkExtractor()
    parser.feed(page_html)
    return parser.links


def find_link(links: list[dict[str, str]], label_substring: str) -> dict[str, str]:
    needle = normalize_space(label_substring).lower()
    for link in links:
        if needle in link["label"].lower():
            return link
    raise KeyError(f"Could not find link containing label: {label_substring}")


def normalize_quarter_label(label: str) -> str | None:
    cleaned = normalize_space(label).lower()
    match = re.match(r"(\d+)(?:st|nd|rd|th|d)? quarter(?: of)? (\d{4})", cleaned)
    if not match:
        return None
    quarter = int(match.group(1))
    year = int(match.group(2))
    if quarter < 1 or quarter > 4:
        return None
    return f"{year}-Q{quarter}"


def xls_sheet_rows(path: Path, *, sheet_index: int = 0) -> list[list[Any]]:
    ensure_vendor_path()
    import xlrd  # type: ignore

    workbook = xlrd.open_workbook(str(path))
    sheet = workbook.sheet_by_index(sheet_index)
    return [sheet.row_values(row_index) for row_index in range(sheet.nrows)]


def col_letters_to_index(value: str) -> int:
    total = 0
    for char in value:
        total = total * 26 + (ord(char.upper()) - 64)
    return total - 1


def cell_ref_to_position(cell_ref: str) -> tuple[int, int]:
    match = re.match(r"([A-Z]+)(\d+)", cell_ref)
    if not match:
        raise ValueError(f"Unsupported cell reference: {cell_ref}")
    col = col_letters_to_index(match.group(1))
    row = int(match.group(2)) - 1
    return row, col


def _xlsx_shared_strings(archive: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for item in root.findall("main:si", XML_NS):
        texts = [node.text or "" for node in item.iterfind(".//main:t", XML_NS)]
        values.append("".join(texts))
    return values


def _xlsx_sheet_target(archive: ZipFile, sheet_name: str | None, sheet_index: int) -> str:
    workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
    sheets = workbook_root.find("main:sheets", XML_NS)
    if sheets is None:
        raise ValueError("Workbook is missing sheet definitions")

    sheet_entries = list(sheets)
    if sheet_name is None:
        sheet = sheet_entries[sheet_index]
    else:
        sheet = next(
            item for item in sheet_entries if item.attrib.get("name") == sheet_name
        )
    rel_id = sheet.attrib[f"{{{XML_NS['rel']}}}id"]

    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for relationship in relationships:
        if relationship.attrib.get("Id") == rel_id:
            return "xl/" + relationship.attrib["Target"]
    raise KeyError(f"Could not resolve sheet relationship: {rel_id}")


def xlsx_sheet_rows(path: Path, *, sheet_name: str | None = None, sheet_index: int = 0) -> list[list[str]]:
    with ZipFile(path) as archive:
        shared_strings = _xlsx_shared_strings(archive)
        sheet_target = _xlsx_sheet_target(archive, sheet_name, sheet_index)
        sheet_root = ET.fromstring(archive.read(sheet_target))

    rows_root = sheet_root.find("main:sheetData", XML_NS)
    if rows_root is None:
        return []

    rows: list[list[str]] = []
    for row_node in rows_root.findall("main:row", XML_NS):
        row_values: list[str] = []
        for cell in row_node.findall("main:c", XML_NS):
            ref = cell.attrib["r"]
            _, col_index = cell_ref_to_position(ref)
            while len(row_values) <= col_index:
                row_values.append("")

            cell_type = cell.attrib.get("t")
            value_node = cell.find("main:v", XML_NS)
            inline_node = cell.find("main:is/main:t", XML_NS)
            value = ""
            if cell_type == "s" and value_node is not None:
                value = shared_strings[int(value_node.text)]
            elif cell_type == "inlineStr" and inline_node is not None:
                value = inline_node.text or ""
            elif value_node is not None and value_node.text is not None:
                value = value_node.text
            row_values[col_index] = value
        rows.append(row_values)
    return rows


@dataclass
class DownloadedArtifact:
    label: str
    url: str
    path: Path
