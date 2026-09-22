/* =========================================================
   ecom-app.js — 电商诊断页主逻辑
   ========================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function toast(msg, type) {
    var wrap = $("toastWrap");
    var el = document.createElement("div");
    el.className = "toast " + (type ? "t-" + type : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity .3s"; el.style.opacity = "0";
      setTimeout(function () { wrap.removeChild(el); }, 300);
    }, 2600);
  }

  // 手动输入字段定义
  var INPUT_FIELDS = [
    { key: "gmv", label: "GMV（元）", prevKey: "prevGmv" },
    { key: "traffic", label: "访客数", prevKey: "prevTraffic" },
    { key: "paidTraffic", label: "付费访客", prevKey: "prevPaidTraffic" },
    { key: "freeTraffic", label: "免费访客", prevKey: "prevFreeTraffic" },
    { key: "orders", label: "成交订单数", prevKey: "prevOrders" },
    { key: "avgPrice", label: "客单价（元）", prevKey: "prevAvgPrice" },
    { key: "conversionRate", label: "转化率（小数）", prevKey: "prevConversionRate" },
    { key: "grossMargin", label: "毛利率（小数）", prevKey: "prevGrossMargin" },
    { key: "refundRate", label: "退款率（小数）" },
    { key: "cost", label: "总成本（元）", prevKey: "prevCost" },
    { key: "adSpend", label: "广告投放（元）", prevKey: "prevAdSpend" },
    { key: "inventoryTurnover", label: "库存周转率（次）", prevKey: "prevInventoryTurnover" },
  ];

  function initSamples() {
    $$(".sample-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var key = card.dataset.sample;
        var data = window.ECOM_DATA[key];
        if (!data) return;
        runAnalysis(JSON.parse(JSON.stringify(data)));
        toast("已载入样本：" + data.shop, "ok");
      });
    });

    $("btnToggleInput").addEventListener("click", function () {
      var box = $("manualInput");
      var willShow = box.hidden;
      if (willShow && !$("inputBody").children.length) buildInputTable();
      box.hidden = !willShow;
    });

    $("btnRunManual").addEventListener("click", function () {
      var data = collectManual();
      if (!data) { toast("请至少填写 GMV 等核心数据", "error"); return; }
      runAnalysis(data);
      toast("手动输入诊断完成", "ok");
    });
  }

  function buildInputTable() {
    var body = $("inputBody");
    body.innerHTML = INPUT_FIELDS.map(function (f) {
      var prevCell = f.prevKey ? '<td><input type="number" step="any" data-key="' + f.prevKey + '" /></td>' : '<td style="color:#ccc">—</td>';
      return '<tr><td>' + f.label + '</td><td><input type="number" step="any" data-key="' + f.key + '" /></td>' + prevCell + '</tr>';
    }).join("");
  }

  function collectManual() {
    var data = { shop: $("inShop").value || "我的店铺", period: $("inPeriod").value || "本月", tag: "自定义", summary: "", metrics: {} };
    var inputs = $$("input", $("inputBody"));
    inputs.forEach(function (inp) {
      var key = inp.dataset.key;
      var v = inp.value.trim();
      if (v === "") return;
      var num = parseFloat(v);
      if (!isNaN(num)) data.metrics[key] = num;
    });
    // 派生：缺转化率但有 orders+traffic
    if (data.metrics.conversionRate == null && data.metrics.orders != null && data.metrics.traffic != null && data.metrics.traffic > 0) {
      data.metrics.conversionRate = data.metrics.orders / data.metrics.traffic;
    }
    if (data.metrics.prevConversionRate == null && data.metrics.prevOrders != null && data.metrics.prevTraffic != null && data.metrics.prevTraffic > 0) {
      data.metrics.prevConversionRate = data.metrics.prevOrders / data.metrics.prevTraffic;
    }
    // 至少要有 gmv 或 (traffic+conv+aov)
    if (data.metrics.gmv == null && (data.metrics.traffic == null || data.metrics.conversionRate == null || data.metrics.avgPrice == null)) {
      return null;
    }
    return data;
  }

  function runAnalysis(shopData) {
    var result = window.EcomEngine.analyze(shopData);
    renderResult(result);
  }

  function renderResult(r) {
    // 评级
    $("ratingCard").hidden = false;
    var cls = r.rating.grade === "优秀" ? "is-ok" : (r.rating.grade === "正常" ? "is-normal" : "is-risk");
    $("ratingBanner").className = "rating-banner " + cls;
    $("rbGrade").textContent = r.rating.grade;
    $("rbTag").textContent = r.tag;
    $("rbSummary").textContent = r.rating.summary;

    // GMV 拆解
    $("decomposeCard").hidden = false;
    $("shopMeta").textContent = r.shop + " · " + r.period;
    renderGmvTree(r);
    renderAttribution(r);

    // 指标表
    $("ratioCard").hidden = false;
    renderRatioTable(r.ratios);

    // 四维度
    renderDimensions(r.dimensions);

    // 风险
    $("riskCard").hidden = false;
    renderRisks(r.risks);
  }

  function renderGmvTree(r) {
    var d = r.decompose, t = r.traffic;
    var fmt = r.fmt;
    var W = 960, H = 360;
    var cx = W / 2;

    function nodeG(cls, x, y, label, val, delta, w, h) {
      var tx = x - w / 2, ty = y - h / 2;
      var deltaCls = (delta != null && delta >= 0) ? "up" : "down";
      var deltaTxt = delta != null ? (delta >= 0 ? "↑" : "↓") + " " + fmt.fmtDelta(delta) : "";
      return '<g class="gmv-node ' + cls + '" transform="translate(' + tx + ',' + ty + ')">' +
        '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="8" ry="8"/>' +
        '<text class="gmv-node-title" x="' + (w / 2) + '" y="20" text-anchor="middle">' + escapeHtml(label) + '</text>' +
        '<text class="gmv-node-val" x="' + (w / 2) + '" y="42" text-anchor="middle">' + escapeHtml(val) + '</text>' +
        (deltaTxt ? '<text class="gmv-delta ' + deltaCls + '" x="' + (w / 2) + '" y="58" text-anchor="middle">' + escapeHtml(deltaTxt) + '</text>' : '') +
        '</g>';
    }

    var upCls = function (delta) { return (delta != null && delta < 0) ? "is-down" : (delta != null && delta > 0 ? "is-up" : ""); };

    var svg = '<svg class="gmv-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
    // 连线
    [[180, 150], [cx, 150], [W - 180, 150]].forEach(function (p) {
      svg += '<path class="gmv-connector" d="M' + cx + ' 95 L' + p[0] + ' 150"/>';
    });
    [[100, 260], [260, 260]].forEach(function (p) {
      svg += '<path class="gmv-connector" d="M180 220 L' + p[0] + ' 260"/>';
    });
    [[cx - 80, 260], [cx + 80, 260]].forEach(function (p) {
      svg += '<path class="gmv-connector" d="M' + cx + ' 220 L' + p[0] + ' 260"/>';
    });
    [[W - 260, 260], [W - 100, 260]].forEach(function (p) {
      svg += '<path class="gmv-connector" d="M' + (W - 180) + ' 220 L' + p[0] + ' 260"/>';
    });

    // 顶层 GMV
    svg += nodeG("l1", cx, 60, "GMV", fmt.money(d.gmv), d.gmvDelta, 200, 70);

    // 中层三因素
    svg += nodeG("l2 " + upCls(d.trafficDelta), 180, 190, "访客数（流量）", d.traffic != null ? (d.traffic + " 人") : "—", d.trafficDelta, 160, 70);
    svg += nodeG("l2 " + upCls(d.convDelta), cx, 190, "转化率", fmt.pct(d.conv, 2), d.convDelta, 160, 70);
    svg += nodeG("l2 " + upCls(d.aovDelta), W - 180, 190, "客单价", fmt.money(d.aov), d.aovDelta, 160, 70);

    // 底层明细
    // 流量分支：付费/免费
    svg += nodeG("l3 " + upCls(t.paidDelta), 100, 295, "付费访客", t.paid != null ? (t.paid + " 人") : "—", t.paidDelta, 130, 60);
    svg += nodeG("l3 " + upCls(t.freeDelta), 260, 295, "免费访客", t.free != null ? (t.free + " 人") : "—", t.freeDelta, 130, 60);
    // 转化分支：订单/付费占比
    svg += nodeG("l3", cx - 80, 295, "成交订单", r.metrics.orders != null ? (r.metrics.orders + " 单") : "—", null, 130, 60);
    svg += nodeG("l3", cx + 80, 295, "付费流量占比", fmt.pct(t.paidShare, 1), null, 130, 60);
    // 客单价分支：毛利/退款
    svg += nodeG("l3", W - 260, 295, "毛利率", fmt.pct(r.metrics.grossMargin, 1), null, 130, 60);
    svg += nodeG("l3", W - 100, 295, "退款率", fmt.pct(r.metrics.refundRate, 1), null, 130, 60);

    svg += '</svg>';
    $("gmvCanvas").innerHTML = svg;
  }

  function renderAttribution(r) {
    var attr = r.attribution;
    var cls = attr.mode === "loss" || attr.mode === "double_drop" || attr.mode === "conv_drop" ? "is-risk"
      : (attr.mode === "growth_paid" || attr.mode === "margin_squeeze" ? "is-warn" : "");
    $("attributionBox").className = "attribution-box " + cls;
    var pointsHtml = attr.points.map(function (p) { return "<div>" + escapeHtml(p) + "</div>"; }).join("");
    $("attributionBox").innerHTML = '<div class="ab-tag">GMV 归因 · ' + escapeHtml(attr.tag) + '</div>' +
      '<div class="ab-title">' + (r.decompose.gmvDelta != null && r.decompose.gmvDelta < 0 ? "GMV 下滑归因" : "GMV 增长归因") + '</div>' +
      '<div class="ab-points">' + pointsHtml + '</div>';
  }

  function renderRatioTable(ratios) {
    var html = '<thead><tr><th>指标</th><th>类别</th><th>数值</th><th>基准</th><th>评价</th></tr></thead><tbody>';
    ratios.forEach(function (r) {
      var b = (r.value != null) ? r.benchmark(r.value, r.ctx) : null;
      var val;
      if (r.value == null) val = "—";
      else if (r.unit === "money") val = r.fmt ? r.fmt(r.value) : r.value;
      else if (r.unit === "pct") val = (r.value * 100).toFixed(1) + "%";
      else if (r.unit === "ratio") val = r.value.toFixed(2);
      else if (r.unit === "times") val = r.value.toFixed(2) + " 次";
      else if (r.unit === "num") val = r.value + " 人";
      else val = r.value;
      var bcls = b === "ok" ? "b-ok" : (b === "normal" ? "b-normal" : "b-risk");
      var btxt = b === "ok" ? "优秀" : (b === "normal" ? "正常" : "风险");
      html += '<tr><td>' + r.name + '</td><td style="color:#5b6678">' + r.cat + '</td>' +
        '<td class="r-val">' + val + '</td><td style="color:#8a93a4;font-size:12px">' + r.base + '</td>' +
        '<td><span class="badge ' + bcls + '">' + btxt + '</span></td></tr>';
    });
    html += '</tbody>';
    $("ratioTable").innerHTML = html;
  }

  function renderDimensions(dims) {
    $("diagGrid").innerHTML = dims.map(function (dim) {
      var scoreCls = dim.score.cls === "ok" ? "b-ok" : (dim.score.cls === "normal" ? "b-normal" : "b-risk");
      var items = dim.items.map(function (it) {
        var b = it.status;
        var bcls = b === "ok" ? "b-ok" : (b === "normal" ? "b-normal" : "b-risk");
        var btxt = b === "ok" ? "优" : (b === "normal" ? "正" : (b === "risk" ? "险" : "—"));
        return '<div class="diag-item"><div class="di-line"><span class="di-label">' + it.label + '</span>' +
          '<span class="di-val">' + it.value + ' <span class="badge ' + bcls + '">' + btxt + '</span></span></div>' +
          '<div class="di-note">' + it.note + '</div></div>';
      }).join("");
      return '<div class="diag-card"><div class="diag-card-head">' +
        '<span class="dc-icon">' + dim.icon + '</span><h3>' + dim.name + '</h3>' +
        '<span class="dc-score badge ' + scoreCls + '">' + (dim.score.text || "—") + '</span></div>' +
        '<div class="diag-card-body">' + items + '</div></div>';
    }).join("");
  }

  function renderRisks(risks) {
    if (!risks.length) {
      $("riskList").innerHTML = '<div style="color:#8a93a4;padding:6px 0">暂未触发明确风险阈值。</div>';
      return;
    }
    $("riskList").innerHTML = risks.map(function (rk) {
      var pcls = "p-" + rk.priority;
      var ptxt = rk.priority === "high" ? "高优先级" : (rk.priority === "mid" ? "中优先级" : "低优先级");
      return '<div class="risk-item ' + pcls + '"><div class="ri-head"><span class="ri-prio ' + pcls + '">' + ptxt + '</span><span class="ri-title">' + escapeHtml(rk.title) + '</span></div>' +
        '<div class="ri-grid">' +
        '<span class="rig-label">数据依据</span><span class="rig-val">' + escapeHtml(rk.evidence) + '</span>' +
        '<span class="rig-label">潜在影响</span><span class="rig-val">' + escapeHtml(rk.impact) + '</span>' +
        '<span class="rig-label">建议对策</span><span class="rig-val">' + escapeHtml(rk.suggestion) + '</span>' +
        '</div></div>';
    }).join("");
  }

  function init() { initSamples(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
