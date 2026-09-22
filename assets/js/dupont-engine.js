/* =========================================================
   dupont-engine.js
   杜邦三因素分析引擎
   - ROE = 销售净利率 × 总资产周转率 × 权益乘数
   - 驱动属性归因（高利润率/高周转薄利/高杠杆/亏损）
   - 节点树结构（供 SVG 渲染）
   ========================================================= */

window.DupontEngine = (function () {

  var EPS = 1e-9;

  function safeDiv(a, b) {
    if (b == null || a == null) return null;
    if (Math.abs(b) < EPS) return null;
    return a / b;
  }

  function pct(n, digits) {
    if (n == null || isNaN(n)) return "—";
    return (n * 100).toFixed(digits || 2) + "%";
  }
  function times(n, digits) {
    if (n == null || isNaN(n)) return "—";
    return n.toFixed(digits || 2) + " 次";
  }
  function raw(n, digits) {
    if (n == null || isNaN(n)) return "—";
    return n.toFixed(digits || 4);
  }

  // 从合并报表中提取核心科目
  function extractCore(statements) {
    var b = statements.balance || {};
    var i = statements.income || {};
    var c = statements.cashflow || {};

    // 所有者权益：优先取合计；若缺失，用 资产-负债 推算
    var equity = b["所有者权益合计"];
    var totalAssets = b["资产总计"];
    var totalLiab = b["负债合计"];
    if (equity == null && totalAssets != null && totalLiab != null) {
      equity = totalAssets - totalLiab;
    }
    // 净利润：优先合计；其次归母
    var netProfit = (i["净利润"] != null) ? i["净利润"] : i["其中：归属于母公司股东的净利润"];
    var revenue = i["营业收入"];
    var ocf = c["经营活动产生的现金流量净额"];

    return {
      totalAssets: totalAssets,
      totalLiab: totalLiab,
      equity: equity,
      revenue: revenue,
      netProfit: netProfit,
      ocf: ocf,
      totalLiabRatio: (totalAssets != null && totalLiab != null) ? totalLiab / totalAssets : null
    };
  }

  // 计算杜邦三因素
  function compute(statements) {
    var core = extractCore(statements);
    var netMargin = safeDiv(core.netProfit, core.revenue);        // 销售净利率
    var assetTurn = safeDiv(core.revenue, core.totalAssets);      // 总资产周转率
    var equityMult = safeDiv(core.totalAssets, core.equity);       // 权益乘数
    var roe = safeDiv(core.netProfit, core.equity);                // ROE
    // 校验：三因素之积应≈ROE
    var product = (netMargin != null && assetTurn != null && equityMult != null)
      ? netMargin * assetTurn * equityMult : null;

    return {
      core: core,
      netMargin: netMargin,
      assetTurn: assetTurn,
      equityMult: equityMult,
      roe: roe,
      product: product,
      roa: safeDiv(core.netProfit, core.totalAssets),
      debtRatio: core.totalLiabRatio
    };
  }

  // 驱动属性归因
  function attribute(m) {
    var nm = m.netMargin, at = m.assetTurn, em = m.equityMult;
    // 亏损主导
    if (m.core.netProfit != null && m.core.netProfit < 0) {
      return {
        mode: "loss",
        tag: "亏损主导型",
        title: "净利润为负，ROE 失真，经营处于亏损状态",
        desc: "企业当期净利润为负，杜邦三因素分解失去正向意义。核心矛盾在于盈利能力塌陷（销售净利率为负），需优先扭转亏损，而非追求杠杆或周转。",
        riskLevel: "risk"
      };
    }
    if (nm == null || at == null || em == null) {
      return {
        mode: "unknown", tag: "数据不足", title: "核心数据缺失，无法归因",
        desc: "缺少净利润、营收、总资产或净资产数据，无法完成驱动归因。", riskLevel: "warn"
      };
    }
    // 高杠杆风险预警：权益乘数 > 5 或资产负债率 > 80%
    var highLeverage = (em > 5) || (m.debtRatio != null && m.debtRatio > 0.8);

    // 三个驱动的相对贡献（标准化后比较量级）
    // 销售净利率按 % 看量级，周转按次，权益乘数按倍。这里用各自的"是否显著高于行业常规"判断
    var profitDriven = nm > 0.15;       // 销售净利率 > 15% 视为高利润率驱动
    var turnoverDriven = at > 1.0 && nm < 0.08; // 周转 > 1次 且 利润率 < 8% → 高周转薄利
    var leverageDriven = em > 3.5;     // 权益乘数 > 3.5 视为高杠杆放大

    // 综合判定优先级
    if (profitDriven && !turnoverDriven && !leverageDriven) {
      return {
        mode: "profit", tag: "高利润率驱动型",
        title: "ROE 主要由高销售净利率驱动，盈利质量强",
        desc: "销售净利率达 " + pct(nm) + "，显著高于一般制造业水平。企业具备产品定价权或技术壁垒，盈利是 ROE 的核心来源。建议关注盈利可持续性与市场份额扩张。",
        riskLevel: highLeverage ? "warn" : "ok"
      };
    }
    if (turnoverDriven) {
      return {
        mode: "turnover", tag: "高周转薄利驱动型",
        title: "ROE 主要由总资产周转率驱动，薄利多销模式",
        desc: "总资产周转率达 " + times(at) + "，销售净利率仅 " + pct(nm) + "。企业依赖高效资产周转盈利（典型商贸/流通业）。需警惕库存积压、应收账款周转放缓侵蚀薄利。",
        riskLevel: highLeverage ? "warn" : "ok"
      };
    }
    if (leverageDriven) {
      return {
        mode: "leverage", tag: "高财务杠杆放大驱动型",
        title: "ROE 高度依赖财务杠杆放大，杠杆风险显著",
        desc: "权益乘数达 " + raw(em) + "，资产负债率约 " + pct(m.debtRatio, 1) + "。ROE 中相当部分由债务杠杆放大，而非内生盈利或周转效率。一旦盈利下滑，杠杆将放大亏损，财务脆弱性高。",
        riskLevel: "warn"
      };
    }
    // 综合均衡型
    return {
      mode: "balanced", tag: "均衡驱动型",
      title: "ROE 由利润率、周转与杠杆均衡贡献",
      desc: "销售净利率 " + pct(nm) + "，总资产周转率 " + times(at) + "，权益乘数 " + raw(em) + "。三因素贡献相对均衡，经营稳健。建议持续监控各因素边际变化。",
      riskLevel: highLeverage ? "warn" : "ok"
    };
  }

  // 构建节点树（供渲染 + 点击探查）
  function buildTree(m) {
    var c = m.core;
    return {
      id: "roe",
      level: 1,
      label: "净资产收益率 ROE",
      value: pct(m.roe),
      rawValue: m.roe,
      formula: "净利润 ÷ 所有者权益",
      calc: (c.netProfit != null && c.equity != null)
        ? fmt(c.netProfit) + " ÷ " + fmt(c.equity) + " = " + pct(m.roe) : "数据不足",
      explain: "ROE 衡量股东每投入 1 元净资产能获得的净利润回报，是衡量企业为股东创造价值能力的核心指标。杜邦分析将其拆解为销售净利率、总资产周转率与权益乘数三因素，便于定位 ROE 的驱动来源。",
      children: [
        {
          id: "netMargin", level: 2,
          label: "销售净利率", value: pct(m.netMargin), rawValue: m.netMargin,
          formula: "净利润 ÷ 营业收入",
          calc: (c.netProfit != null && c.revenue != null)
            ? fmt(c.netProfit) + " ÷ " + fmt(c.revenue) + " = " + pct(m.netMargin) : "数据不足",
          explain: "销售净利率反映每 1 元营业收入最终转化为净利润的比例，衡量企业的盈利能力与成本费用控制水平。该比率越高，说明产品定价权强、成本控制有效。是『高利润率驱动型』企业的核心指标。",
          children: [
            leaf("netProfit", "净利润", c.netProfit, "利润表", "营业收入扣除全部成本费用及所得税后的净额，是当期经营最终成果。"),
            leaf("revenue", "营业收入", c.revenue, "利润表", "企业日常经营主要业务产生的收入总额，是规模与市场份额的直接体现。")
          ]
        },
        {
          id: "assetTurn", level: 2,
          label: "总资产周转率", value: times(m.assetTurn), rawValue: m.assetTurn,
          formula: "营业收入 ÷ 总资产",
          calc: (c.revenue != null && c.totalAssets != null)
            ? fmt(c.revenue) + " ÷ " + fmt(c.totalAssets) + " = " + times(m.assetTurn) : "数据不足",
          explain: "总资产周转率衡量每 1 元资产能撬动的营业收入，反映资产运营效率。周转越快，资产利用越充分。是『高周转薄利驱动型』企业的核心指标，常见于商贸流通业。",
          children: [
            leaf("revenue2", "营业收入", c.revenue, "利润表", "同上，作为周转率分子。"),
            leaf("totalAssets", "总资产", c.totalAssets, "资产负债表", "企业拥有或控制的全部资产总和，反映经营规模与资源投入。")
          ]
        },
        {
          id: "equityMult", level: 2,
          label: "权益乘数", value: raw(m.equityMult), rawValue: m.equityMult,
          formula: "总资产 ÷ 所有者权益",
          calc: (c.totalAssets != null && c.equity != null)
            ? fmt(c.totalAssets) + " ÷ " + fmt(c.equity) + " = " + raw(m.equityMult) : "数据不足",
          explain: "权益乘数反映总资产相对净资产的倍数，即企业利用债务杠杆的程度。乘数越大，财务杠杆越高，ROE 被放大的同时财务风险也越高。是『高财务杠杆放大驱动型』企业的核心指标。",
          extra: (m.debtRatio != null ? "资产负债率 " + pct(m.debtRatio, 1) : ""),
          children: [
            leaf("totalAssets2", "总资产", c.totalAssets, "资产负债表", "同上，作为权益乘数分子。"),
            leaf("equity", "所有者权益", c.equity, "资产负债表", "股东实际投入与留存收益之和，即净资产，是股东权益的账面价值。")
          ]
        }
      ]
    };
  }

  function leaf(id, label, value, src, explain) {
    return {
      id: id, level: 3, label: label, value: fmt(value), rawValue: value,
      formula: "报表科目", calc: "来源：" + src + " · 金额：" + fmt(value),
      explain: explain, children: []
    };
  }

  function fmt(n) {
    if (n == null || isNaN(n)) return "—";
    var abs = Math.abs(n);
    var sign = n < 0 ? "-" : "";
    if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + " 亿元";
    if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + " 万元";
    return sign + abs.toFixed(2) + " 元";
  }

  // 汇总
  function analyze(statements) {
    var metrics = compute(statements);
    var driver = attribute(metrics);
    var tree = buildTree(metrics);
    return {
      core: metrics.core,
      metrics: metrics,
      driver: driver,
      tree: tree,
      fmt: fmt, pct: pct, times: times, raw: raw
    };
  }

  return {
    analyze: analyze,
    compute: compute,
    attribute: attribute,
    buildTree: buildTree,
    fmt: fmt, pct: pct, times: times, raw: raw,
    safeDiv: safeDiv
  };

})();
