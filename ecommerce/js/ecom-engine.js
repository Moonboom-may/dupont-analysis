/* =========================================================
   ecom-engine.js
   电商经营诊断引擎
   - GMV = 流量 × 转化率 × 客单价  三因素拆解
   - GMV 下滑归因（量价分解 + 流量结构分解 + 环比归因）
   - 利润诊断（毛利、营销 ROI、净利润）
   - 周转/库存/退款 健康度
   - 综合评级 + 优先级风险清单
   ========================================================= */

window.EcomEngine = (function () {

  function safeDiv(a, b) {
    if (a == null || b == null) return null;
    if (Math.abs(b) < 1e-9) return null;
    return a / b;
  }
  function pct(n, d) { return n == null ? "—" : (n * 100).toFixed(d == null ? 2 : d) + "%"; }
  function ratio(n, d) { return n == null ? "—" : n.toFixed(d == null ? 2 : d); }
  function money(n) {
    if (n == null) return "—";
    var abs = Math.abs(n), sign = n < 0 ? "-" : "";
    if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + " 亿";
    if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + " 万";
    return sign + abs.toFixed(0) + " 元";
  }
  function delta(cur, prev) {
    if (cur == null || prev == null) return null;
    if (Math.abs(prev) < 1e-9) return null;
    return (cur - prev) / Math.abs(prev);
  }
  function fmtDelta(d) {
    if (d == null) return "—";
    return (d >= 0 ? "+" : "") + (d * 100).toFixed(1) + "%";
  }

  // ========== GMV 三因素拆解 ==========
  function decomposeGmv(m) {
    var traffic = m.traffic;
    var conv = m.conversionRate;
    var aov = m.avgPrice;
    var gmv = (traffic != null && conv != null && aov != null) ? traffic * conv * aov : null;

    // 上期对比
    var prevTraffic = m.prevTraffic, prevConv = m.prevConversionRate, prevAov = m.prevAvgPrice;
    var prevGmv = (prevTraffic != null && prevConv != null && prevAov != null) ? prevTraffic * prevConv * prevAov : null;

    // 量价分解（严格自洽）：ΔGMV = (Δ量)×上期客单 + (Δ客单)×本期量
    var curVolume = (traffic != null && conv != null) ? traffic * conv : null;
    var prevVolume = (prevTraffic != null && prevConv != null) ? prevTraffic * prevConv : null;
    var volContribution = (curVolume != null && prevVolume != null && prevAov != null)
      ? (curVolume - prevVolume) * prevAov : null;
    var priceContribution = (aov != null && prevAov != null && curVolume != null)
      ? (aov - prevAov) * curVolume : null;

    return {
      gmv: gmv, prevGmv: prevGmv,
      gmvDelta: delta(gmv, prevGmv),
      traffic: traffic, conv: conv, aov: aov,
      prevTraffic: prevTraffic, prevConv: prevConv, prevAov: prevAov,
      trafficDelta: delta(traffic, prevTraffic),
      convDelta: delta(conv, prevConv),
      aovDelta: delta(aov, prevAov),
      curVolume: curVolume, prevVolume: prevVolume,
      volContribution: volContribution,         // 量贡献的 GMV 增量
      priceContribution: priceContribution,    // 价贡献的 GMV 增量
    };
  }

  // ========== 流量结构拆解 ==========
  function decomposeTraffic(m) {
    var paid = m.paidTraffic, free = m.freeTraffic;
    var total = (paid != null && free != null) ? paid + free : null;
    var paidShare = safeDiv(paid, total);
    var prevPaid = m.prevPaidTraffic, prevFree = m.prevFreeTraffic;
    var prevTotal = (prevPaid != null && prevFree != null) ? prevPaid + prevFree : null;
    var prevPaidShare = safeDiv(prevPaid, prevTotal);

    // 付费流量对总流量增长的贡献
    var paidContribution = (paid != null && prevPaid != null) ? (paid - prevPaid) : null;
    var freeContribution = (free != null && prevFree != null) ? (free - prevFree) : null;

    return {
      paid: paid, free: free, total: total,
      paidShare: paidShare,
      prevPaid: prevPaid, prevFree: prevFree, prevTotal: prevTotal, prevPaidShare: prevPaidShare,
      paidContribution: paidContribution, freeContribution: freeContribution,
      paidDelta: delta(paid, prevPaid),
      freeDelta: delta(free, prevFree)
    };
  }

  // ========== 利润诊断 ==========
  function diagnoseProfit(m, gmv) {
    var grossProfit = (gmv != null && m.grossMargin != null) ? gmv * m.grossMargin : null;
    var prevGmv = m.prevGmv;
    var prevGrossProfit = (prevGmv != null && m.prevGrossMargin != null) ? prevGmv * m.prevGrossMargin : null;
    var netProfit = (gmv != null && m.cost != null) ? gmv - m.cost : null;
    var prevNetProfit = (prevGmv != null && m.prevCost != null) ? prevGmv - m.prevCost : null;
    var adRoi = safeDiv(gmv, m.adSpend);             // 投入产出比（GMV/广告费）
    var prevAdRoi = safeDiv(prevGmv, m.prevAdSpend);
    var adProfitRoi = safeDiv(grossProfit, m.adSpend); // 毛利/广告费
    var netMargin = safeDiv(netProfit, gmv);          // 净利率

    return {
      grossProfit: grossProfit, prevGrossProfit: prevGrossProfit,
      grossProfitDelta: delta(grossProfit, prevGrossProfit),
      netProfit: netProfit, prevNetProfit: prevNetProfit,
      netProfitDelta: delta(netProfit, prevNetProfit),
      netMargin: netMargin,
      adRoi: adRoi, prevAdRoi: prevAdRoi, adRoiDelta: delta(adRoi, prevAdRoi),
      adProfitRoi: adProfitRoi,
      grossMarginDelta: delta(m.grossMargin, m.prevGrossMargin)
    };
  }

  // ========== 14 项核心指标 + 基准 ==========
  function computeRatios(m, dec, prof) {
    var list = [
      { key: "gmv", name: "GMV", value: dec.gmv, unit: "money", cat: "规模",
        base: "环比看增长", benchmark: function (v, ctx) { return ctx.gmvDelta > 0 ? "ok" : (ctx.gmvDelta < -0.1 ? "risk" : "normal"); },
        ctx: { gmvDelta: dec.gmvDelta } },
      { key: "gmvGrowth", name: "GMV 环比增速", value: dec.gmvDelta, unit: "pct", cat: "规模",
        base: ">10% 优秀 / <0% 风险", benchmark: function (v) { return v == null ? null : (v > 0.1 ? "ok" : (v < 0 ? "risk" : "normal")); } },
      { key: "traffic", name: "访客数", value: dec.traffic, unit: "num", cat: "流量",
        base: "环比看增长", benchmark: function (v, ctx) { return ctx.tDelta >= 0 ? "ok" : (ctx.tDelta < -0.1 ? "risk" : "normal"); },
        ctx: { tDelta: dec.trafficDelta } },
      { key: "paidShare", name: "付费流量占比", value: safeDiv(m.paidTraffic, (m.paidTraffic + m.freeTraffic)), unit: "pct", cat: "流量",
        base: "<40% 健康 / >60% 依赖付费", benchmark: function (v) { return v == null ? null : (v > 0.6 ? "risk" : (v < 0.4 ? "ok" : "normal")); } },
      { key: "conversionRate", name: "转化率", value: m.conversionRate, unit: "pct", cat: "转化",
        base: "行业 2-5%", benchmark: function (v) { return v == null ? null : (v < 0.01 ? "risk" : (v > 0.03 ? "ok" : "normal")); } },
      { key: "convDelta", name: "转化率环比", value: dec.convDelta, unit: "pct", cat: "转化",
        base: ">0 优秀", benchmark: function (v) { return v == null ? null : (v < -0.2 ? "risk" : (v > 0 ? "ok" : "normal")); } },
      { key: "avgPrice", name: "客单价", value: m.avgPrice, unit: "money", cat: "转化",
        base: "环比看提升", benchmark: function (v, ctx) { return ctx.aDelta >= 0 ? "ok" : (ctx.aDelta < -0.1 ? "risk" : "normal"); },
        ctx: { aDelta: dec.aovDelta } },
      { key: "grossMargin", name: "毛利率", value: m.grossMargin, unit: "pct", cat: "利润",
        base: ">15% 优秀", benchmark: function (v) { return v == null ? null : (v < 0.08 ? "risk" : (v > 0.15 ? "ok" : "normal")); } },
      { key: "netMargin", name: "净利率", value: prof.netMargin, unit: "pct", cat: "利润",
        base: ">5% 健康 / <0% 亏损", benchmark: function (v) { return v == null ? null : (v < 0 ? "risk" : (v > 0.05 ? "ok" : "normal")); } },
      { key: "netProfit", name: "净利润", value: prof.netProfit, unit: "money", cat: "利润",
        base: ">0 盈利", benchmark: function (v) { return v == null ? null : (v < 0 ? "risk" : "ok"); } },
      { key: "adRoi", name: "广告投入产出比", value: prof.adRoi, unit: "ratio", cat: "投放",
        base: ">3 优秀 / <1.5 风险", benchmark: function (v) { return v == null ? null : (v < 1.5 ? "risk" : (v > 3 ? "ok" : "normal")); } },
      { key: "adProfitRoi", name: "毛利/广告费", value: prof.adProfitRoi, unit: "ratio", cat: "投放",
        base: ">1 才不亏", benchmark: function (v) { return v == null ? null : (v < 1 ? "risk" : (v > 1.5 ? "ok" : "normal")); } },
      { key: "inventoryTurnover", name: "库存周转率", value: m.inventoryTurnover, unit: "times", cat: "库存",
        base: ">4 优秀 / <2 风险", benchmark: function (v) { return v == null ? null : (v < 2 ? "risk" : (v > 4 ? "ok" : "normal")); } },
      { key: "refundRate", name: "退款率", value: m.refundRate, unit: "pct", cat: "服务",
        base: "<3% 优秀 / >8% 风险", benchmark: function (v) { return v == null ? null : (v > 0.08 ? "risk" : (v < 0.03 ? "ok" : "normal")); } },
    ];
    return list;
  }

  // ========== GMV 下滑归因（核心诊断逻辑）==========
  function attributeGmvDecline(dec, traf, prof) {
    if (dec.gmvDelta == null) return { mode: "unknown", tag: "数据不足", points: [] };
    var points = [];

    if (dec.gmvDelta >= 0) {
      // GMV 增长 → 归因增长来源
      if (dec.volContribution != null && dec.volContribution > 0) {
        points.push("量增贡献：" + money(dec.volContribution) + "（流量×转化提升带动）");
      }
      if (dec.priceContribution != null && dec.priceContribution > 0) {
        points.push("价增贡献：" + money(dec.priceContribution) + "（客单价提升带动）");
      }
      if (traf.paidContribution != null && traf.paidContribution > 0) {
        points.push("付费流量净增 " + traf.paidContribution + " 人，付费驱动增长");
      }
      if (dec.convDelta != null && dec.convDelta > 0) {
        return { mode: "growth_quality", tag: "增长健康型",
          points: points.concat(["转化率同步提升 " + pct(dec.convDelta, 1) + "，增长质量高"]) };
      }
      return { mode: "growth_paid", tag: "付费驱动增长型",
        points: points.concat(["⚠ 增长主要靠付费流量，转化率未同步提升，注意增长可持续性"]) };
    }

    // GMV 下滑 → 拆解是量跌还是价跌
    if (dec.volContribution != null && dec.volContribution < 0) {
      points.push("量跌拖累：" + money(dec.volContribution) + "（流量或转化下滑）");
    }
    if (dec.priceContribution != null && dec.priceContribution < 0) {
      points.push("价跌拖累：" + money(dec.priceContribution) + "（客单价下滑）");
    }

    // 进一步定位量跌原因
    if (dec.trafficDelta != null && dec.trafficDelta < 0) {
      points.push("访客数下滑 " + pct(dec.trafficDelta, 1) + "，流量端出问题");
    }
    if (dec.convDelta != null && dec.convDelta < 0) {
      points.push("转化率下滑 " + pct(dec.convDelta, 1) + "，转化端出问题（价格/商详/库存/竞品）");
    }

    // 利润维度
    if (prof.netProfit != null && prof.netProfit < 0) {
      points.push("⚠ 净利润为负（" + money(prof.netProfit) + "），已进入亏损");
      return { mode: "loss", tag: "亏损预警型", points: points };
    }
    if (prof.grossMarginDelta != null && prof.grossMarginDelta < 0) {
      points.push("毛利率下滑 " + pct(prof.grossMarginDelta, 1) + "，价格战侵蚀利润");
    }
    if (prof.adRoiDelta != null && prof.adRoiDelta < 0) {
      points.push("广告 ROI 下滑 " + pct(prof.adRoiDelta, 1) + "，投放效率恶化");
    }

    if (dec.trafficDelta != null && dec.trafficDelta < 0 && dec.convDelta != null && dec.convDelta < 0) {
      return { mode: "double_drop", tag: "量价双跌型", points: points };
    }
    if (dec.convDelta != null && dec.convDelta < 0) {
      return { mode: "conv_drop", tag: "转化崩塌型", points: points };
    }
    if (dec.trafficDelta != null && dec.trafficDelta < 0) {
      return { mode: "traffic_drop", tag: "流量下滑型", points: points };
    }
    if (prof.grossMarginDelta != null && prof.grossMarginDelta < 0) {
      return { mode: "margin_squeeze", tag: "利润挤压型", points: points };
    }
    return { mode: "decline", tag: "GMV 下滑型", points: points };
  }

  // ========== 综合评级 ==========
  function overallRating(ratios, dec, prof) {
    var ok = 0, normal = 0, risk = 0, total = 0;
    ratios.forEach(function (r) {
      var b = r.benchmark(r.value, r.ctx);
      if (b) { total++; if (b === "ok") ok++; else if (b === "normal") normal++; else if (b === "risk") risk++; }
    });
    var grade, summary;
    if (prof.netProfit != null && prof.netProfit < 0) {
      grade = "风险"; summary = "当期净利润为负，已进入亏损，需立即止损并优化投放与转化。";
    } else if (risk >= 3 || (total > 0 && risk / total > 0.3)) {
      grade = "风险"; summary = "多项核心指标处于风险区间，经营脆弱性较高，建议优先处理高风险项。";
    } else if (ok >= Math.ceil(total * 0.6) && risk <= 1) {
      grade = "优秀"; summary = "核心指标多数处于优秀区间，GMV 增长健康，利润与周转结构协调。";
    } else {
      grade = "正常"; summary = "核心指标整体处于正常区间，部分维度存在改善空间，建议针对性优化。";
    }
    return { grade: grade, summary: summary, ok: ok, normal: normal, risk: risk, total: total };
  }

  // ========== 风险清单 ==========
  function buildRisks(m, dec, traf, prof) {
    var list = [];
    // 转化崩塌
    if (dec.convDelta != null && dec.convDelta < -0.15) {
      list.push(risk("high", "转化率断崖下滑", "转化率环比 " + pct(dec.convDelta, 1),
        "转化率是 GMV 核心，断崖下滑意味着流量进来但买不动，可能是价格/商详/库存/竞品问题，广告费越花越亏。",
        "立即暂停低效付费流量；核查主图商详与价格竞争力；排查是否断货或竞品破价；A/B 测试素材与优惠组合。"));
    }
    // 亏损
    if (prof.netProfit != null && prof.netProfit < 0) {
      list.push(risk("high", "当期亏损", "净利润 " + money(prof.netProfit) + "（净利率 " + pct(prof.netMargin, 1) + "）",
        "GMV 无法覆盖成本，持续亏损将消耗现金流，需立即止血。",
        "削减亏损 SKU 与低 ROI 投放；优化毛利结构（提客单/降成本）；聚焦高毛利品类；评估是否涨价或砍长尾 SKU。"));
    }
    // 广告 ROI 恶化
    if (prof.adRoiDelta != null && prof.adRoiDelta < -0.15) {
      list.push(risk("high", "广告投放效率恶化", "广告 ROI 环比 " + pct(prof.adRoiDelta, 1) + "（当前 " + ratio(prof.adRoi) + "）",
        "花钱没换来对等 GMV，投放效率恶化，边际投入为负。",
        "重构投放关键词与人群（参考小红书种草词）；优化落地页与主图提升转化；砍掉低转化高花费计划，集中预算到高 ROI 计划。"));
    }
    // 付费依赖
    var paidShare = safeDiv(m.paidTraffic, (m.paidTraffic + m.freeTraffic));
    if (paidShare != null && paidShare > 0.6) {
      list.push(risk("mid", "过度依赖付费流量", "付费流量占比 " + pct(paidShare, 1),
        "流量结构失衡，一旦停投 GMV 断崖，自然流量未培育起来。",
        "加强 SEO/标题/主图优化提升自然搜索；做内容种草（小红书/短视频）反哺站内；提升复购与私域沉淀。"));
    }
    // 毛利下滑
    if (prof.grossMarginDelta != null && prof.grossMarginDelta < -0.1) {
      list.push(risk("mid", "毛利率下滑，陷入价格战", "毛利率环比 " + pct(prof.grossMarginDelta, 1) + "（当前 " + pct(m.grossMargin, 1) + "）",
        "客单价下降或成本上升侵蚀毛利，营收增长但利润不增。",
        "优化产品结构提升高毛利占比；用虚拟组套/赠品替代纯降价；与供应商谈成本；提客单价（套餐/满减/关联销售）。"));
    }
    // 库存周转慢
    if (m.inventoryTurnover != null && m.inventoryTurnover < 2) {
      list.push(risk("mid", "库存周转缓慢", "库存周转率 " + ratio(m.inventoryTurnover) + " 次",
        "资金占用大，存在积压与跌价风险。",
        "清理滞销/无动销 SKU（清仓/赠品搭售）；推行精益库存；按动销分级管理 SKU。"));
    }
    // 退款率
    if (m.refundRate != null && m.refundRate > 0.05) {
      list.push(risk("mid", "退款率偏高", "退款率 " + pct(m.refundRate, 1),
        "退款侵蚀实际成交，可能反映质量/描述/物流问题，影响店铺评分与流量。",
        "核查高退款 SKU 根因（质量/描述不符/物流）；优化详情页预期管理；提升客服售前沟通。"));
    }
    // 客单价下滑
    if (dec.aovDelta != null && dec.aovDelta < -0.1) {
      list.push(risk("low", "客单价下滑", "客单价环比 " + pct(dec.aovDelta, 1),
        "客单价下滑拉低 GMV，可能套餐/满减策略失效或低价品占比上升。",
        "重新设计套餐组套与满减门槛；提升高客单品占比与曝光；关联销售带动提篮。"));
    }
    // 流量下滑但未崩
    if (dec.trafficDelta != null && dec.trafficDelta < -0.1 && dec.trafficDelta > -0.2) {
      list.push(risk("low", "访客数下滑", "访客环比 " + pct(dec.trafficDelta, 1),
        "流量端走弱，需关注自然流量与付费效率。",
        "优化标题关键词与主图点击率；评估付费投放预算与计划。"));
    }
    // 优势项
    if (prof.netProfit != null && prof.netProfit > 0 && prof.adProfitRoi != null && prof.adProfitRoi > 1.5) {
      list.push(risk("low", "投放盈利能力良好（优势项）", "毛利/广告费 " + ratio(prof.adProfitRoi),
        "广告投入有正向毛利回报，投放模型健康。",
        "可适度加大高 ROI 计划预算，复制到相似品类。"));
    }

    var order = { high: 0, mid: 1, low: 2 };
    list.sort(function (a, b) { return order[a.priority] - order[b.priority]; });
    return list;
  }

  function risk(priority, title, evidence, impact, suggestion) {
    return { priority: priority, title: title, evidence: evidence, impact: impact, suggestion: suggestion };
  }

  // ========== 四维度诊断 ==========
  function diagnoseDimensions(ratios) {
    var byKey = {}; ratios.forEach(function (r) { byKey[r.key] = r; });
    function scoreDim(keys) {
      var sum = 0, cnt = 0;
      keys.forEach(function (k) {
        var r = byKey[k];
        if (r && r.value != null) {
          var b = r.benchmark(r.value, r.ctx);
          if (b === "ok") sum += 2; else if (b === "normal") sum += 1;
          cnt++;
        }
      });
      if (!cnt) return { text: "数据不足", cls: "" };
      var avg = sum / cnt;
      return { text: avg >= 1.5 ? "优秀" : (avg >= 0.8 ? "正常" : "风险"), cls: avg >= 1.5 ? "ok" : (avg >= 0.8 ? "normal" : "risk") };
    }
    return [
      { key: "scale", icon: "📊", name: "规模增长", score: scoreDim(["gmv", "gmvGrowth"]),
        items: [diItem(byKey.gmv), diItem(byKey.gmvGrowth)] },
      { key: "traffic", icon: "🚥", name: "流量结构", score: scoreDim(["traffic", "paidShare"]),
        items: [diItem(byKey.traffic), diItem(byKey.paidShare)] },
      { key: "conversion", icon: "🎯", name: "转化效率", score: scoreDim(["conversionRate", "convDelta", "avgPrice"]),
        items: [diItem(byKey.conversionRate), diItem(byKey.convDelta), diItem(byKey.avgPrice)] },
      { key: "profit", icon: "💰", name: "盈利能力", score: scoreDim(["grossMargin", "netMargin", "netProfit", "adRoi", "adProfitRoi"]),
        items: [diItem(byKey.grossMargin), diItem(byKey.netMargin), diItem(byKey.netProfit), diItem(byKey.adRoi)] },
      { key: "inventory", icon: "📦", name: "库存服务", score: scoreDim(["inventoryTurnover", "refundRate"]),
        items: [diItem(byKey.inventoryTurnover), diItem(byKey.refundRate)] }
    ];
  }

  function diItem(r) {
    if (!r) return { label: "—", value: "—", note: "", status: null };
    var b = (r.value != null) ? r.benchmark(r.value, r.ctx) : null;
    var val;
    if (r.value == null) val = "—";
    else if (r.unit === "money") val = money(r.value);
    else if (r.unit === "pct") val = pct(r.value, 1);
    else if (r.unit === "ratio") val = ratio(r.value);
    else if (r.unit === "times") val = r.value.toFixed(2) + " 次";
    else if (r.unit === "num") val = r.value + " 人";
    else val = r.value;
    return { label: r.name, value: val, note: r.base, status: b };
  }

  // ========== 主入口 ==========
  function analyze(shopData) {
    var m = shopData.metrics;
    var dec = decomposeGmv(m);
    var traf = decomposeTraffic(m);
    var prof = diagnoseProfit(m, dec.gmv);
    var ratios = computeRatios(m, dec, prof);
    var attribution = attributeGmvDecline(dec, traf, prof);
    var dims = diagnoseDimensions(ratios);
    var rating = overallRating(ratios, dec, prof);
    var risks = buildRisks(m, dec, traf, prof);

    return {
      shop: shopData.shop, period: shopData.period, tag: shopData.tag, summary: shopData.summary,
      metrics: m, decompose: dec, traffic: traf, profit: prof,
      ratios: ratios, attribution: attribution, dimensions: dims, rating: rating, risks: risks,
      fmt: { money: money, pct: pct, ratio: ratio, fmtDelta: fmtDelta }
    };
  }

  return {
    analyze: analyze,
    decomposeGmv: decomposeGmv,
    decomposeTraffic: decomposeTraffic,
    diagnoseProfit: diagnoseProfit,
    attributeGmvDecline: attributeGmvDecline,
    overallRating: overallRating,
    buildRisks: buildRisks,
    money: money, pct: pct, ratio: ratio, fmtDelta: fmtDelta
  };

})();
