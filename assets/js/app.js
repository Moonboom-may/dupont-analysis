/* =========================================================
   app.js — 应用主逻辑
   - 上传 / 样本载入 / 解析 / 校验
   - 杜邦可视化（SVG 树）
   - 诊断渲染
   - 导出 Word
   - 隐私生命周期（二次确认清除）
   ========================================================= */

(function () {
  "use strict";

  // 全局状态
  var STATE = {
    uploadMode: "single",       // single | multi
    files: { single: null, balance: null, income: null, cashflow: null },
    parsedResults: [],          // 多文件解析结果数组
    singleParsed: null,
    statements: null,           // 合并后的 {balance,income,cashflow}
    meta: { company: "", period: "", unit: "元" },
    balanceCheck: null,
    dupont: null,
    diagnosis: null,
    aiInsight: "",
    activeStep: 1
  };

  // ---------- DOM helpers ----------
  function $(id) { return document.getElementById(id); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function toast(msg, type) {
    var wrap = $("toastWrap");
    var el = document.createElement("div");
    el.className = "toast " + (type ? "t-" + type : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity .3s";
      el.style.opacity = "0";
      setTimeout(function () { wrap.removeChild(el); }, 300);
    }, 2800);
  }

  function setStep(n) {
    STATE.activeStep = n;
    $$(".step-tab").forEach(function (t) {
      var s = parseInt(t.dataset.step, 10);
      t.classList.toggle("is-active", s === n);
      t.classList.toggle("is-done", s < n);
    });
    $$(".step-panel").forEach(function (p) {
      p.classList.toggle("is-active", p.id === "step-" + n);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- 上传模式切换 ----------
  function initUploadMode() {
    $$('input[name="uploadMode"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        STATE.uploadMode = this.value;
        $("singleBlock").classList.toggle("is-hidden", this.value !== "single");
        $("multiBlock").classList.toggle("is-hidden", this.value === "single");
        updateParseButton();
      });
    });
  }

  // ---------- 文件选择 ----------
  function initFileHandlers() {
    var dzSingle = $("dzSingle");
    var fileSingle = $("fileSingle");

    dzSingle.addEventListener("click", function () { fileSingle.click(); });
    fileSingle.addEventListener("change", function () {
      if (this.files[0]) setSingleFile(this.files[0]);
    });

    // 拖拽
    ["dragover", "dragenter"].forEach(function (ev) {
      dzSingle.addEventListener(ev, function (e) { e.preventDefault(); this.classList.add("is-dragover"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dzSingle.addEventListener(ev, function (e) { e.preventDefault(); this.classList.remove("is-dragover"); });
    });
    dzSingle.addEventListener("drop", function (e) {
      var f = e.dataTransfer.files[0];
      if (f) setSingleFile(f);
    });

    // 多文件
    $$(".dropzone.mini").forEach(function (dz) {
      var input = dz.querySelector("input");
      dz.addEventListener("click", function () { input.click(); });
      input.addEventListener("change", function () {
        if (this.files[0]) setMultiFile(dz.dataset.type, this.files[0], dz);
      });
      ["dragover", "dragenter"].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); this.classList.add("is-dragover"); });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); this.classList.remove("is-dragover"); });
      });
      dz.addEventListener("drop", function (e) {
        var f = e.dataTransfer.files[0];
        if (f) setMultiFile(dz.dataset.type, f, dz);
      });
    });

    $("btnParse").addEventListener("click", handleParse);
    $("btnClear").addEventListener("click", function () { clearAllInputs(); });
  }

  function setSingleFile(file) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast("仅支持 .docx 文件", "error"); return;
    }
    STATE.files.single = file;
    renderSingleTag(file);
    updateParseButton();
  }

  function setMultiFile(type, file, dzEl) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast("仅支持 .docx 文件", "error"); return;
    }
    STATE.files[type] = file;
    dzEl.classList.add("is-loaded");
    dzEl.querySelector(".dz-sub").textContent = "✓ " + file.name;
    renderMultiTags();
    updateParseButton();
  }

  function renderSingleTag(file) {
    var tag = $("singleFileTag");
    tag.hidden = false;
    tag.innerHTML = '<span>📄</span><span class="ft-name">' + escapeHtml(file.name) +
      ' <span style="color:#8a93a4">(' + formatSize(file.size) + ')</span></span>' +
      '<span class="ft-remove" data-clear="single">✕</span>';
    tag.querySelector(".ft-remove").addEventListener("click", function (e) {
      e.stopPropagation(); STATE.files.single = null; clearAllInputs(); renderSingleTag(null);
    });
  }
  function renderMultiTags() {
    var wrap = $("multiFileTags");
    wrap.innerHTML = "";
    ["balance", "income", "cashflow"].forEach(function (t) {
      var f = STATE.files[t]; if (!f) return;
      var div = document.createElement("div");
      div.className = "file-tag";
      div.innerHTML = '<span>' + sheetIcon(t) + '</span><span class="ft-name">' + sheetName(t) + '：' + escapeHtml(f.name) + '</span><span class="ft-remove" data-type="' + t + '">✕</span>';
      div.querySelector(".ft-remove").addEventListener("click", function () {
        STATE.files[t] = null;
        var dz = document.querySelector('.dropzone.mini[data-type="' + t + '"]');
        if (dz) { dz.classList.remove("is-loaded"); dz.querySelector(".dz-sub").textContent = "点击或拖入"; }
        renderMultiTags(); updateParseButton();
      });
      wrap.appendChild(div);
    });
  }

  function clearAllInputs() {
    STATE.files = { single: null, balance: null, income: null, cashflow: null };
    $("fileSingle").value = "";
    $$(".dropzone.mini input").forEach(function (i) { i.value = ""; });
    $$(".dropzone.mini").forEach(function (dz) { dz.classList.remove("is-loaded"); dz.querySelector(".dz-sub").textContent = "点击或拖入"; });
    $("singleFileTag").hidden = true;
    renderMultiTags();
    updateParseButton();
  }

  function updateParseButton() {
    var btn = $("btnParse");
    var ready;
    if (STATE.uploadMode === "single") {
      ready = !!STATE.files.single;
    } else {
      var n = ["balance", "income", "cashflow"].filter(function (t) { return STATE.files[t]; }).length;
      ready = n >= 1;
    }
    btn.disabled = !ready;
  }

  function sheetIcon(t) { return t === "balance" ? "🏦" : (t === "income" ? "📈" : "💧"); }
  function sheetName(t) { return t === "balance" ? "资产负债表" : (t === "income" ? "利润表" : "现金流量表"); }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function formatSize(n) { if (n < 1024) return n + "B"; if (n < 1048576) return (n / 1024).toFixed(1) + "KB"; return (n / 1048576).toFixed(1) + "MB"; }

  // ---------- 样本载入 ----------
  function initSamples() {
    $$(".sample-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var key = card.dataset.sample;
        var sample = window.SAMPLE_DATA[key];
        if (!sample) return;
        loadSample(sample);
        toast("已载入样本：" + sample.company, "ok");
      });
    });
  }

  function loadSample(sample) {
    STATE.meta = { company: sample.company, period: sample.period, unit: sample.unit };
    STATE.statements = sample.statements;
    STATE.parsedResults = [];
    STATE.singleParsed = null;
    clearAllInputs();
    runBalanceCheck();
    renderExtractGrid();
    runAnalysis();
    setStep(2);
    renderDupont();
  }

  // ---------- 解析 ----------
  function handleParse() {
    var btn = $("btnParse");
    btn.disabled = true; btn.textContent = "解析中…";

    if (STATE.uploadMode === "single") {
      var file = STATE.files.single;
      file.arrayBuffer().then(function (buf) {
        return window.DocxParser.parseDocx(buf);
      }).then(function (parsed) {
        STATE.singleParsed = parsed;
        STATE.meta = { company: parsed.company || "未识别企业", period: parsed.period || "报告期", unit: parsed.unit || "元" };
        // 合并：单文件已分类三表
        STATE.statements = parsed.statements;
        STATE.parsedResults = [parsed];
        afterParse();
      }).catch(function (err) {
        toast(err.message || "解析失败", "error");
        btn.disabled = false; btn.textContent = "开始解析与校验";
      });
    } else {
      // 多文件：依次解析
      var types = ["balance", "income", "cashflow"].filter(function (t) { return STATE.files[t]; });
      Promise.all(types.map(function (t) {
        return STATE.files[t].arrayBuffer().then(function (buf) {
          return window.DocxParser.parseDocx(buf).then(function (parsed) {
            parsed._type = t;
            return parsed;
          });
        });
      })).then(function (results) {
        STATE.parsedResults = results;
        // 取首个非空 meta
        var meta = { company: "", period: "", unit: "元" };
        results.forEach(function (r) {
          if (!meta.company && r.company) meta.company = r.company;
          if (!meta.period && r.period) meta.period = r.period;
          if (meta.unit === "元" && r.unit) meta.unit = r.unit;
        });
        STATE.meta = meta;
        // 合并：每个 parsed 仅含对应类型表（分类时已识别，但单文件分类可能不准；多文件按用户指定类型覆盖）
        var merged = { balance: {}, income: {}, cashflow: {} };
        results.forEach(function (r) {
          var t = r._type;
          // 重新按用户指定类型抽取该文件中的表
          var unitFactor = window.DocxParser.UNIT_FACTOR[r.unit] || 1;
          // 从 parsed.tables 找出最匹配本类型的表
          var bestTable = null, bestScore = -1;
          r.tables.forEach(function (rows) {
            var score = scoreTableForType(rows, t);
            if (score > bestScore) { bestScore = score; bestTable = rows; }
          });
          if (bestTable) {
            var items = window.DocxParser.extractItemsFromTable(bestTable, unitFactor);
            merged[t] = items;
          }
        });
        STATE.statements = merged;
        afterParse();
      }).catch(function (err) {
        toast(err.message || "解析失败", "error");
        btn.disabled = false; btn.textContent = "开始解析与校验";
      });
    }
  }

  // 为多文件场景打分：某张表与指定类型的匹配度
  function scoreTableForType(rows, type) {
    var text = rows.slice(0, 8).map(function (r) { return r.join(" "); }).join(" ");
    var kws = {
      balance: ["资产总计", "负债合计", "所有者权益", "资产负债表"],
      income: ["营业收入", "营业成本", "利润总额", "净利润", "利润表"],
      cashflow: ["经营活动产生的现金流量", "投资活动产生的现金流量", "现金流量表"]
    }[type] || [];
    var score = 0;
    kws.forEach(function (k) { if (text.indexOf(k) >= 0) score++; });
    return score;
  }

  function afterParse() {
    var btn = $("btnParse");
    btn.disabled = false; btn.textContent = "开始解析与校验";

    // 校验
    var blocked = runBalanceCheck();
    renderExtractGrid();

    if (blocked) {
      toast("资产负债表不平衡，已阻断分析。请检查数据或单位识别。", "error");
      return;
    }
    toast("解析与校验完成", "ok");
    runAnalysis();
    setStep(2);
    renderDupont();
  }

  function runBalanceCheck() {
    var result = window.DocxParser.checkBalance(STATE.statements);
    STATE.balanceCheck = result;
    renderVerify(result);
    return !result.pass && result.level === "block";
  }

  function renderVerify(result) {
    var statusEl = $("verifyStatus");
    var body = $("verifyBody");
    var cls = result.level === "ok" ? "is-ok" : (result.level === "block" ? "is-block" : (result.level === "incomplete" ? "" : "is-warn"));
    statusEl.className = "verify-status " + cls;
    statusEl.textContent = result.level === "ok" ? "校验通过" : (result.level === "block" ? "已阻断" : (result.level === "incomplete" ? "数据不全" : "警告"));

    if (result.level === "incomplete") {
      body.innerHTML = '<div class="verify-empty">' + escapeHtml(result.message) + "</div>";
      return;
    }
    var d = result.details;
    var html = '<div class="verify-row"><span class="vr-label">资产总计</span><span class="vr-val">' + fmtAmt(d.totalAssets) + '</span></div>' +
      '<div class="verify-row"><span class="vr-label">负债合计</span><span class="vr-val">' + fmtAmt(d.totalLiab) + '</span></div>' +
      '<div class="verify-row"><span class="vr-label">所有者权益合计</span><span class="vr-val">' + fmtAmt(d.totalEquity) + '</span></div>' +
      '<div class="verify-row"><span class="vr-label">负债 + 权益</span><span class="vr-val">' + fmtAmt(d.liabEquity) + '</span></div>';
    var diffCls = result.level === "ok" ? "" : "is-block";
    html += '<div class="verify-diff ' + diffCls + '">' + (result.level === "ok" ? "✓ " : "⚠ ") + escapeHtml(result.message) +
      '<br>差额：' + fmtAmt(d.diff) + ' · 相对偏差：' + (d.diffRatio * 100).toFixed(3) + '%（阈值 0.5%）</div>';
    body.innerHTML = html;
  }

  function fmtAmt(n) {
    if (n == null) return "—";
    var abs = Math.abs(n), sign = n < 0 ? "-" : "";
    if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + " 亿";
    if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + " 万";
    return sign + abs.toFixed(0) + " 元";
  }

  function renderExtractGrid() {
    var card = $("extractCard");
    var meta = $("companyMeta");
    if (!STATE.statements) { card.hidden = true; return; }
    card.hidden = false;
    meta.textContent = (STATE.meta.company || "—") + " · " + (STATE.meta.period || "—") + " · 单位：" + (STATE.meta.unit || "元");

    var b = STATE.statements.balance || {};
    var i = STATE.statements.income || {};
    var c = STATE.statements.cashflow || {};
    var items = [
      ["资产总计", b["资产总计"]],
      ["负债合计", b["负债合计"]],
      ["所有者权益", b["所有者权益合计"]],
      ["资产负债率", (b["资产总计"] != null && b["负债合计"] != null && b["资产总计"] !== 0) ? (b["负债合计"] / b["资产总计"]) : null, "pct"],
      ["营业收入", i["营业收入"]],
      ["净利润", i["净利润"]],
      ["营业利润", i["营业利润"]],
      ["经营现金流净额", c["经营活动产生的现金流量净额"]]
    ];
    var grid = $("extractGrid");
    grid.innerHTML = items.map(function (it) {
      var v = it[1];
      var display = it[2] === "pct" ? (v != null ? (v * 100).toFixed(2) + "%" : "—") : fmtAmt(v);
      return '<div class="ext-item"><div class="ei-label">' + it[0] + '</div><div class="ei-value">' + display + '</div></div>';
    }).join("");
  }

  // ---------- 分析 ----------
  function runAnalysis() {
    STATE.dupont = window.DupontEngine.analyze(STATE.statements);
    STATE.diagnosis = window.DiagnosisEngine.diagnose({
      statements: STATE.statements, dupont: STATE.dupont
    });
    STATE.aiInsight = "";
    renderDiagnosis();
    renderExportPreview();
  }

  // ---------- 杜邦渲染 ----------
  function renderDupont() {
    if (!STATE.dupont) return;
    var d = STATE.dupont;
    $("roeMeta").textContent = (STATE.meta.company || "—") + " · " + (STATE.meta.period || "—") + " · ROE " + d.fmt.pct(d.metrics.roe);

    var canvas = $("dupontCanvas");
    canvas.innerHTML = buildSvg(d.tree, d);

    // 驱动归因
    var drv = d.driver;
    var cls = drv.riskLevel === "risk" ? "is-risk" : (drv.riskLevel === "warn" ? "is-warn" : "");
    $("driverBox").className = "driver-box " + cls;
    $("driverBox").innerHTML = '<div class="db-tag">驱动归因 · ' + drv.tag + '</div>' +
      '<div class="db-title">' + escapeHtml(drv.title) + '</div>' +
      '<div class="db-desc">' + escapeHtml(drv.desc) + '</div>';

    // 节点点击
    $$(".dp-node", canvas).forEach(function (node) {
      node.addEventListener("click", function () {
        var id = node.dataset.id;
        showNodeDetail(d.tree, id, node);
      });
    });
  }

  function buildSvg(tree, d) {
    // 布局：顶层 1 个 → 中层 3 个 → 底层各 2 个
    var W = 1000, H = 440;
    var cx = W / 2;
    // 顶层
    var l1x = cx, l1y = 50;
    var l2y = 180;
    var l2xs = [180, 500, 820];
    var l2ids = ["netMargin", "assetTurn", "equityMult"];
    var l2labels = ["销售净利率", "总资产周转率", "权益乘数"];
    var l2vals = [d.fmt.pct(d.metrics.netMargin), d.fmt.times(d.metrics.assetTurn), d.fmt.raw(d.metrics.equityMult)];
    var l3y = 330;
    // 底层节点
    var leaves = [
      [["净利润", fmtAmt(d.core.netProfit)], ["营业收入", fmtAmt(d.core.revenue)]],
      [["营业收入", fmtAmt(d.core.revenue)], ["总资产", fmtAmt(d.core.totalAssets)]],
      [["总资产", fmtAmt(d.core.totalAssets)], ["所有者权益", fmtAmt(d.core.equity)]]
    ];
    var l3xs = [
      [l2xs[0] - 70, l2xs[0] + 70],
      [l2xs[1] - 70, l2xs[1] + 70],
      [l2xs[2] - 70, l2xs[2] + 70]
    ];

    var lossCls = (d.core.netProfit != null && d.core.netProfit < 0) ? "is-loss" : "";
    var levCls = (d.metrics.equityMult != null && d.metrics.equityMult > 5) ? "is-high-leverage" : "";

    var svg = '<svg class="dp-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
    // 连线（先画，在下层）
    // l1 -> l2
    l2xs.forEach(function (x) {
      svg += '<path class="dp-connector" d="M' + l1x + ' ' + (l1y + 30) + ' L' + x + ' ' + (l2y - 5) + '"/>';
    });
    // l2 -> l3
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 2; j++) {
        svg += '<path class="dp-connector" d="M' + l2xs[i] + ' ' + (l2y + 35) + ' L' + l3xs[i][j] + ' ' + (l3y - 5) + '"/>';
      }
    }

    // 顶层节点
    svg += nodeSvg(tree.id, "l1", l1x, l1y, tree.label, tree.value, 170, 60, "roe");

    // 中层
    for (var k = 0; k < 3; k++) {
      var cls2 = (k === 2 && levCls) ? levCls : "";
      svg += nodeSvg(l2ids[k], "l2 " + cls2, l2xs[k], l2y, l2labels[k], l2vals[k], 160, 70, l2ids[k]);
    }
    // 底层
    for (var m = 0; m < 3; m++) {
      for (var n = 0; n < 2; n++) {
        var lid = (m === 0 && n === 0) ? "netProfit" : (m === 0 && n === 1) ? "revenue" :
                  (m === 1 && n === 0) ? "revenue2" : (m === 1 && n === 1) ? "totalAssets" :
                  (m === 2 && n === 0) ? "totalAssets2" : "equity";
        var cls3 = (m === 0 && n === 0 && lossCls) ? lossCls : "";
        svg += nodeSvg(lid, "l3 " + cls3, l3xs[m][n], l3y, leaves[m][n][0], leaves[m][n][1], 120, 60, lid);
      }
    }

    svg += '</svg>';
    return svg;
  }

  function nodeSvg(id, cls, x, y, label, value, w, h, dataId) {
    var tx = x - w / 2, ty = y - h / 2;
    var lx = x, ly = y - 8;
    var vx = x, vy = y + 12;
    return '<g class="dp-node ' + cls + '" data-id="' + dataId + '" transform="translate(' + tx + ',' + ty + ')">' +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="8" ry="8"/>' +
      '<text class="dp-node-title" x="' + (w / 2) + '" y="22" text-anchor="middle">' + escapeHtml(label) + '</text>' +
      '<text class="dp-node-val" x="' + (w / 2) + '" y="44" text-anchor="middle">' + escapeHtml(value) + '</text>' +
      '</g>';
  }

  function showNodeDetail(tree, id, el) {
    var node = findNode(tree, id);
    if (!node) return;
    $$(".dp-node", $("dupontCanvas")).forEach(function (n) { n.classList.remove("is-active"); });
    if (el) el.classList.add("is-active");
    var card = $("nodeDetailCard");
    card.hidden = false;
    $("nodeDetailTitle").textContent = node.label + " · " + node.value;
    var extra = node.extra ? '<div class="nd-explain" style="margin-top:6px;color:#1f5fff;font-weight:600">' + escapeHtml(node.extra) + '</div>' : "";
    var childList = (node.children && node.children.length) ? '<div style="margin-top:14px"><strong>关联底层科目：</strong></div><ul style="margin:6px 0 0 18px">' +
      node.children.map(function (c) { return '<li>' + escapeHtml(c.label) + '：<span style="font-family:monospace;font-weight:600">' + escapeHtml(c.value) + '</span></li>'; }).join("") + '</ul>' : "";
    $("nodeDetailBody").innerHTML =
      '<div class="nd-formula">' + escapeHtml(node.formula) + '</div>' +
      '<div class="nd-explain">' + escapeHtml(node.explain) + '</div>' +
      extra +
      '<div class="nd-meta-item nm-label" style="margin-top:12px">计算过程</div>' +
      '<div style="font-family:monospace;background:#f8fafc;padding:10px;border-radius:6px;margin-top:4px">' + escapeHtml(node.calc) + '</div>' +
      childList;
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function findNode(node, id) {
    if (node.id === id) return node;
    if (!node.children) return null;
    for (var i = 0; i < node.children.length; i++) {
      var r = findNode(node.children[i], id);
      if (r) return r;
    }
    return null;
  }

  function initNodeDetailClose() {
    $("btnCloseDetail").addEventListener("click", function () {
      $("nodeDetailCard").hidden = true;
      $$(".dp-node").forEach(function (n) { n.classList.remove("is-active"); });
    });
  }

  // ---------- 诊断渲染 ----------
  function renderDiagnosis() {
    if (!STATE.diagnosis) return;
    var diag = STATE.diagnosis;

    // 评级
    var grade = diag.rating.grade;
    var cls = grade === "优秀" ? "is-ok" : (grade === "正常" ? "is-normal" : "is-risk");
    $("ratingBanner").className = "rating-banner " + cls;
    $("rbGrade").textContent = grade;
    $("rbSummary").textContent = diag.rating.summary;

    // 14 项指标表
    renderRatioTable(diag.ratios);

    // 四维度
    renderDimensions(diag.dimensions);

    // 风险清单
    renderRiskList(diag.risks);

    // AI 区清空
    $("aiBody").textContent = "点击右上按钮，基于已校验指标自动生成严谨客观的高管层经营复盘洞察。";
    $("aiBody").className = "ai-body";
  }

  function renderRatioTable(ratios) {
    var tbl = $("ratioTable");
    var html = '<thead><tr>' +
      '<th>指标</th><th>类别</th><th>数值</th><th>基准</th><th>评价</th>' +
      '</tr></thead><tbody>';
    ratios.forEach(function (r) {
      var b = (r.value != null && r.benchmark) ? r.benchmark(r.value) : null;
      var fmt = function () {
        if (r.value == null) return "—";
        if (r.unit === "pct") return (r.value * 100).toFixed(2) + "%";
        if (r.unit === "times") return r.value.toFixed(2) + " 次";
        if (r.unit === "ratio") return r.value.toFixed(2);
        if (r.unit === "amount") return fmtAmt(r.value);
        return r.value;
      };
      var bcls = b === "ok" ? "b-ok" : (b === "normal" ? "b-normal" : "b-risk");
      var btxt = b === "ok" ? "优秀" : (b === "normal" ? "正常" : "风险");
      html += '<tr><td>' + r.name + '</td><td style="color:#5b6678">' + r.cat + '</td>' +
        '<td class="r-val">' + fmt() + '</td><td style="color:#8a93a4;font-size:12px">' + r.base + '</td>' +
        '<td><span class="badge ' + bcls + '">' + btxt + '</span></td></tr>';
    });
    html += '</tbody>';
    tbl.innerHTML = html;
  }

  function renderDimensions(dims) {
    var grid = $("diagGrid");
    grid.innerHTML = dims.map(function (dim) {
      var scoreCls = dim.score.cls === "ok" ? "b-ok" : (dim.score.cls === "normal" ? "b-normal" : "b-risk");
      var items = dim.items.map(function (it) {
        var b = it.status;
        var bcls = b === "ok" ? "b-ok" : (b === "normal" ? "b-normal" : "b-risk");
        var btxt = b === "ok" ? "优秀" : (b === "normal" ? "正常" : "风险");
        return '<div class="diag-item">' +
          '<div class="di-line"><span class="di-label">' + it.label + '</span>' +
          '<span class="di-val">' + it.value + ' <span class="badge ' + bcls + '">' + btxt + '</span></span></div>' +
          '<div class="di-note">' + it.note + '</div></div>';
      }).join("");
      return '<div class="diag-card"><div class="diag-card-head">' +
        '<span class="dc-icon">' + dim.icon + '</span><h3>' + dim.name + '</h3>' +
        '<span class="dc-score badge ' + scoreCls + '">' + (dim.score.text || "—") + '</span></div>' +
        '<div class="diag-card-body">' + items + '</div></div>';
    }).join("");
  }

  function renderRiskList(risks) {
    var list = $("riskList");
    if (!risks.length) {
      list.innerHTML = '<div style="color:#8a93a4;padding:8px 0">暂未触发明确风险阈值。</div>';
      return;
    }
    list.innerHTML = risks.map(function (rk) {
      var pcls = "p-" + rk.priority;
      var ptxt = rk.priority === "high" ? "高优先级" : (rk.priority === "mid" ? "中优先级" : "低优先级");
      return '<div class="risk-item ' + pcls + '">' +
        '<div class="ri-head"><span class="ri-prio ' + pcls + '">' + ptxt + '</span><span class="ri-title">' + escapeHtml(rk.title) + '</span></div>' +
        '<div class="ri-grid">' +
        '<span class="rig-label">数据依据</span><span class="rig-val">' + escapeHtml(rk.evidence) + '</span>' +
        '<span class="rig-label">潜在影响</span><span class="rig-val">' + escapeHtml(rk.impact) + '</span>' +
        '<span class="rig-label">建议对策</span><span class="rig-val">' + escapeHtml(rk.suggestion) + '</span>' +
        '</div></div>';
    }).join("");
  }

  // ---------- AI 顾问 ----------
  function initAI() {
    $("btnAI").addEventListener("click", function () {
      var body = $("aiBody");
      body.className = "ai-body is-loading";
      body.textContent = "正在基于已校验指标生成高管复盘洞察…";
      setTimeout(function () {
        try {
          var insight = window.DiagnosisEngine.generateAIInsight({
            company: STATE.meta.company,
            period: STATE.meta.period,
            rating: STATE.diagnosis.rating,
            ratios: STATE.diagnosis.ratios,
            dupont: STATE.dupont
          });
          STATE.aiInsight = insight;
          // 简单 markdown 渲染
          body.className = "ai-body";
          body.innerHTML = renderAIMarkdown(insight);
          renderExportPreview();
          toast("AI 洞察已生成", "ok");
        } catch (e) {
          body.className = "ai-body";
          body.textContent = "生成失败：" + (e.message || e);
        }
      }, 600);
    });
  }

  function renderAIMarkdown(text) {
    var lines = String(text).split("\n");
    var html = "";
    var inList = false;
    lines.forEach(function (ln) {
      if (/^【.+】$/.test(ln)) {
        if (inList) { html += "</ul>"; inList = false; }
        html += '<h4>' + escapeHtml(ln) + '</h4>';
      } else if (/^[一二三四五六七八九]+、/.test(ln)) {
        if (inList) { html += "</ul>"; inList = false; }
        html += '<h4>' + escapeHtml(ln) + '</h4>';
      } else if (/^——/.test(ln)) {
        if (inList) { html += "</ul>"; inList = false; }
        html += '<p style="color:#8a93a4;font-size:12px">' + escapeHtml(ln) + '</p>';
      } else if (/^·/.test(ln) || /^- /.test(ln)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += '<li>' + escapeHtml(ln.replace(/^[·-]\s*/, "")) + '</li>';
      } else if (!ln.trim()) {
        if (inList) { html += "</ul>"; inList = false; }
        html += "<br>";
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        html += '<p>' + escapeHtml(ln) + '</p>';
      }
    });
    if (inList) html += "</ul>";
    return html;
  }

  // ---------- 导出预览 ----------
  function renderExportPreview() {
    if (!STATE.diagnosis) return;
    var d = STATE.dupont, diag = STATE.diagnosis;
    var grade = diag.rating.grade;
    var gradeColor = grade === "优秀" ? "#1aa56f" : (grade === "正常" ? "#d98a00" : "#e0413d");

    var html = '<div class="ep-cover">' +
      '<div class="epc-eyebrow">经营诊断报告</div>' +
      '<div class="epc-title">' + escapeHtml(STATE.meta.company || "企业") + '</div>' +
      '<div class="epc-meta">' + escapeHtml(STATE.meta.period || "报告期") + ' · 金额单位：' + escapeHtml(STATE.meta.unit || "元") + '</div>' +
      '<div style="margin-top:14px"><span class="ep-grade" style="color:#fff;background:' + gradeColor + '">' + grade + '</span></div>' +
      '</div>';

    html += '<div class="ep-section"><h3>① 执行摘要</h3><p>' + escapeHtml(diag.rating.summary) + '</p>' +
      '<p>杜邦驱动归因：<strong>' + escapeHtml(d.driver.tag) + '</strong></p></div>';
    html += '<div class="ep-section"><h3>② 核心指标概览（14 项）</h3><ul>' +
      '<li>ROE ' + d.fmt.pct(d.metrics.roe) + ' · 净利率 ' + d.fmt.pct(d.metrics.netMargin) + ' · 周转 ' + d.fmt.times(d.metrics.assetTurn) + ' · 权益乘数 ' + d.fmt.raw(d.metrics.equityMult) + '</li>' +
      '<li>评级分布：优秀 ' + diag.rating.ok + ' / 正常 ' + diag.rating.normal + ' / 风险 ' + diag.rating.risk + '</li></ul></div>';
    html += '<div class="ep-section"><h3>③ 四维度诊断</h3><ul>' +
      diag.dimensions.map(function (dim) { return '<li>' + dim.icon + ' ' + dim.name + '：' + (dim.score.text || "数据不足") + '</li>'; }).join("") +
      '</ul></div>';
    html += '<div class="ep-section"><h3>④ 风险与建议（' + diag.risks.length + ' 项）</h3><ul>' +
      diag.risks.slice(0, 5).map(function (rk) { return '<li>[' + (rk.priority === "high" ? "高" : rk.priority === "mid" ? "中" : "低") + '] ' + escapeHtml(rk.title) + '</li>'; }).join("") +
      (diag.risks.length > 5 ? '<li>…等共 ' + diag.risks.length + ' 项详见导出报告</li>' : '') +
      '</ul></div>';
    html += '<div class="ep-section"><h3>⑤ AI 顾问洞察</h3><p>' + (STATE.aiInsight ? "已生成 · 详见报告" : "点击诊断页生成按钮") + '</p></div>';
    html += '<div class="ep-section"><h3>⑥ 数据口径与免责声明</h3><p>本地解析 · 仅供参考 · 不构成投资建议</p></div>';

    $("exportPreview").innerHTML = html;
  }

  // ---------- 导出 ----------
  function initExport() {
    $("btnExport").addEventListener("click", function () {
      if (!STATE.statements || !STATE.dupont || !STATE.diagnosis) {
        toast("请先完成数据载入与分析", "error");
        return;
      }
      var btn = this;
      btn.disabled = true; btn.textContent = "生成中…";
      try {
        // 构造执行摘要辅助文本
        var byKey = {}; STATE.diagnosis.ratios.forEach(function (r) { byKey[r.key] = r; });
        var advantages = [], risks = [], recs = [];
        var d = STATE.dupont;
        if (byKey.ocfNi.value > 1) advantages.push("利润现金含量高（" + (byKey.ocfNi.value).toFixed(2) + "），造血能力强。");
        if (byKey.gpm.value > 0.3) advantages.push("销售毛利率 " + (byKey.gpm.value * 100).toFixed(1) + "%，盈利空间充足。");
        if (d.driver.mode === "profit") advantages.push("ROE 以高利润率驱动，模式可持续。");
        if (d.driver.mode === "turnover") advantages.push("资产周转高效，薄利多销有效运转。");
        if (!advantages.length) advantages.push("暂无显著优势项，聚焦基础改善。");

        if (byKey.debt.value > 0.8) risks.push("资产负债率 " + (byKey.debt.value * 100).toFixed(1) + "%，杠杆风险高。");
        if (byKey.ocfNi.value < 0.3 && byKey.ocfNi.value >= 0) risks.push("净利润现金含量偏低，利润现金支撑弱。");
        if (d.driver.mode === "leverage") risks.push("ROE 高度依赖杠杆放大。");
        if (byKey.roe.value < 0) risks.push("当期亏损，ROE 为负。");
        if (!risks.length) risks.push("暂未触发明确风险阈值。");

        if (byKey.debt.value > 0.8) recs.push("启动降杠杆：压降高成本短期借款，优化债务期限结构。");
        if (byKey.roe.value < 0) recs.push("扭亏为盈：审视成本费用与收入下滑原因。");
        if (byKey.ocfNi.value < 0.3 && byKey.ocfNi.value >= 0) recs.push("改善利润现金转化：加强应收回款与存货去化。");
        if (!recs.length) recs.push("保持现有经营节奏，持续监控关键指标。");

        var ctx = {
          company: STATE.meta.company, period: STATE.meta.period, unit: STATE.meta.unit,
          statements: STATE.statements, dupont: STATE.dupont, diagnosis: STATE.diagnosis,
          aiInsight: STATE.aiInsight, advantages: advantages, risks_summary: risks,
          recommendations: recs, generatedAt: new Date().toLocaleString("zh-CN")
        };

        window.ReportExporter.buildReport(ctx).then(function (bytes) {
          window.ReportExporter.downloadDocx(bytes, (STATE.meta.company || "企业") + "_经营诊断报告.docx");
          toast("Word 报告已生成并下载", "ok");
        }).catch(function (e) {
          toast("导出失败：" + (e.message || e), "error");
        }).finally(function () {
          btn.disabled = false; btn.innerHTML = "⬇ 导出 Word 诊断报告";
        });
      } catch (e) {
        toast("导出失败：" + (e.message || e), "error");
        btn.disabled = false; btn.innerHTML = "⬇ 导出 Word 诊断报告";
      }
    });

    $("btnNewAnalysis").addEventListener("click", function () {
      openConfirm("确认新建分析", "此操作将彻底清除当前所有原始文档与分析结果，且不可恢复。是否继续？", function () {
        clearAllData();
        toast("已清除全部数据，可开始新分析", "ok");
      });
    });
  }

  // ---------- 隐私生命周期 ----------
  function openConfirm(title, text, onConfirm) {
    $("modalTitle").textContent = title;
    $("modalText").textContent = text;
    $("confirmMask").hidden = false;
    var mask = $("confirmMask");
    var cancel = $("modalCancel");
    var confirm = $("modalConfirm");
    function close() { mask.hidden = true; cleanup(); }
    function cleanup() {
      confirm.removeEventListener("click", onYes);
      cancel.removeEventListener("click", close);
    }
    function onYes() { close(); onConfirm(); }
    confirm.addEventListener("click", onYes);
    cancel.addEventListener("click", close);
    mask.addEventListener("click", function once(e) {
      if (e.target === mask) { close(); mask.removeEventListener("click", once); }
    });
  }

  function clearAllData() {
    STATE.files = { single: null, balance: null, income: null, cashflow: null };
    STATE.parsedResults = [];
    STATE.singleParsed = null;
    STATE.statements = null;
    STATE.meta = { company: "", period: "", unit: "元" };
    STATE.balanceCheck = null;
    STATE.dupont = null;
    STATE.diagnosis = null;
    STATE.aiInsight = "";

    clearAllInputs();
    // 重置 UI
    $("verifyStatus").className = "verify-status";
    $("verifyStatus").textContent = "等待数据";
    $("verifyBody").innerHTML = '<div class="verify-empty">载入或解析报表后，将自动校验资产=负债+所有者权益。</div>';
    $("extractCard").hidden = true;
    $("dupontCanvas").innerHTML = "";
    $("driverBox").innerHTML = "";
    $("nodeDetailCard").hidden = true;
    $("ratingBanner").className = "rating-banner";
    $("rbGrade").textContent = "—";
    $("rbSummary").textContent = "";
    $("ratioTable").innerHTML = "";
    $("diagGrid").innerHTML = "";
    $("riskList").innerHTML = "";
    $("aiBody").textContent = "点击右上按钮，基于已校验指标自动生成严谨客观的高管层经营复盘洞察。";
    $("aiBody").className = "ai-body";
    $("exportPreview").innerHTML = "";
    setStep(1);
  }

  // ---------- 步骤导航 ----------
  function initStepNav() {
    $$(".step-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var n = parseInt(this.dataset.step, 10);
        // 仅允许到达已解锁的步骤
        if (n > 1 && !STATE.statements) { toast("请先载入并解析数据", "warn"); return; }
        if (n === 2) renderDupont();
        if (n === 3) renderDiagnosis();
        if (n === 4) renderExportPreview();
        setStep(n);
      });
    });
  }

  // ---------- 启动 ----------
  function init() {
    initUploadMode();
    initFileHandlers();
    initSamples();
    initNodeDetailClose();
    initAI();
    initExport();
    initStepNav();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
