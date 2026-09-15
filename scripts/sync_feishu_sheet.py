#!/usr/bin/env python3
"""Normalize the dated blocks in the New warehouse sheet without inventing values."""
import argparse
import json
import math
import os
import re
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "assets/data.json"
SHEET_URL = os.environ.get("FEISHU_SHEET_URL", "https://oh3i1ngnjc.feishu.cn/sheets/OGW6sJsnIh09patZsLzcDz8dnpg?sheet=DrEN0J")
SHEET_ID = parse_qs(urlparse(SHEET_URL).query).get("sheet", ["DrEN0J"])[0]
LARK_CLI = os.environ.get("LARK_CLI", "/Users/mac/Library/Application Support/YarboChicagoDashboard/.tools/lark-cli/lark-cli")
SKU_NAMES = {"车身Core": "车身 Core", "扫雪头SnowBlower": "扫雪头 Snow Blower", "割草头LawnMover": "割草头 Lawn Mower", "割草头LawnMower": "割草头 Lawn Mower", "割草头Pro": "割草头 Pro", "吹风头Blower": "吹风头 Blower", "无线充DockingStation": "无线充 Docking Station", "电池Battery": "电池 Battery", "Trimmer": "Trimmer", "Accessories": "Accessories"}
GROUP_NAMES = {"车身": "翻新车身", "割草头": "翻新割草头", "退运割草头": "退运草头", "入库\\整库\\机动": "入库/整库/机动", "入库/整库/机动产能": "入库/整库/机动"}
FIELD_NAMES = {"opening": "期初库存", "closing": "期末库存", "inbound": "入库", "outbound": "出库", "production": "今日产出", "staff": "到岗人数", "fte": "实际工作人数", "target": "目标产能", "actual": "实际产能", "perPerson": "人均产能", "rate": "达标率", "kpi": "每日人均KPI"}

def clean(value):
    if value is None:
        return ""
    if isinstance(value, dict):
        value = value.get("text", "")
    return str(value).strip()

def key(value):
    return re.sub(r"\s+", "", clean(value))

def number(value):
    value = clean(value).replace(",", "")
    if not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?", value):
        return None
    result = float(value.rstrip("%")) / (100 if value.endswith("%") else 1)
    return result if math.isfinite(result) else None

def date(value):
    match = re.fullmatch(r"(20\d{2})[/.-](\d{1,2})[/.-](\d{1,2})", clean(value))
    if not match:
        return None
    try:
        return datetime(*map(int, match.groups())).strftime("%Y-%m-%d")
    except ValueError:
        return None

def at(row, col):
    return row[col] if col is not None and col < len(row) else None

def column(header, prefix):
    return next((i for i, value in enumerate(header) if key(value).startswith(prefix)), None)

def run_lark(args):
    proc = subprocess.run([LARK_CLI, "sheets", *args, "--as", "user"], capture_output=True, text=True, timeout=120)
    if proc.returncode:
        raise RuntimeError("Feishu read failed; check local lark-cli authorization")
    result = json.loads(proc.stdout)
    if result.get("ok") is False:
        raise RuntimeError("Feishu returned an unsuccessful response")
    return result.get("data", result)

def read_source():
    meta = run_lark(["+info", "--url", SHEET_URL])
    sheets = meta["sheets"]
    sheets = sheets.get("sheets", []) if isinstance(sheets, dict) else sheets
    sheet = next((s for s in sheets if s.get("sheet_id") == SHEET_ID), None)
    if not sheet:
        raise RuntimeError("Requested sheet ID was not found; refusing to use another sheet")
    count = sheet["grid_properties"]["row_count"]
    values = []
    for start in range(1, count + 1, 400):
        data = run_lark(["+read", "--url", SHEET_URL, "--range", f"{SHEET_ID}!A{start}:AA{min(start + 399, count)}", "--value-render-option", "FormattedValue"])
        batch = data["valueRange"].get("values", [])
        expected = min(400, count - start + 1)
        values.extend(batch + [[] for _ in range(expected - len(batch))])
    return values

def parse_snapshots(values):
    blocks = [(i, date(at(r, 0))) for i, r in enumerate(values) if date(at(r, 0)) and column(r, "上一天期末库存") is not None and column(r, "岗位") is not None]
    snapshots = []
    for b, (start, day) in enumerate(blocks):
        end = blocks[b + 1][0] if b + 1 < len(blocks) else len(values)
        header = values[start]
        cols = {field: column(header, prefix) for field, prefix in {"opening": "上一天期末库存", "inbound": "今日入库", "outbound": "今日出库", "closing": "今日期末库存", "production": "今日产出", "note": "NOTE", "role": "岗位", "staff": "到岗人数", "fte": "调整后实际工作人数", "target": "目标产能", "actual": "实际产能", "perPerson": "人均产能", "rate": "达标率", "kpi": "KPI"}.items()}
        issues, skus, processes, summaries = [], [], [], []
        def issue(row, subject, field, kind, message):
            issues.append({"row": row + 1, "subject": subject, "field": field, "kind": kind, "message": message})
        def numeric(row, i, field, subject):
            raw = at(row, cols[field])
            result = number(raw)
            if clean(raw) and result is None and clean(raw) not in {"-", "/", "—"}:
                issue(i, subject, field, "formula" if clean(raw).startswith("#") else "text", f"{FIELD_NAMES[field]}原值 {clean(raw)}，保留为缺失")
            return result
        group = "未分组"
        for i in range(start + 1, end):
            row = values[i]
            # Weekly rollups are not daily stock or process records.
            if key(at(row, 0)) in {"日期", "周累计"}:
                break
            sku = SKU_NAMES.get(key(at(row, 0)))
            if sku:
                item = {"sku": sku, "sourceRow": i + 1}
                for field in ("opening", "inbound", "outbound", "closing", "production"):
                    item[field] = numeric(row, i, field, sku)
                item["note"] = clean(at(row, cols["note"]))
                item["balanceDelta"] = None
                if item["opening"] is not None and item["closing"] is not None:
                    delta = item["closing"] - item["opening"] - (item["inbound"] or 0) + (item["outbound"] or 0)
                    item["balanceDelta"] = round(delta, 4)
                    if abs(delta) > 0.001:
                        issue(i, sku, "balance", "balance", f"期末与期初＋已录入入库－已录入出库相差 {delta:g} 件，需核对空白或调整项")
                skus.append(item)
            raw_group = key(at(row, cols["role"] - 1))
            if raw_group and not date(raw_group) and raw_group not in {"项目", "产线项目"}:
                group = GROUP_NAMES.get(raw_group, raw_group)
            role = clean(at(row, cols["role"]))
            if not role and raw_group and any(number(at(row, cols[f])) is not None for f in ("staff", "fte", "actual")):
                role = "未细分"
            if not role or role in {"—", "岗位"} or number(role) is not None:
                continue
            subject = f"{group} · {role}"
            item = {"line": group, "name": role, "sourceRow": i + 1}
            for field in ("staff", "fte", "target", "actual", "perPerson", "rate", "kpi"):
                item[field] = numeric(row, i, field, subject)
            item["reportedPerPerson"] = item["perPerson"]
            item["reportedRate"] = item["rate"]
            item["perPerson"] = item["actual"] / item["fte"] if item["actual"] is not None and item["fte"] is not None and item["fte"] > 0 else None
            item["rate"] = item["actual"] / item["target"] if item["actual"] is not None and item["target"] is not None and item["target"] > 0 else None
            item["note"] = "；".join(clean(v) for v in row[16:] if clean(v))
            if role in {"总人数", "总计", "合计"}:
                summaries.append(item)
                continue
            if item["perPerson"] is not None and item["reportedPerPerson"] is not None and abs(item["perPerson"] - item["reportedPerPerson"]) > 0.11:
                issue(i, subject, "perPerson", "calculation", f"原表人效 {item['reportedPerPerson']:g}，按实际工作人数重算 {item['perPerson']:.2f}")
            if item["actual"] is not None and item["actual"] > 0 and not item["fte"]:
                issue(i, subject, "fte", "missing", "有产出但实际工作人数缺失或为零，无法计算人效")
            processes.append(item)
        if skus or processes:
            snapshots.append({"date": day, "sourceRow": start + 1, "skuRows": skus, "processes": processes, "reportedTotals": summaries, "issues": issues})
    if len({s["date"] for s in snapshots}) != len(snapshots):
        raise RuntimeError("Duplicate dated blocks detected; refusing ambiguous update")
    return sorted(snapshots, key=lambda s: s["date"])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, help="Saved Feishu read response for offline verification")
    parser.add_argument("--output", type=Path, default=DATA_PATH)
    args = parser.parse_args()
    if args.input:
        values = json.loads(args.input.read_text())["data"]["valueRange"]["values"]
    else:
        values = read_source()
    snapshots = parse_snapshots(values)
    if not snapshots:
        raise RuntimeError("No dated records; keeping the last valid data file")
    stamp = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
    for snapshot in snapshots:
        snapshot["syncedAt"] = stamp
    payload = {"schemaVersion": 2, "source": {"name": "库容流转表New", "sheetId": SHEET_ID, "url": SHEET_URL}, "syncedAt": stamp, "snapshotCount": len(snapshots), "snapshots": snapshots}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(args.output)
    print(json.dumps({"ok": True, "snapshots": len(snapshots), "first": snapshots[0]["date"], "latest": snapshots[-1]["date"], "issues": sum(len(s["issues"]) for s in snapshots)}, ensure_ascii=False))

if __name__ == "__main__":
    main()
