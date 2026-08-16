#!/usr/bin/env python3
"""Remove oversized section-row heights that create blank pages in Google Docs.

The source business-plan template wraps each Q1-Q4 section in an outer table.
Its section body rows carry page-sized ``w:trHeight`` values. Word tolerates
those minimum heights, while Google Docs can move the whole row to the next
page, stranding the section heading above a large blank area. This script
removes only those outer section-body row heights and explicitly allows the
rows to split across pages. Nested tables, images, text, and styling remain
untouched.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}


def paragraph_text(element: etree._Element) -> str:
    return "".join(element.xpath(".//w:t/text()", namespaces=NS))


def row_text(row: etree._Element) -> str:
    return " ".join(
        paragraph_text(paragraph)
        for paragraph in row.xpath("./w:tc/w:p", namespaces=NS)
    ).strip()


def patch_document_xml(data: bytes) -> tuple[bytes, list[str]]:
    root = etree.fromstring(data)
    body = root.find(f"{{{W_NS}}}body")
    if body is None:
        raise RuntimeError("word/document.xml has no w:body")

    # The source contains cover/header tables before the Q1-Q4 section table,
    # so locate the unique table by its four direct section-heading rows rather
    # than assuming it is the first table in the document body.
    candidate_tables: list[etree._Element] = []
    for table in body.xpath(".//w:tbl", namespaces=NS):
        direct_rows = table.findall(f"{{{W_NS}}}tr")
        headings = {row_text(row).split(maxsplit=1)[0] for row in direct_rows}
        if {f"Q{number}." for number in range(1, 5)} <= headings:
            candidate_tables.append(table)

    if len(candidate_tables) != 1:
        raise RuntimeError(
            "Expected one Q1-Q4 section table; "
            f"found {len(candidate_tables)} candidates"
        )
    outer_table = candidate_tables[0]

    rows = outer_table.findall(f"{{{W_NS}}}tr")
    patched_sections: list[str] = []

    for index, row in enumerate(rows[:-1]):
        heading = row_text(row)
        if not any(heading.startswith(f"Q{number}.") for number in range(1, 5)):
            continue

        body_row = rows[index + 1]
        properties = body_row.find(f"{{{W_NS}}}trPr")
        if properties is None:
            properties = etree.Element(f"{{{W_NS}}}trPr")
            body_row.insert(0, properties)

        heights = properties.findall(f"{{{W_NS}}}trHeight")
        if not heights:
            raise RuntimeError(f"Expected a fixed/minimum height after {heading!r}")
        for height in heights:
            properties.remove(height)

        # Absence of w:cantSplit is the portable OOXML signal that the row may
        # flow across pages. Remove it if a prior editor added it.
        for cant_split in properties.findall(f"{{{W_NS}}}cantSplit"):
            properties.remove(cant_split)

        patched_sections.append(heading)

    expected = {f"Q{number}." for number in range(1, 5)}
    found = {section.split(maxsplit=1)[0] for section in patched_sections}
    if found != expected:
        raise RuntimeError(
            f"Expected Q1-Q4 section rows; found {patched_sections!r}"
        )

    return (
        etree.tostring(
            root,
            xml_declaration=True,
            encoding="UTF-8",
            standalone="yes",
        ),
        patched_sections,
    )


def patch_docx(source: Path, output: Path) -> list[str]:
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(source, "r") as source_zip:
        patched_xml, sections = patch_document_xml(
            source_zip.read("word/document.xml")
        )
        with ZipFile(output, "w", compression=ZIP_DEFLATED) as output_zip:
            for info in source_zip.infolist():
                data = (
                    patched_xml
                    if info.filename == "word/document.xml"
                    else source_zip.read(info.filename)
                )
                output_zip.writestr(info, data)
    return sections


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    sections = patch_docx(args.input, args.output)
    print(f"input={args.input}")
    print(f"output={args.output}")
    print("patched=" + ", ".join(sections))


if __name__ == "__main__":
    main()
