import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("sync", Path(__file__).resolve().parents[1] / "scripts/sync_feishu_sheet.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def header(day="2026/09/14", extra="NOTE"):
    return [day, "上一天期末库存", "今日入库数量", "今日出库数量", "今日期末库存", extra, "", "产线项目", "岗位", "到岗人数", "调整后实际工作人数（按实际在岗时长）", "目标产能", "实际产能", "人均产能", "达标率", "KPI 每人/每天"]


class ParsingTests(unittest.TestCase):
    def test_numbers_and_missing(self):
        for value in (None, "", "#REF!", "#DIV/0!", "含3寄修", "2人", "NaN", "—"):
            self.assertIsNone(sync.number(value))
        for value, expected in (("0", 0), ("2.5", 2.5), ("1,123", 1123), ("85%", .85), ("-3", -3)):
            self.assertEqual(sync.number(value), expected)

    def test_dates_are_not_weekly_labels(self):
        self.assertEqual(sync.date("2026/9/14"), "2026-09-14")
        for value in ("09/14", "2026/9/5 周六", "2026/2/30", "日期"):
            self.assertIsNone(sync.date(value))

    def test_totals_group_fill_and_recalculation(self):
        rows = [header(),
                ["车身 Core", 100, 3, None, 103, "含3寄修", "", "翻新车身", "总人数", 20, 20],
                ["Trimmer", 110, None, None, 117, "", "", "", "二次检测", 1, 1, 12, 10, 4, "83%"],
                ["", "", "", "", "", "", "", "翻新割草头", "打包", 1, .5, 6, 6, 12, "100%"]]
        day = sync.parse_snapshots(rows)[0]
        self.assertEqual(len(day["reportedTotals"]), 1)
        self.assertEqual(len(day["processes"]), 2)
        process = day["processes"][0]
        self.assertEqual(process["line"], "翻新车身")
        self.assertEqual(process["perPerson"], 10)
        self.assertEqual(process["reportedPerPerson"], 4)
        self.assertAlmostEqual(process["rate"], 10 / 12)
        self.assertEqual(day["skuRows"][0]["note"], "含3寄修")
        self.assertIsNone(day["skuRows"][0]["production"])
        self.assertIsNone(day["skuRows"][1]["inbound"])
        self.assertEqual(day["skuRows"][1]["balanceDelta"], 7)
        self.assertEqual({i["kind"] for i in day["issues"]}, {"balance", "calculation"})

    def test_weekly_rollup_excluded_and_groups_reset(self):
        rows = [header(), ["车身Core", 1, 0, 0, 1, "", "", "翻新车身", "维修", 1, 1, 4, 4],
                ["日期"], ["2026/9/5 周六", 999, 999, 999, 999, "", "", "错误汇总", "维修", 999, 999, 999, 999],
                header("2026/09/15"), ["车身Core", 1, 0, 0, 1, "", "", "", "维修", 1, 1, 4, 2]]
        days = sync.parse_snapshots(rows)
        self.assertEqual(len(days), 2)
        self.assertEqual(len(days[0]["processes"]), 1)
        self.assertEqual(days[1]["processes"][0]["line"], "未分组")

    def test_formula_missing_and_zero_target(self):
        day = sync.parse_snapshots([header(extra="今日产出"),
            ["车身Core", 1, "#REF!", None, 1, 5, "", "车身", "冲洗", None, None, 0, 60, "#DIV/0!", "#DIV/0!"]])[0]
        self.assertIsNone(day["skuRows"][0]["inbound"])
        self.assertEqual(day["skuRows"][0]["production"], 5)
        self.assertIsNone(day["processes"][0]["rate"])
        self.assertIsNone(day["processes"][0]["perPerson"])
        self.assertTrue(any(i["kind"] == "missing" for i in day["issues"]))

    def test_duplicate_day_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Duplicate"):
            sync.parse_snapshots([header(), ["车身Core", 1, 0, 0, 1], header(), ["车身Core", 1, 0, 0, 1]])

    def test_group_without_role_preserved(self):
        day = sync.parse_snapshots([header(), ["", "", "", "", "", "", "", "无线充", "", 2, 1, 10, 5]])[0]
        self.assertEqual(day["processes"][0]["name"], "未细分")
        self.assertEqual(day["processes"][0]["actual"], 5)


if __name__ == "__main__":
    unittest.main()
