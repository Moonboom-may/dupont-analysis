/* =========================================================
   report-exporter.js
   生成标准 Word(.docx) 经营诊断报告
   报告结构：
   1. 封面与综合评级
   2. 执行摘要
   3. 核心财务指标概览（14项）
   4. 盈利/偿债/营运/现金流四维度深度诊断
   5. 经营风险提示与改善建议（高/中/低）
   6. 数据口径与免责声明
   依赖 DocxWriter（OOXML）+ ZipTool（打包）
   ========================================================= */

window.ReportExporter = (function () {

  function pct(n, d) { return n == null ? "—" : (n * 100).toFixed(d == null ? 2 : d) + "%"; }
  function times(n, d) { return n == null ? "—" : n.toFixed(d == null ? 2 : d) + " 次"; }
  function ratio(n, d) { return n == null ? "—" : n.toFixed(d == null ? 2 : d); }
  function fmtAmount(n) {
    if (n == null) return "—";
    var abs = Math.abs(n), sign = n < 0 ? "-" : "";
    if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + " 亿元";
    if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + " 万元";
    return sign + abs.toFixed(0) + " 元";
  }

  function badgeText(cls) {
    return cls === "ok" ? "优秀" : (cls === "normal" ? "正常" : "风险");
  }
  function badgeColor(cls) {
    return cls === "ok" ? "1AA56F" : (cls === "normal" ? "D98A00" : "E0413D");
  }
  function prioText(p) {
    return p === "high" ? "高" : (p === "mid" ? "中" : "低");
  }
  function prioColor(p) {
    return p === "high" ? "E0413D" : (p === "mid" ? "D98A00" : "1AA56F");
  }

  function buildReport(ctx) {
    // ctx = {company, period, unit, statements, dupont, diagnosis}
    var DW = window.DocxWriter;
    var d = ctx.dupont;
    var diag = ctx.diagnosis;
    var b = new DW.Builder();
    var title = (ctx.company || "企业") + " 经营诊断报告";
    var meta = (ctx.period || "报告期") + " · 金额单位：" + (ctx.unit || "元");
    var grade = diag.rating.grade;

    // ===== 1. 封面 =====
    b.cover(title, meta, grade);

    // ===== 2. 执行摘要 =====
    b.heading("一、执行摘要", 1);
    b.para("综合判断：" + diag.rating.summary);
    b.heading("主要优势", 3);
    (ctx.advantages || []).forEach(function (a) { b.bullet(a); });
    b.heading("主要风险", 3);
    (ctx.risks_summary || []).forEach(function (r) { b.bullet(r); });
    b.heading("优先建议", 3);
    (ctx.recommendations || []).forEach(function (r) { b.bullet(r); });
    b.para("杜邦驱动归因：" + d.driver.tag + "。" + d.driver.desc, { size: 20 });

    b.pageBreak();

    // ===== 3. 核心财务指标概览 =====
    b.heading("二、核心财务指标概览", 1);
    b.para("下表列示 14 项核心财务比率及其基准评价。", { size: 20 });

    var headerCells = [
      DW.cell("指标", { bold: true, shading: "E3E8F0", width: 2400, align: "center" }),
      DW.cell("类别", { bold: true, shading: "E3E8F0", width: 1200, align: "center" }),
      DW.cell("数值", { bold: true, shading: "E3E8F0", width: 2000, align: "center" }),
      DW.cell("基准", { bold: true, shading: "E3E8F0", width: 2400, align: "center" }),
      DW.cell("评价", { bold: true, shading: "E3E8F0", width: 1000, align: "center" })
    ];
    var rows = [DW.row(headerCells, { header: true })];
    diag.ratios.forEach(function (r) {
      var b2 = (r.value != null && r.benchmark) ? r.benchmark(r.value) : null;
      var fmt = function () {
        if (r.value == null) return "—";
        if (r.unit === "pct") return pct(r.value);
        if (r.unit === "times") return times(r.value);
        if (r.unit === "ratio") return ratio(r.value);
        if (r.unit === "amount") return fmtAmount(r.value);
        return r.value;
      };
      rows.push(DW.row([
        DW.cell(r.name, { width: 2400 }),
        DW.cell(r.cat, { width: 1200, align: "center", color: "5B6678" }),
        DW.cell(fmt(), { width: 2000, align: "right", bold: true }),
        DW.cell(r.base, { width: 2400, size: 18, color: "5B6678" }),
        DW.cell(badgeText(b2), { width: 1000, align: "center", bold: true, color: badgeColor(b2) })
      ]));
    });
    b.table(rows, { width: 9000 });

    b.pageBreak();

    // ===== 4. 四维度深度诊断 =====
    b.heading("三、四维度深度诊断", 1);
    diag.dimensions.forEach(function (dim) {
      b.heading(dim.icon + " " + dim.name + "（" + (dim.score.text || "数据不足") + "）", 2);
      var drows = [DW.row([
        DW.cell("指标", { bold: true, shading: "F4F6FB", width: 2800 }),
        DW.cell("数值", { bold: true, shading: "F4F6FB", width: 2200, align: "right" }),
        DW.cell("评价", { bold: true, shading: "F4F6FB", width: 1400, align: "center" }),
        DW.cell("说明", { bold: true, shading: "F4F6FB", width: 2600 })
      ])];
      dim.items.forEach(function (it) {
        drows.push(DW.row([
          DW.cell(it.label, { width: 2800 }),
          DW.cell(it.value, { width: 2200, align: "right", bold: true }),
          DW.cell(badgeText(it.status), { width: 1400, align: "center", color: badgeColor(it.status), bold: true }),
          DW.cell(it.note, { width: 2600, size: 18, color: "5B6678" })
        ]));
      });
      b.table(drows, { width: 9000 });
    });

    b.pageBreak();

    // ===== 5. 杜邦三因素拆解 =====
    b.heading("四、杜邦分析三因素拆解", 1);
    b.para("净资产收益率 ROE = 销售净利率 × 总资产周转率 × 权益乘数", { bold: true });
    var drows2 = [DW.row([
      DW.cell("指标", { bold: true, shading: "E3E8F0", width: 2800 }),
      DW.cell("数值", { bold: true, shading: "E3E8F0", width: 2400, align: "right" }),
      DW.cell("计算公式", { bold: true, shading: "E3E8F0", width: 3800 })
    ])];
    drows2.push(DW.row([
      DW.cell("净资产收益率 ROE", { bold: true, width: 2800, color: "1A3A8A" }),
      DW.cell(pct(d.metrics.roe), { width: 2400, align: "right", bold: true }),
      DW.cell("净利润 ÷ 所有者权益 = " + fmtAmount(d.core.netProfit) + " ÷ " + fmtAmount(d.core.equity), { width: 3800, size: 18, color: "5B6678" })
    ]));
    drows2.push(DW.row([
      DW.cell("销售净利率", { width: 2800 }),
      DW.cell(pct(d.metrics.netMargin), { width: 2400, align: "right" }),
      DW.cell("净利润 ÷ 营业收入", { width: 3800, size: 18, color: "5B6678" })
    ]));
    drows2.push(DW.row([
      DW.cell("总资产周转率", { width: 2800 }),
      DW.cell(times(d.metrics.assetTurn), { width: 2400, align: "right" }),
      DW.cell("营业收入 ÷ 总资产", { width: 3800, size: 18, color: "5B6678" })
    ]));
    drows2.push(DW.row([
      DW.cell("权益乘数", { width: 2800 }),
      DW.cell(ratio(d.metrics.equityMult), { width: 2400, align: "right" }),
      DW.cell("总资产 ÷ 所有者权益（资产负债率 " + pct(d.metrics.debtRatio, 1) + "）", { width: 3800, size: 18, color: "5B6678" })
    ]));
    b.table(drows2, { width: 9000 });
    b.para("驱动归因：" + d.driver.tag, { bold: true, color: "1F5FFF" });
    b.para(d.driver.desc, { size: 20 });

    b.pageBreak();

    // ===== 6. 经营风险提示与改善建议 =====
    b.heading("五、经营风险提示与改善建议", 1);
    if (diag.risks.length === 0) {
      b.para("暂未触发明确风险阈值。", { size: 20 });
    } else {
      diag.risks.forEach(function (rk, i) {
        b.heading((i + 1) + ". " + rk.title + "（" + prioText(rk.priority) + "优先级）", 3);
        var rrows = [DW.row([
          DW.cell("数据依据", { bold: true, shading: "F4F6FB", width: 1800 }),
          DW.cell(rk.evidence, { width: 7200 })
        ])];
        rrows.push(DW.row([
          DW.cell("潜在影响", { bold: true, shading: "F4F6FB", width: 1800 }),
          DW.cell(rk.impact, { width: 7200 })
        ]));
        rrows.push(DW.row([
          DW.cell("建议对策", { bold: true, shading: "F4F6FB", width: 1800 }),
          DW.cell(rk.suggestion, { width: 7200 })
        ]));
        b.table(rrows, { width: 9000 });
      });
    }

    // ===== 7. AI 经营顾问洞察 =====
    if (ctx.aiInsight) {
      b.pageBreak();
      b.heading("六、AI 智能经营顾问复盘洞察", 1);
      // 将洞察文本按行/段落写入
      var lines = String(ctx.aiInsight).split("\n");
      lines.forEach(function (ln) {
        if (!ln) { b.raw(DW.spacer()); return; }
        if (/^【.+】$/.test(ln) || /^四、|^三、|^二、|^一、|^五、|^六、|^——/.test(ln)) {
          b.para(ln, { bold: true, color: "1F5FFF" });
        } else if (/^·/.test(ln)) {
          b.bullet(ln);
        } else {
          b.para(ln, { size: 20 });
        }
      });
    }

    b.pageBreak();

    // ===== 8. 数据口径与免责声明 =====
    b.heading("七、数据口径与免责声明", 1);
    b.para("1. 数据来源：本报告所有财务数据由用户上传的 .docx 财务报表本地解析抽取，未经任何外部服务器处理。", { size: 20 });
    b.para("2. 口径说明：杜邦三因素采用经典分解 ROE = 销售净利率 × 总资产周转率 × 权益乘数；资产负债表平衡校验阈值为差额不超过资产总计的 0.5%。", { size: 20 });
    b.para("3. 金额单位：原始报表单位自动识别并统一换算为『元』后计算；展示时按量级自动折算为元/万元/亿元。", { size: 20 });
    b.para("4. 评级方法：综合评级依据盈利、现金流造血、周转及杠杆四维度核心指标客观评定为优秀/正常/风险三级。", { size: 20 });
    b.para("5. 免责声明：本报告由本地程序自动生成，AI 经营顾问洞察基于已校验指标的规则化生成，仅供企业管理层内部参考，不构成任何投资建议或专业审计意见。决策请以经审计的财务数据为准。", { size: 20 });
    b.para("报告生成时间：" + (ctx.generatedAt || "") + " ·  杜邦分析引擎", { size: 18, color: "8A93A4", align: "center" });

    return b.build(); // Promise<Uint8Array>
  }

  function downloadDocx(bytes, filename) {
    var blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename || "经营诊断报告.docx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  return {
    buildReport: buildReport,
    downloadDocx: downloadDocx,
    pct: pct, times: times, ratio: ratio, fmtAmount: fmtAmount
  };

})();
