#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "assets" / "data.json"
LOG_DIR = ROOT / "logs"
LARK_CLI = Path(os.environ.get("LARK_CLI", ROOT.parent / ".tools" / "lark-cli" / "lark-cli"))
SHEET_URL = os.environ.get(
    "FEISHU_SHEET_URL",
    "https://oh3i1ngnjc.feishu.cn/sheets/OGW6sJsnIh09patZsLzcDz8dnpg?sheet=J4ayxf",
)
SHEET_NAME = os.environ.get("FEISHU_SHEET_NAME", "库容流转表")

SKU_HEADER_ALIASES = {"今日入库数量", "今日入库", "入库数量"}
PROCESS_HEADER_ALIASES = {"岗位"}
SUMMARY_PROCESS_NAMES = {"总人数", "合计", "总计"}


def run_lark(args):
    cmd = [str(LARK_CLI), *args, "--as", "user"]
    proc = subprocess.run(cmd, cwd=ROOT.parent, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(f"lark-cli failed: {' '.join(cmd)}\n{proc.stdout}\n{proc.stderr}")
    return json.loads(proc.stdout)


def col_name(index):
    name = ""
    index += 1
    while index:
        index, rem = divmod(index - 1, 26)
        name = chr(65 + rem) + name
    return name


def normalize_cell(value):
    if value is None:
        return ""
    if isinstance(value, dict):
        if "text" in value:
            return str(value["text"]).strip()
        return json.dumps(value, ensure_ascii=False)
    return str(value).strip()


def as_number(value):
    text = normalize_cell(value).replace(",", "")
    if not text or text in {"-", "/"}:
        return 0
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return 0
    number = float(match.group(0))
    return int(number) if number.is_integer() else number


def parse_date(value):
    text = normalize_cell(value)
    if not text:
        return None
    for pattern in ("%Y/%m/%d", "%Y-%m-%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(text[:10], pattern).strftime("%Y-%m-%d")
        except ValueError:
            pass
    match = re.search(r"(20\d{2})[/-](\d{1,2})[/-](\d{1,2})", text)
    if match:
        year, month, day = match.groups()
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    return None


def get_sheet_info():
    payload = run_lark(["sheets", "+info", "--url", SHEET_URL])
    data = payload.get("data") or payload
    sheets_node = data.get("sheets") or data.get("sheet") or {}
    if isinstance(sheets_node, dict):
        sheets = sheets_node.get("sheets") or []
    else:
        sheets = sheets_node or []
    for sheet in sheets:
        title = sheet.get("title") or sheet.get("sheet_name")
        sheet_id = sheet.get("sheet_id") or sheet.get("sheetId") or sheet.get("id")
        if title == SHEET_NAME or sheet_id == "J4ayxf":
            return sheet
    if sheets:
        return sheets[0]
    raise RuntimeError("No sheets returned by Feishu")


def sheet_dimension(sheet):
    grid = sheet.get("grid_properties") or sheet.get("gridProperties") or {}
    rows = grid.get("row_count") or grid.get("rowCount") or sheet.get("row_count") or 500
    cols = grid.get("column_count") or grid.get("columnCount") or sheet.get("column_count") or 26
    return int(rows), int(cols)


def read_values(sheet_id, rows, cols):
    end_col = col_name(max(cols - 1, 25))
    read_range = f"{sheet_id}!A1:{end_col}{rows}"
    payload = run_lark([
        "sheets",
        "+read",
        "--url",
        SHEET_URL,
        "--range",
        read_range,
        "--value-render-option",
        "FormattedValue",
    ])
    data = payload.get("data") or payload
    value_range = data.get("valueRange") or data.get("value_range") or data
    values = value_range.get("values") or []
    return [[normalize_cell(cell) for cell in row] for row in values]


def cell(row, index):
    return row[index] if index < len(row) else ""


def is_blank_row(row, start=0, end=None):
    items = row[start:end]
    return all(not normalize_cell(item) for item in items)


def find_date_blocks(values):
    blocks = []
    for index, row in enumerate(values):
        date = parse_date(cell(row, 0))
        has_sku_header = any(normalize_cell(cell(row, col)) in SKU_HEADER_ALIASES for col in range(1, min(len(row), 6)))
        has_process_header = any(normalize_cell(cell(row, col)) in PROCESS_HEADER_ALIASES for col in range(5, min(len(row), 12)))
        if date and (has_sku_header or has_process_header):
            blocks.append({"row": index, "date": date})
    return blocks


def parse_sku_rows(values, start, end):
    rows = []
    for row_index in range(start + 1, end):
        row = values[row_index] if row_index < len(values) else []
        sku = normalize_cell(cell(row, 0))
        if not sku:
            if is_blank_row(row, 0, 5):
                continue
            continue
        rows.append({
            "sku": sku,
            "inbound": as_number(cell(row, 1)),
            "inventory": as_number(cell(row, 2)),
            "refurbished": as_number(cell(row, 3)),
            "pending": as_number(cell(row, 4)),
        })
    return rows


def parse_process_rows(values, start, end):
    header = values[start] if start < len(values) else []
    process_col = None
    for col in range(5, min(len(header), 14)):
        if normalize_cell(cell(header, col)) == "岗位":
            process_col = col
            break
    if process_col is None:
        process_col = 6

    rows = []
    for row_index in range(start + 1, end):
        row = values[row_index] if row_index < len(values) else []
        name = normalize_cell(cell(row, process_col))
        if not name or name in SUMMARY_PROCESS_NAMES:
            continue
        if is_blank_row(row, process_col, process_col + 8):
            continue
        staff = as_number(cell(row, process_col + 1))
        target = as_number(cell(row, process_col + 3))
        actual = as_number(cell(row, process_col + 5))
        per_person = as_number(cell(row, process_col + 6))
        note = " ".join(
            normalize_cell(cell(row, col))
            for col in range(process_col + 8, min(len(row), process_col + 12))
            if normalize_cell(cell(row, col))
        )
        rows.append({
            "name": name,
            "staff": staff,
            "target": target,
            "actual": actual,
            "perPerson": per_person,
            "note": note,
        })
    return rows


def parse_snapshots(values):
    blocks = find_date_blocks(values)
    snapshots = []
    for index, block in enumerate(blocks):
        next_row = blocks[index + 1]["row"] if index + 1 < len(blocks) else len(values)
        sku_rows = parse_sku_rows(values, block["row"], next_row)
        process_rows = parse_process_rows(values, block["row"], next_row)
        if not sku_rows and not process_rows:
            continue
        snapshots.append({
            "date": block["date"],
            "syncedAt": datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M"),
            "skuRows": sku_rows,
            "processes": process_rows,
        })
    snapshots.sort(key=lambda item: item["date"])
    return snapshots


def main():
    LOG_DIR.mkdir(exist_ok=True)
    sheet = get_sheet_info()
    sheet_id = sheet.get("sheet_id") or sheet.get("sheetId") or sheet.get("id") or "J4ayxf"
    rows, cols = sheet_dimension(sheet)
    values = read_values(sheet_id, rows, cols)
    snapshots = parse_snapshots(values)
    if not snapshots:
        raise RuntimeError("No dated snapshots parsed from Feishu sheet")

    payload = {
        "source": {
            "name": SHEET_NAME,
            "url": SHEET_URL,
            "sheetId": sheet_id,
        },
        "syncedAt": datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S"),
        "snapshotCount": len(snapshots),
        "snapshots": snapshots,
    }
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "snapshots": len(snapshots), "dataPath": str(DATA_PATH)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
