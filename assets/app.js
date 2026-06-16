const sampleSnapshots = [
  {
    date: "2026-06-12",
    syncedAt: "2026-06-12 10:05",
    skuRows: [
      { sku: "车身 Core", inbound: 8, inventory: 917, refurbished: 0, pending: 925 },
      { sku: "扫雪头 Snow Blower", inbound: 0, inventory: 213, refurbished: 0, pending: 213 },
      { sku: "割草头 Lawn Mower", inbound: 3, inventory: 858, refurbished: 0, pending: 861 },
      { sku: "割草头 Pro", inbound: 3, inventory: 136, refurbished: 0, pending: 139 },
      { sku: "吹风头 Blower", inbound: 0, inventory: 49, refurbished: 0, pending: 49 },
      { sku: "无线充 Docking Station", inbound: 4, inventory: 354, refurbished: 0, pending: 358 },
      { sku: "电池 Battery", inbound: 2, inventory: 274, refurbished: 0, pending: 276 },
      { sku: "Trimmer", inbound: 0, inventory: 13, refurbished: 0, pending: 13 },
      { sku: "Accessories", inbound: 1, inventory: 2, refurbished: 0, pending: 3 }
    ],
    processes: [
      { name: "冲洗", staff: 4, target: 10, actual: 9, perPerson: 2.25, note: "所有清洗员工请假半天" },
      { name: "维修", staff: 9, target: 18, actual: 18, perPerson: 2, note: "6 位员工请假半天" },
      { name: "二次检测", staff: 1, target: 16, actual: 19, perPerson: 19, note: "" },
      { name: "二次清洁", staff: 3, target: 18, actual: 18, perPerson: 6, note: "" },
      { name: "打包", staff: 3, target: 0, actual: 0, perPerson: 0, note: "当天未录入目标产能" }
    ]
  },
  {
    date: "2026-06-13",
    syncedAt: "2026-06-13 10:04",
    skuRows: [
      { sku: "车身 Core", inbound: 0, inventory: 925, refurbished: 0, pending: 925 },
      { sku: "扫雪头 Snow Blower", inbound: 0, inventory: 213, refurbished: 0, pending: 213 },
      { sku: "割草头 Lawn Mower", inbound: 0, inventory: 861, refurbished: 0, pending: 861 },
      { sku: "割草头 Pro", inbound: 0, inventory: 139, refurbished: 0, pending: 139 },
      { sku: "吹风头 Blower", inbound: 0, inventory: 49, refurbished: 0, pending: 49 },
      { sku: "无线充 Docking Station", inbound: 0, inventory: 358, refurbished: 0, pending: 358 },
      { sku: "电池 Battery", inbound: 0, inventory: 276, refurbished: 0, pending: 276 },
      { sku: "Trimmer", inbound: 0, inventory: 13, refurbished: 0, pending: 13 },
      { sku: "Accessories", inbound: 0, inventory: 3, refurbished: 0, pending: 3 }
    ],
    processes: [
      { name: "冲洗", staff: 0, target: 0, actual: 0, perPerson: 0, note: "" },
      { name: "维修", staff: 2, target: 8, actual: 8, perPerson: 4, note: "" },
      { name: "二次检测", staff: 1, target: 1, actual: 11, perPerson: 11, note: "" },
      { name: "二次清洁", staff: 3, target: 18, actual: 13, perPerson: 4.33, note: "" },
      { name: "打包", staff: 0, target: 0, actual: 0, perPerson: 0, note: "" }
    ]
  }
];

let dailySnapshots = [...sampleSnapshots];
let sortedSnapshots = [...dailySnapshots].sort((a, b) => a.date.localeCompare(b.date));
let latestSnapshot = sortedSnapshots[sortedSnapshots.length - 1];
let earliestSnapshot = sortedSnapshots[0];

const state = {
  mode: "day",
  startDate: "",
  endDate: "",
  simulatedSyncAt: null
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  loadDashboardData();
});

async function loadDashboardData() {
  try {
    const response = await fetch(`./assets/data.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`data.json ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.snapshots) || !payload.snapshots.length) {
      throw new Error("data.json has no snapshots");
    }
    dailySnapshots = payload.snapshots;
  } catch (error) {
    console.warn("Using built-in sample data:", error.message);
    dailySnapshots = [...sampleSnapshots];
  }

  sortedSnapshots = [...dailySnapshots].sort((a, b) => a.date.localeCompare(b.date));
  latestSnapshot = sortedSnapshots[sortedSnapshots.length - 1];
  earliestSnapshot = sortedSnapshots[0];
  state.startDate = latestSnapshot.date;
  state.endDate = latestSnapshot.date;
  hydrateControls();
  render();
}

function cacheElements() {
  [
    "startDate",
    "endDate",
    "dateSelect",
    "exportSnapshot",
    "simulateSync",
    "currentDateLabel",
    "snapshotCountLabel",
    "lastSyncLabel",
    "noticeBox",
    "overview",
    "trendChart",
    "trendPill",
    "repairPackageChart",
    "repairPackagePill",
    "insightList",
    "skuRows",
    "inventoryMix",
    "processSummary",
    "processCards",
    "processRows",
    "toast"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-range-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setMode(button.dataset.rangeMode);
    });
  });

  els.startDate.addEventListener("change", () => {
    state.mode = "custom";
    state.startDate = normalizeDateInput(els.startDate.value, state.startDate);
    if (state.startDate > state.endDate) state.endDate = state.startDate;
    syncInputs();
    render();
  });

  els.endDate.addEventListener("change", () => {
    state.mode = "custom";
    state.endDate = normalizeDateInput(els.endDate.value, state.endDate);
    if (state.endDate < state.startDate) state.startDate = state.endDate;
    syncInputs();
    render();
  });

  els.dateSelect.addEventListener("change", (event) => {
    const date = event.target.value;
    if (!date) return;
    applyRangeByMode(state.mode, date);
  });

  els.simulateSync.addEventListener("click", () => {
    state.simulatedSyncAt = new Date();
    render();
    showToast("已模拟刷新。真实上线后这里会触发飞书抓取任务。");
  });

  els.exportSnapshot.addEventListener("click", () => {
    const range = getSelectedRange();
    if (!range.snapshots.length) {
      showToast("当前范围暂无快照可导出。");
      return;
    }

    const text = buildExportText(range);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => showToast("当前范围快照已复制到剪贴板。"),
        () => {
          console.log(text);
          showToast("复制失败，快照已输出到控制台。");
        }
      );
    } else {
      console.log(text);
      showToast("浏览器不支持剪贴板，快照已输出到控制台。");
    }
  });
}

function hydrateControls() {
  els.dateSelect.innerHTML = sortedSnapshots
    .map((snapshot) => `<option value="${snapshot.date}">${formatDate(snapshot.date)}</option>`)
    .join("");

  [els.startDate, els.endDate].forEach((input) => {
    input.min = earliestSnapshot.date;
    input.max = latestSnapshot.date;
  });

  syncInputs();
}

function setMode(mode) {
  applyRangeByMode(mode, state.endDate);
}

function applyRangeByMode(mode, anchorDate) {
  state.mode = mode;
  const safeAnchor = clampDate(anchorDate, earliestSnapshot.date, latestSnapshot.date);

  if (mode === "day") {
    state.startDate = safeAnchor;
    state.endDate = safeAnchor;
  } else if (mode === "week") {
    state.endDate = safeAnchor;
    state.startDate = addDays(safeAnchor, -6);
  } else if (mode === "month") {
    state.endDate = safeAnchor;
    state.startDate = addDays(safeAnchor, -29);
  }

  syncInputs();
  render();
}

function syncInputs() {
  els.startDate.value = state.startDate;
  els.endDate.value = state.endDate;
  els.dateSelect.value = hasSnapshot(state.endDate) ? state.endDate : latestSnapshot.date;

  document.querySelectorAll("[data-range-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.rangeMode === state.mode);
  });
}

function render() {
  const range = getSelectedRange();
  const hasData = range.snapshots.length > 0;

  els.noticeBox.hidden = hasData;
  els.currentDateLabel.textContent = rangeLabel(state.startDate, state.endDate);
  els.snapshotCountLabel.textContent = hasData ? `${range.snapshots.length} 日数据` : "0 日数据";
  els.lastSyncLabel.textContent = hasData ? getLastSyncLabel(range) : "-";

  if (!hasData) {
    clearDashboard();
    return;
  }

  renderKpis(range);
  renderTrend(range);
  renderRepairPackageTrend(range);
  renderInsights(range);
  renderSkuTable(range);
  renderInventoryMix(range);
  renderProcesses(range);
}

function renderKpis(range) {
  const summary = summarizeRange(range);
  const previousRange = getPreviousRange(range);
  const previousSummary = previousRange.snapshots.length ? summarizeRange(previousRange) : null;
  const scopeText = `${range.snapshots.length} 日快照`;

  const cards = [
    {
      title: "退货 SKU 数量",
      value: summary.returnSkuCount,
      unit: "个",
      note: `范围内有退货入库的 SKU，占全部 ${summary.skuRows.length} 个 SKU`,
      cls: summary.returnSkuCount > 0 ? "warn" : "good"
    },
    {
      title: "退货件数",
      value: summary.inboundTotal,
      unit: "件",
      note: deltaText(summary.inboundTotal, previousSummary?.inboundTotal, scopeText),
      cls: summary.inboundTotal > 0 ? "warn" : "good"
    },
    {
      title: "期末总库存",
      value: summary.inventoryTotal,
      unit: "件",
      note: `取 ${formatDate(range.latest.date)} 快照库存`,
      cls: ""
    },
    {
      title: "期末待翻新库存",
      value: summary.pendingTotal,
      unit: "件",
      note: `占期末总库存 ${formatPercent(summary.pendingTotal / Math.max(summary.inventoryTotal, 1))}`,
      cls: summary.pendingTotal > summary.inventoryTotal ? "warn" : ""
    },
    {
      title: "流程总输出",
      value: summary.processActualTotal,
      unit: "件",
      note: `目标 ${summary.processTargetTotal} 件，达成 ${formatPercent(summary.processRate)}`,
      cls: summary.processRate >= 1 ? "good" : "warn"
    },
    {
      title: "到岗人次",
      value: summary.staffTotal,
      unit: "人次",
      note: `综合人效 ${round(summary.processActualTotal / Math.max(summary.staffTotal, 1), 2)} 件/人次`,
      cls: ""
    },
    {
      title: "低达标流程",
      value: summary.lowRateCount,
      unit: "个",
      note: summary.lowRateCount ? "达标率低于 90%，建议复盘产能或排班" : "全部有目标流程达标稳定",
      cls: summary.lowRateCount ? "warn" : "good"
    },
    {
      title: "最大库存 SKU",
      value: summary.topInventory.sku,
      unit: "",
      note: `${summary.topInventory.sku}，期末待翻新 ${summary.topInventory.pending} 件`,
      cls: ""
    }
  ];

  els.overview.innerHTML = cards
    .map((card) => `
      <article class="kpi-card ${card.cls}">
        <span>${card.title}</span>
        <strong>${formatNumber(card.value)}${card.unit ? `<small> ${card.unit}</small>` : ""}</strong>
        <small>${card.note}</small>
      </article>
    `)
    .join("");
}

function renderTrend(range) {
  const summaries = range.snapshots.map((snapshot) => ({
    date: snapshot.date,
    ...summarizeSnapshot(snapshot)
  }));

  if (!summaries.length) {
    els.trendChart.innerHTML = `<div class="empty-chart">当前范围暂无趋势数据</div>`;
    return;
  }

  const maxInventory = Math.max(...summaries.map((item) => item.inventoryTotal), ...summaries.map((item) => item.pendingTotal), 1);
  const maxInbound = Math.max(...summaries.map((item) => item.inboundTotal), 1);
  const width = 860;
  const height = 320;
  const pad = { top: 34, right: 32, bottom: 48, left: 60 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const slot = innerWidth / summaries.length;
  const points = summaries.map((item, index) => {
    const x = pad.left + slot * index + slot / 2;
    const y = pad.top + innerHeight - (item.pendingTotal / maxInventory) * innerHeight;
    return `${x},${y}`;
  });

  els.trendPill.textContent = `${summaries.length} 日快照`;

  els.trendChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#11151d" />
      <line x1="${pad.left}" y1="${pad.top + innerHeight}" x2="${width - pad.right}" y2="${pad.top + innerHeight}" stroke="#343a44" />
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + innerHeight}" stroke="#343a44" />
      ${[0.25, 0.5, 0.75, 1].map((level) => {
        const y = pad.top + innerHeight - innerHeight * level;
        return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#242a33" />`;
      }).join("")}
      ${summaries.map((item, index) => {
        const x = pad.left + slot * index + slot * 0.23;
        const barWidth = Math.min(54, Math.max(18, slot * 0.18));
        const inventoryHeight = (item.inventoryTotal / maxInventory) * innerHeight;
        const inboundHeight = (item.inboundTotal / maxInbound) * (innerHeight * 0.45);
        const inventoryY = pad.top + innerHeight - inventoryHeight;
        const inboundY = pad.top + innerHeight - inboundHeight;
        const pendingY = pad.top + innerHeight - (item.pendingTotal / maxInventory) * innerHeight;
        const centerX = pad.left + slot * index + slot / 2;
        return `
          <rect x="${x}" y="${inventoryY}" width="${barWidth}" height="${inventoryHeight}" rx="5" fill="#ffd21c" opacity="0.88" />
          <rect x="${x + barWidth + 10}" y="${inboundY}" width="${barWidth}" height="${inboundHeight}" rx="5" fill="#f6f1df" opacity="${item.inboundTotal ? "0.9" : "0.2"}" />
          <text x="${x + barWidth / 2}" y="${Math.max(inventoryY - 10, pad.top + 14)}" text-anchor="middle" fill="#fff7bf" font-size="13" font-weight="800">${formatNumber(item.inventoryTotal)}</text>
          <text x="${x + barWidth + 10 + barWidth / 2}" y="${item.inboundTotal ? Math.max(inboundY - 10, pad.top + 28) : pad.top + innerHeight - 10}" text-anchor="middle" fill="#f6f1df" font-size="13" font-weight="800">${formatNumber(item.inboundTotal)}</text>
          <text x="${centerX}" y="${Math.max(pendingY - 18, pad.top + 28)}" text-anchor="middle" fill="#ffad33" font-size="13" font-weight="800">${formatNumber(item.pendingTotal)}</text>
          <text x="${centerX}" y="${height - 18}" text-anchor="middle" fill="#a6a99f" font-size="12">${formatMonthDay(item.date)}</text>
        `;
      }).join("")}
      <polyline points="${points.join(" ")}" fill="none" stroke="#ff9f1c" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
      ${summaries.map((item, index) => {
        const [x, y] = points[index].split(",");
        return `<circle cx="${x}" cy="${y}" r="5" fill="#ff9f1c" stroke="#11151d" stroke-width="2" />`;
      }).join("")}
    </svg>
  `;
}

function renderRepairPackageTrend(range) {
  const summaries = range.snapshots.map((snapshot) => {
    const repair = getProcessValue(snapshot, "维修");
    const pack = getProcessValue(snapshot, "打包");
    return {
      date: snapshot.date,
      repair,
      pack
    };
  });

  if (!summaries.length) {
    els.repairPackagePill.textContent = "-";
    els.repairPackageChart.innerHTML = `<div class="empty-chart">当前范围暂无维修打包数据</div>`;
    return;
  }

  const repairTotal = summaries.reduce((total, item) => total + item.repair, 0);
  const packTotal = summaries.reduce((total, item) => total + item.pack, 0);
  els.repairPackagePill.textContent = `维修 ${formatNumber(repairTotal)} / 打包 ${formatNumber(packTotal)}`;

  const width = 860;
  const height = 300;
  const pad = { top: 34, right: 38, bottom: 48, left: 60 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(...summaries.map((item) => item.repair), ...summaries.map((item) => item.pack), 1);
  const slot = summaries.length > 1 ? innerWidth / (summaries.length - 1) : 0;
  const xFor = (index) => summaries.length > 1 ? pad.left + slot * index : pad.left + innerWidth / 2;
  const yFor = (value) => pad.top + innerHeight - (value / maxValue) * innerHeight;
  const repairPoints = summaries.map((item, index) => `${xFor(index)},${yFor(item.repair)}`);
  const packPoints = summaries.map((item, index) => `${xFor(index)},${yFor(item.pack)}`);

  els.repairPackageChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#11151d" />
      <line x1="${pad.left}" y1="${pad.top + innerHeight}" x2="${width - pad.right}" y2="${pad.top + innerHeight}" stroke="#343a44" />
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + innerHeight}" stroke="#343a44" />
      ${[0.25, 0.5, 0.75, 1].map((level) => {
        const y = pad.top + innerHeight - innerHeight * level;
        const label = Math.round(maxValue * level);
        return `
          <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#242a33" />
          <text x="${pad.left - 12}" y="${y + 4}" text-anchor="end" fill="#a6a99f" font-size="11">${label}</text>
        `;
      }).join("")}
      <polyline points="${repairPoints.join(" ")}" fill="none" stroke="#ffd21c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      <polyline points="${packPoints.join(" ")}" fill="none" stroke="#f6f1df" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${summaries.map((item, index) => {
        const x = xFor(index);
        const repairY = yFor(item.repair);
        const packY = yFor(item.pack);
        const packLabelY = Math.abs(packY - repairY) < 24 ? packY + 24 : packY - 12;
        return `
          <circle cx="${x}" cy="${repairY}" r="6" fill="#ffd21c" stroke="#11151d" stroke-width="2" />
          <text x="${x}" y="${Math.max(repairY - 14, pad.top + 16)}" text-anchor="middle" fill="#fff7bf" font-size="13" font-weight="900">${formatNumber(item.repair)}</text>
          <circle cx="${x}" cy="${packY}" r="6" fill="#f6f1df" stroke="#11151d" stroke-width="2" />
          <text x="${x}" y="${Math.min(Math.max(packLabelY, pad.top + 16), pad.top + innerHeight - 10)}" text-anchor="middle" fill="#f6f1df" font-size="13" font-weight="900">${formatNumber(item.pack)}</text>
          <text x="${x}" y="${height - 18}" text-anchor="middle" fill="#a6a99f" font-size="12">${formatMonthDay(item.date)}</text>
        `;
      }).join("")}
    </svg>
  `;
}

function renderInsights(range) {
  const summary = summarizeRange(range);
  const topReturns = summary.skuRows
    .filter((row) => row.inbound > 0)
    .sort((a, b) => b.inbound - a.inbound)
    .slice(0, 3);

  const lowProcesses = summary.processes
    .filter((process) => process.target > 0 && getRate(process) < 0.9)
    .sort((a, b) => getRate(a) - getRate(b));

  const insights = [];

  if (topReturns.length) {
    insights.push({
      title: "退货集中 SKU",
      text: topReturns.map((row) => `${row.sku} ${row.inbound} 件`).join("，")
    });
  } else {
    insights.push({
      title: "退货入库",
      text: "范围内未录入新增退货件数，库存变化以历史累积为主。"
    });
  }

  insights.push({
    title: "库存压力",
    text: `${summary.topInventory.sku} 期末待翻新库存最高，占期末待翻新总量 ${formatPercent(summary.topInventory.pending / Math.max(summary.pendingTotal, 1))}。`
  });

  if (lowProcesses.length) {
    insights.push({
      title: "产能未达标流程",
      text: lowProcesses.map((process) => `${process.name} ${formatPercent(getRate(process))}`).join("，")
    });
  } else {
    insights.push({
      title: "产能达成",
      text: `有目标流程整体达成 ${formatPercent(summary.processRate)}，范围输出 ${summary.processActualTotal} 件。`
    });
  }

  els.insightList.innerHTML = insights
    .map((item) => `
      <div class="insight">
        <strong>${item.title}</strong>
        <span>${item.text}</span>
      </div>
    `)
    .join("");
}

function renderSkuTable(range) {
  const summary = summarizeRange(range);
  els.skuRows.innerHTML = summary.skuRows
    .map((row) => {
      const status = getSkuStatus(row);
      return `
        <tr>
          <td>${row.sku}</td>
          <td class="num">${formatNumber(row.inbound)}</td>
          <td class="num">${formatNumber(row.inventory)}</td>
          <td class="num">${formatNumber(row.refurbished)}</td>
          <td class="num">${formatNumber(row.pending)}</td>
          <td><span class="status-tag ${status.cls}">${status.text}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderInventoryMix(range) {
  const summary = summarizeRange(range);
  const sorted = [...summary.skuRows].sort((a, b) => b.pending - a.pending);

  els.inventoryMix.innerHTML = sorted
    .map((row) => {
      const pct = row.pending / Math.max(summary.pendingTotal, 1);
      return `
        <div class="mix-item">
          <div class="mix-head">
            <strong>${row.sku}</strong>
            <span>${formatNumber(row.pending)} 件 · ${formatPercent(pct)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.max(pct * 100, 2)}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderProcesses(range) {
  const summary = summarizeRange(range);
  els.processSummary.textContent = `输出 ${summary.processActualTotal} / 目标 ${summary.processTargetTotal}`;
  els.processSummary.className = `pill ${summary.processRate >= 1 ? "good" : "warn"}`;

  els.processCards.innerHTML = summary.processes
    .map((process) => {
      const rate = getRate(process);
      return `
        <article class="process-card">
          <h4>${process.name}</h4>
          <div class="output">${formatNumber(process.actual)}<small> 件</small></div>
          <div class="rate-line">
            <span><b>达标率</b><b>${process.target ? formatPercent(rate) : "未设目标"}</b></span>
            <div class="bar-track">
              <div class="bar-fill" style="width:${process.target ? Math.min(rate * 100, 130) : 0}%"></div>
            </div>
          </div>
          <p>${process.staff} 人次，目标 ${formatNumber(process.target)} 件，综合人效 ${formatNumber(process.perPerson)} 件/人次</p>
        </article>
      `;
    })
    .join("");

  els.processRows.innerHTML = summary.processes
    .map((process) => {
      const rate = getRate(process);
      const tagClass = !process.target ? "muted" : rate >= 1 ? "good" : "warn";
      return `
        <tr>
          <td>${process.name}</td>
          <td class="num">${formatNumber(process.staff)}</td>
          <td class="num">${formatNumber(process.target)}</td>
          <td class="num">${formatNumber(process.actual)}</td>
          <td class="num">${formatNumber(process.perPerson)}</td>
          <td><span class="status-tag ${tagClass}">${process.target ? formatPercent(rate) : "未设目标"}</span></td>
          <td>${process.note || "-"}</td>
        </tr>
      `;
    })
    .join("");
}

function clearDashboard() {
  els.overview.innerHTML = "";
  els.trendChart.innerHTML = `<div class="empty-chart">当前范围暂无趋势数据</div>`;
  els.repairPackageChart.innerHTML = `<div class="empty-chart">当前范围暂无维修打包数据</div>`;
  els.repairPackagePill.textContent = "-";
  els.insightList.innerHTML = "";
  els.skuRows.innerHTML = "";
  els.inventoryMix.innerHTML = "";
  els.processSummary.textContent = "-";
  els.processCards.innerHTML = "";
  els.processRows.innerHTML = "";
}

function getSelectedRange() {
  const start = state.startDate <= state.endDate ? state.startDate : state.endDate;
  const end = state.startDate <= state.endDate ? state.endDate : state.startDate;
  const snapshots = sortedSnapshots.filter((snapshot) => snapshot.date >= start && snapshot.date <= end);
  return {
    start,
    end,
    snapshots,
    latest: snapshots[snapshots.length - 1] || null
  };
}

function getPreviousRange(range) {
  const dayCount = daysBetween(range.start, range.end) + 1;
  const previousEnd = addDays(range.start, -1);
  const previousStart = addDays(previousEnd, -(dayCount - 1));
  const snapshots = sortedSnapshots.filter((snapshot) => snapshot.date >= previousStart && snapshot.date <= previousEnd);
  return {
    start: previousStart,
    end: previousEnd,
    snapshots,
    latest: snapshots[snapshots.length - 1] || null
  };
}

function summarizeRange(range) {
  const skuMap = new Map();
  const processMap = new Map();

  range.snapshots.forEach((snapshot) => {
    snapshot.skuRows.forEach((row) => {
      const current = skuMap.get(row.sku) || {
        sku: row.sku,
        inbound: 0,
        inventory: 0,
        refurbished: 0,
        pending: 0,
        latestDate: ""
      };

      current.inbound += row.inbound || 0;
      current.refurbished += row.refurbished || 0;
      if (snapshot.date >= current.latestDate) {
        current.inventory = row.inventory || 0;
        current.pending = row.pending || 0;
        current.latestDate = snapshot.date;
      }
      skuMap.set(row.sku, current);
    });

    snapshot.processes.forEach((process) => {
      const current = processMap.get(process.name) || {
        name: process.name,
        staff: 0,
        target: 0,
        actual: 0,
        perPerson: 0,
        notes: []
      };

      current.staff += process.staff || 0;
      current.target += process.target || 0;
      current.actual += process.actual || 0;
      if (process.note) current.notes.push(`${formatMonthDay(snapshot.date)} ${process.note}`);
      processMap.set(process.name, current);
    });
  });

  const skuRows = [...skuMap.values()];
  const processes = [...processMap.values()].map((process) => ({
    ...process,
    perPerson: round(process.actual / Math.max(process.staff, 1), 2),
    note: process.notes.join("；")
  }));

  const inventoryTotal = skuRows.reduce((total, row) => total + row.inventory, 0);
  const pendingTotal = skuRows.reduce((total, row) => total + row.pending, 0);
  const inboundTotal = skuRows.reduce((total, row) => total + row.inbound, 0);
  const refurbishedTotal = skuRows.reduce((total, row) => total + row.refurbished, 0);
  const processTargetTotal = processes.reduce((total, process) => total + process.target, 0);
  const processActualTotal = processes.reduce((total, process) => total + process.actual, 0);
  const staffTotal = processes.reduce((total, process) => total + process.staff, 0);
  const topInventory = [...skuRows].sort((a, b) => b.pending - a.pending)[0] || { sku: "-", pending: 0 };

  return {
    skuRows,
    processes,
    returnSkuCount: skuRows.filter((row) => row.inbound > 0).length,
    inboundTotal,
    inventoryTotal,
    pendingTotal,
    refurbishedTotal,
    processTargetTotal,
    processActualTotal,
    processRate: processActualTotal / Math.max(processTargetTotal, 1),
    staffTotal,
    lowRateCount: processes.filter((process) => process.target > 0 && getRate(process) < 0.9).length,
    topInventory
  };
}

function summarizeSnapshot(snapshot) {
  return summarizeRange({
    start: snapshot.date,
    end: snapshot.date,
    snapshots: [snapshot],
    latest: snapshot
  });
}

function getProcessValue(snapshot, processName) {
  const process = snapshot.processes.find((item) => item.name === processName);
  return process ? process.actual || 0 : 0;
}

function hasSnapshot(date) {
  return sortedSnapshots.some((snapshot) => snapshot.date === date);
}

function getSkuStatus(row) {
  if (row.inbound > 0) return { text: "范围有退货", cls: "warn" };
  if (row.pending > 500) return { text: "库存高位", cls: "warn" };
  if (row.pending === 0) return { text: "已清空", cls: "good" };
  return { text: "稳定", cls: "muted" };
}

function getRate(process) {
  if (!process.target) return 0;
  return process.actual / process.target;
}

function getLastSyncLabel(range) {
  if (state.simulatedSyncAt) return formatDateTime(state.simulatedSyncAt);
  const latest = range.snapshots
    .map((snapshot) => snapshot.syncedAt)
    .sort()
    .at(-1);
  return latest || "-";
}

function buildExportText(range) {
  const summary = summarizeRange(range);
  return [
    `芝加哥售后仓范围：${rangeLabel(range.start, range.end)}`,
    `覆盖快照：${range.snapshots.length} 日`,
    `退货 SKU 数量：${summary.returnSkuCount}`,
    `范围退货件数：${summary.inboundTotal}`,
    `期末总库存：${summary.inventoryTotal}`,
    `期末待翻新库存：${summary.pendingTotal}`,
    `流程总输出：${summary.processActualTotal} / 目标 ${summary.processTargetTotal}`,
    "",
    "SKU 明细：",
    ...summary.skuRows.map((row) => `${row.sku}：范围退货 ${row.inbound}，期末库存 ${row.inventory}，期末待翻新 ${row.pending}`),
    "",
    "流程输出：",
    ...summary.processes.map((process) => `${process.name}：实际 ${process.actual}，目标 ${process.target}，达标率 ${process.target ? formatPercent(getRate(process)) : "未设目标"}`)
  ].join("\n");
}

function deltaText(current, previous, fallback) {
  if (previous === undefined || previous === null) return fallback;
  const delta = current - previous;
  if (delta === 0) return "较上一周期持平";
  return `较上一周期${delta > 0 ? "增加" : "减少"} ${formatNumber(Math.abs(delta))}`;
}

function normalizeDateInput(value, fallback) {
  if (!value) return fallback;
  return clampDate(value, earliestSnapshot.date, latestSnapshot.date);
}

function clampDate(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function addDays(value, amount) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount);
  return toDateInputValue(date);
}

function daysBetween(start, end) {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  return Math.round((endDate - startDate) / 86400000);
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeLabel(start, end) {
  if (start === end) return formatDate(start);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatNumber(value) {
  if (typeof value === "string") return value;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value || 0);
}

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${year}/${month}/${day}`;
}

function formatMonthDay(value) {
  const [, month, day] = value.split("-");
  return `${month}/${day}`;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}
