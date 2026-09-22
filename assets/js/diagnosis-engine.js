/* =========================================================
   diagnosis-engine.js
   经营诊断引擎
   - 14 项核心比率与基准评价
   - 盈利/偿债/营运/现金流四维度深度诊断
   - 三级综合评级（优秀/正常/风险）
   - 风险提示清单（高/中/低优先级）
   - AI 经营顾问洞察（基于规则的严谨客观生成）
   ========================================================= */

window.DiagnosisEngine = (function () {

  function safeDiv(a, b) {
    if (a == null || b == null) return null;
    if (Math.abs(b) < 1e-9) return null;
    return a / b;
  }
  function pct(n, d) { return n == null ? "—" : (n * 100).toFixed(d == null ? 2 : d) + "%"; }
  function times(n, d) { return n == null ? "—" : n.toFixed(d == null ? 2 : d) + " 次"; }
  function ratio(n, d) { return n == null ? "—" : n.toFixed(d == null ? 2 : d); }

  // 计算 14 项核心比率
  function computeRatios(s) {
    var b = s.balance || {}, i = s.income || {}, c = s.cashflow || {};
    var totalAssets = b["资产总计"];
    var totalLiab = b["负债合计"];
    var equity = b["所有者权益合计"] || ((totalAssets != null && totalLiab != null) ? (totalAssets - totalLiab) : null);
    var currentAssets = b["流动资产合计"];
    var currentLiab = b["流动负债合计"];
    var inventory = b["存货"];
    var accountsRecv = b["应收账款"];
    var netProfit = (i["净利润"] != null) ? i["净利润"] : i["其中：归属于母公司股东的净利润"];
    var revenue = i["营业收入"];
    var opProfit = i["营业利润"];
    var totalLiab_t = i["利润总额"];
    var tax = i["所得税费用"];
    var ocf = c["经营活动产生的现金流量净额"];
    var icf = c["投资活动产生的现金流量净额"];
    var fcf = c["筹资活动产生的现金流量净额"];

    var grossProfit = (revenue != null && i["营业成本"] != null) ? (revenue - i["营业成本"]) : null;

    return [
      { key: "roe", name: "净资产收益率 ROE", value: safeDiv(netProfit, equity), unit: "pct", cat: "盈利",
        base: ">12% 优秀 / 8-12% 正常 / <0% 风险", benchmark: function (v) { return v == null ? null : (v < 0 ? "risk" : (v > 0.12 ? "ok" : "normal")); },
        desc: "股东投入净资产的回报率" },
      { key: "roa", name: "总资产收益率 ROA", value: safeDiv(netProfit, totalAssets), unit: "pct", cat: "盈利",
        base: ">6% 优秀", benchmark: function (v) { return v == null ? null : (v < 0 ? "risk" : (v > 0.06 ? "ok" : "normal")); },
        desc: "全部资产的盈利效率" },
      { key: "npm", name: "销售净利率", value: safeDiv(netProfit, revenue), unit: "pct", cat: "盈利",
        base: "行业差异大", benchmark: function (v) { return v == null ? null : (v < 0 ? "risk" : (v > 0.10 ? "ok" : "normal")); },
        desc: "净利润占营收比" },
      { key: "gpm", name: "销售毛利率", value: safeDiv(grossProfit, revenue), unit: "pct", cat: "盈利",
        base: "行业差异大", benchmark: function (v) { return v == null ? null : (v < 0 ? "risk" : (v > 0.30 ? "ok" : "normal")); },
        desc: "毛利占营收比" },
      { key: "debt", name: "资产负债率", value: safeDiv(totalLiab, totalAssets), unit: "pct", cat: "偿债",
        base: "<50% 优秀 / 50-70% 正常 / >80% 风险", benchmark: function (v) { return v == null ? null : (v > 0.8 ? "risk" : (v < 0.5 ? "ok" : "normal")); },
        desc: "负债占总资产比" },
      { key: "equityMult", name: "权益乘数", value: safeDiv(totalAssets, equity), unit: "ratio", cat: "偿债",
        base: "<2 优秀 / 2-4 正常 / >5 风险", benchmark: function (v) { return v == null ? null : (v > 5 ? "risk" : (v < 2 ? "ok" : "normal")); },
        desc: "财务杠杆倍数" },
      { key: "current", name: "流动比率", value: safeDiv(currentAssets, currentLiab), unit: "ratio", cat: "偿债",
        base: ">2 优秀 / 1-2 正常 / <1 风险", benchmark: function (v) { return v == null ? null : (v < 1 ? "risk" : (v > 2 ? "ok" : "normal")); },
        desc: "流动资产/流动负债" },
      { key: "quick", name: "速动比率", value: safeDiv((currentAssets != null && inventory != null) ? (currentAssets - inventory) : null, currentLiab), unit: "ratio", cat: "偿债",
        base: ">1 优秀", benchmark: function (v) { return v == null ? null : (v < 0.5 ? "risk" : (v > 1 ? "ok" : "normal")); },
        desc: "(流动资产-存货)/流动负债" },
      { key: "assetTurn", name: "总资产周转率", value: safeDiv(revenue, totalAssets), unit: "times", cat: "营运",
        base: "行业差异大", benchmark: function (v) { return v == null ? null : (v > 1 ? "ok" : "normal"); },
        desc: "营收/总资产" },
      { key: "invTurn", name: "存货周转率", value: safeDiv(i["营业成本"], inventory), unit: "times", cat: "营运",
        base: ">4 优秀", benchmark: function (v) { return v == null ? null : (v < 1 ? "risk" : (v > 4 ? "ok" : "normal")); },
        desc: "营业成本/存货" },
      { key: "recvTurn", name: "应收账款周转率", value: safeDiv(revenue, accountsRecv), unit: "times", cat: "营运",
        base: ">6 优秀", benchmark: function (v) { return v == null ? null : (v < 2 ? "risk" : (v > 6 ? "ok" : "normal")); },
        desc: "营收/应收账款" },
      { key: "ocfNi", name: "净利润现金含量", value: safeDiv(ocf, netProfit), unit: "ratio", cat: "现金流",
        base: ">1 优秀 / <0.3 风险", benchmark: function (v) { return v == null ? null : (v < 0.3 && v >= 0 ? "risk" : (v > 1 ? "ok" : "normal")); },
        desc: "经营现金流/净利润" },
      { key: "ocfRev", name: "销售现金比率", value: safeDiv(ocf, revenue), unit: "pct", cat: "现金流",
        base: ">10% 优秀", benchmark: function (v) { return v == null ? null : (v < 0 ? "risk" : (v > 0.10 ? "ok" : "normal")); },
        desc: "经营现金流/营收" },
      { key: "fcf", name: "自由现金流(近似)", value: (ocf != null && icf != null) ? (ocf + icf) : null, unit: "amount", cat: "现金流",
        base: ">0 健康", benchmark: function (v) { return v == null ? null : (v < 0 ? "risk" : "ok"); },
        desc: "经营现金流+投资现金流" },
    ];
  }

  function fmtAmount(n) {
    if (n == null) return "—";
    var abs = Math.abs(n), sign = n < 0 ? "-" : "";
    if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + " 亿";
    if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + " 万";
    return sign + abs.toFixed(0) + " 元";
  }

  function formatRatio(r) {
    if (r.value == null) return "—";
    if (r.unit === "pct") return pct(r.value);
    if (r.unit === "times") return times(r.value);
    if (r.unit === "ratio") return ratio(r.value);
    if (r.unit === "amount") return fmtAmount(r.value);
    return r.value;
  }

  // 四维度诊断
  function diagnoseDimensions(ratios, dupont) {
    var byKey = {};
    ratios.forEach(function (r) { byKey[r.key] = r; });

    var dims = [
      {
        key: "profit", icon: "💰", name: "盈利能力", score: scoreDim(["roe", "roa", "npm", "gpm"]),
        items: [
          di(byKey.roe, "ROE 体现股东回报，是盈利能力总成"),
          di(byKey.roa, "ROA 体现全部资产的盈利效率"),
          di(byKey.npm, "销售净利率体现每元营收的最终盈利"),
          di(byKey.gpm, "毛利率体现产品基础盈利空间")
        ]
      },
      {
        key: "solvency", icon: "🏦", name: "偿债能力", score: scoreDim(["debt", "equityMult", "current", "quick"]),
        items: [
          di(byKey.debt, "资产负债率衡量整体负债压力"),
          di(byKey.equityMult, "权益乘数衡量财务杠杆程度"),
          di(byKey.current, "流动比率衡量短期偿债能力"),
          di(byKey.quick, "速动比率剔除存货后的偿债能力")
        ]
      },
      {
        key: "operation", icon: "🔄", name: "营运能力", score: scoreDim(["assetTurn", "invTurn", "recvTurn"]),
        items: [
          di(byKey.assetTurn, "总资产周转率衡量资产运营效率"),
          di(byKey.invTurn, "存货周转率衡量存货变现速度"),
          di(byKey.recvTurn, "应收账款周转率衡量回款效率")
        ]
      },
      {
        key: "cashflow", icon: "💧", name: "现金流造血", score: scoreDim(["ocfNi", "ocfRev", "fcf"]),
        items: [
          di(byKey.ocfNi, "净利润现金含量衡量利润的现金支撑"),
          di(byKey.ocfRev, "销售现金比率衡量营收的含金量"),
          di(byKey.fcf, "自由现金流衡量扣除投资后的可支配现金")
        ]
      }
    ];

    function scoreDim(keys) {
      var sum = 0, cnt = 0;
      keys.forEach(function (k) {
        var r = byKey[k];
        if (r && r.value != null && r.benchmark) {
          var b = r.benchmark(r.value);
          if (b === "ok") sum += 2;
          else if (b === "normal") sum += 1;
          cnt++;
        }
      });
      if (!cnt) return { text: "数据不足", cls: "" };
      var avg = sum / cnt;
      var cls = avg >= 1.5 ? "ok" : (avg >= 0.8 ? "normal" : "risk");
      var text = cls === "ok" ? "优秀" : (cls === "normal" ? "正常" : "风险");
      return { text: text, cls: cls };
    }
    function di(r, note) {
      var b = (r && r.benchmark && r.value != null) ? r.benchmark(r.value) : null;
      return {
        label: r ? r.name : "—",
        value: r ? formatRatio(r) : "—",
        note: note,
        status: b
      };
    }

    return dims;
  }

  // 综合评级
  function overallRating(ratios, dupont) {
    var ok = 0, normal = 0, risk = 0, total = 0;
    ratios.forEach(function (r) {
      if (r.value != null && r.benchmark) {
        var b = r.benchmark(r.value);
        total++;
        if (b === "ok") ok++;
        else if (b === "normal") normal++;
        else if (b === "risk") risk++;
      }
    });
    var driverMode = dupont ? dupont.driver.mode : "unknown";
    var grade, summary;
    // 亏损即风险
    if (driverMode === "loss" || (ratios[0] && ratios[0].value != null && ratios[0].value < 0)) {
      grade = "风险";
      summary = "企业当期处于亏损状态，ROE 为负，核心盈利能力受损。需立即止损并审视经营模式可持续性。";
    } else if (risk >= 3 || (total > 0 && risk / total > 0.35)) {
      grade = "风险";
      summary = "多项核心指标处于风险区间，经营脆弱性较高，建议优先处理高风险项。";
    } else if (ok >= Math.ceil(total * 0.6) && risk <= 1) {
      grade = "优秀";
      summary = "核心指标多数处于优秀区间，盈利、现金流、周转与杠杆结构健康，经营稳健向上。";
    } else {
      grade = "正常";
      summary = "核心指标整体处于正常区间，部分维度存在改善空间，建议针对性优化。";
    }
    return { grade: grade, summary: summary, ok: ok, normal: normal, risk: risk, total: total };
  }

  // 风险提示清单
  function buildRiskList(ratios, dupont, balance) {
    var byKey = {};
    ratios.forEach(function (r) { byKey[r.key] = r; });
    var list = [];

    // 亏损
    var roe = byKey.roe;
    if (roe && roe.value != null && roe.value < 0) {
      list.push(riskItem("high", "当期净利润为负，企业亏损", "净利润 < 0",
        "ROE 为负值，股东价值被侵蚀；持续亏损将消耗净资产并削弱偿债能力。",
        "立即审视成本费用结构与收入下滑原因，制定扭亏方案；评估非核心资产处置与人员优化；必要时调整业务结构。"));
    }
    // 高杠杆
    var debt = byKey.debt, em = byKey.equityMult;
    if (debt && debt.value != null && debt.value > 0.8) {
      list.push(riskItem("high", "资产负债率过高，财务杠杆风险显著", "资产负债率 " + pct(debt.value, 1) + "（阈值 80%）",
        "负债占比过高，一旦盈利或现金流波动，将面临偿债与再融资压力，财务脆弱性高。",
        "制定降杠杆计划，优先压降高成本短期借款；优化债务期限结构，提升经营性现金流覆盖；审慎新增资本开支。"));
    } else if (em && em.value != null && em.value > 5) {
      list.push(riskItem("mid", "权益乘数偏高，杠杆放大效应显著", "权益乘数 " + ratio(em.value) + "（阈值 5）",
        "ROE 中相当部分由杠杆放大，盈利下行时亏损会被同步放大。",
        "控制有息负债规模，关注利息保障倍数；提升内生盈利以降低对杠杆的依赖。"));
    }
    // 现金流质量
    var ocfNi = byKey.ocfNi;
    if (ocfNi && ocfNi.value != null && ocfNi.value >= 0 && ocfNi.value < 0.3) {
      list.push(riskItem("high", "经营现金流对净利润支撑不足", "净利润现金含量 " + ratio(ocfNi.value) + "（阈值 0.3）",
        "利润的现金转化率低，可能存在应收/存货占用或收入质量问题，利润『含金量』不足。",
        "加强应收账款回款管理，缩短账期；优化库存周转，减少资金占用；核查收入确认政策。"));
    }
    var ocfRev = byKey.ocfRev;
    if (ocfRev && ocfRev.value != null && ocfRev.value < 0) {
      list.push(riskItem("high", "经营活动现金净流出", "销售现金比率 " + pct(ocfRev.value, 1),
        "经营环节现金净流出，造血能力受损，依赖外部融资维持运转，可持续性存疑。",
        "聚焦经营活动现金流回正：催收应收、去化存货、优化付款条件；暂停扩张性资本开支。"));
    }
    // 流动性
    var current = byKey.current;
    if (current && current.value != null && current.value < 1) {
      list.push(riskItem("high", "短期偿债能力不足", "流动比率 " + ratio(current.value) + "（阈值 1）",
        "流动资产不足以覆盖流动负债，存在短期偿债压力与流动性风险。",
        "调整负债期限结构，增加长期资金占比；加快流动资产变现；与债权人协商展期或授信安排。"));
    }
    // 周转
    var invTurn = byKey.invTurn;
    if (invTurn && invTurn.value != null && invTurn.value < 1) {
      list.push(riskItem("mid", "存货周转缓慢", "存货周转率 " + times(invTurn.value) + "（阈值 1）",
        "存货占用资金大、变现慢，存在跌价与积压风险。",
        "加强存货计划与去化，清理滞销品；推行精益库存管理，提升周转效率。"));
    }
    var recvTurn = byKey.recvTurn;
    if (recvTurn && recvTurn.value != null && recvTurn.value < 2) {
      list.push(riskItem("mid", "应收账款回款偏慢", "应收账款周转率 " + times(recvTurn.value) + "（阈值 2）",
        "回款效率低，坏账风险与资金占用成本上升。",
        "强化信用政策与账期管理，加大催收力度；评估客户信用分级，控制高风险客户敞口。"));
    }
    // 偿债能力偏紧但可控
    if (current && current.value != null && current.value >= 1 && current.value < 1.5) {
      list.push(riskItem("low", "流动比率偏低但尚可", "流动比率 " + ratio(current.value),
        "短期偿债能力处于警戒边缘，需持续监控。",
        "保持合理流动资金储备，关注短期债务到期节奏。"));
    }
    // 盈利偏弱
    var npm = byKey.npm;
    if (npm && npm.value != null && npm.value > 0 && npm.value < 0.05) {
      list.push(riskItem("mid", "销售净利率偏低", "销售净利率 " + pct(npm.value, 1),
        "盈利空间薄，对成本费用波动与销量下滑的抵御能力弱。",
        "优化产品结构与定价，降本增效；关注高毛利业务占比提升。"));
    }
    // 正向提示（低优先级优势项）
    if (ocfNi && ocfNi.value != null && ocfNi.value > 1) {
      list.push(riskItem("low", "利润现金支撑充足（优势项）", "净利润现金含量 " + ratio(ocfNi.value),
        "经营现金流对净利润覆盖充分，利润质量高，造血能力强。",
        "保持现金回款管理优势，可考虑适度提高再投资或股东回报。"));
    }

    // 去重 & 排序：high → mid → low
    var order = { high: 0, mid: 1, low: 2 };
    list.sort(function (a, b) { return order[a.priority] - order[b.priority]; });
    return list;
  }

  function riskItem(priority, title, evidence, impact, suggestion) {
    return { priority: priority, title: title, evidence: evidence, impact: impact, suggestion: suggestion };
  }

  // AI 经营顾问洞察（基于规则，严谨客观）
  function generateAIInsight(context) {
    var rating = context.rating, ratios = context.ratios, dupont = context.dupont, company = context.company || "该企业";
    var byKey = {}; ratios.forEach(function (r) { byKey[r.key] = r; });

    var lines = [];
    lines.push("【高管层经营复盘 · " + (company) + " · " + (context.period || "本期") + "】");
    lines.push("");
    lines.push("一、总体判断");
    lines.push("综合评级为【" + rating.grade + "】。");
    if (rating.grade === "优秀") {
      lines.push("本期经营表现稳健向好，盈利、现金流、周转与杠杆结构整体协调。ROE 达 " + pct(byKey.roe.value) +
        "，股东回报能力较强；净利润现金含量 " + ratio(byKey.ocfNi.value) + "，利润质量经得起检验。建议在维持现有经营节奏的基础上，关注优势项的可持续性，把握扩张与股东回报的平衡。");
    } else if (rating.grade === "正常") {
      lines.push("本期经营整体处于正常区间，核心指标无重大失衡，但部分维度存在结构性改善空间。ROE " + pct(byKey.roe.value) +
        "，杜邦驱动属【" + dupont.driver.tag + "】。建议在稳住基本盘的同时，针对薄弱维度定向优化，避免风险因素累积。");
    } else {
      lines.push("本期经营存在显著风险敞口，需管理层高度重视。ROE " + pct(byKey.roe.value) +
        "，驱动模式为【" + dupont.driver.tag + "】。" + rating.summary + " 建议立即启动专项诊断与整改，优先处理高优先级风险项。");
    }
    lines.push("");
    lines.push("二、主要优势");
    var advantages = [];
    if (byKey.ocfNi && byKey.ocfNi.value != null && byKey.ocfNi.value > 1) advantages.push("利润现金含量高（" + ratio(byKey.ocfNi.value) + "），经营造血能力强，利润质量扎实。");
    if (byKey.gpm && byKey.gpm.value != null && byKey.gpm.value > 0.3) advantages.push("销售毛利率达 " + pct(byKey.gpm.value) + "，具备一定产品定价权或成本优势。");
    if (byKey.current && byKey.current.value != null && byKey.current.value > 2) advantages.push("流动比率 " + ratio(byKey.current.value) + "，短期偿债能力充足，流动性安全垫厚。");
    if (dupont.driver.mode === "profit") advantages.push("ROE 以高销售净利率驱动（" + pct(byKey.npm.value) + "），盈利是价值创造的核心来源，模式可持续性较强。");
    if (dupont.driver.mode === "turnover") advantages.push("资产周转效率高（" + times(byKey.assetTurn.value) + "），资产运营能力强，薄利多销模式运转有效。");
    if (advantages.length === 0) advantages.push("当前各项指标未见显著优势项，建议聚焦改善经营基础。");
    advantages.forEach(function (a) { lines.push("· " + a); });
    lines.push("");
    lines.push("三、主要风险");
    var risks = [];
    if (byKey.debt && byKey.debt.value != null && byKey.debt.value > 0.8) risks.push("资产负债率 " + pct(byKey.debt.value, 1) + "，财务杠杆偏高，盈利波动会被放大，财务脆弱性上升。");
    if (byKey.ocfNi && byKey.ocfNi.value != null && byKey.ocfNi.value >= 0 && byKey.ocfNi.value < 0.3) risks.push("净利润现金含量仅 " + ratio(byKey.ocfNi.value) + "，利润现金支撑弱，需警惕收入质量与资金占用。");
    if (byKey.current && byKey.current.value != null && byKey.current.value < 1) risks.push("流动比率 " + ratio(byKey.current.value) + "，短期偿债能力不足，存在流动性风险。");
    if (byKey.roe && byKey.roe.value != null && byKey.roe.value < 0) risks.push("ROE 为负，当期亏损，股东价值被侵蚀，需立即扭亏。");
    if (dupont.driver.mode === "leverage") risks.push("ROE 高度依赖财务杠杆放大（权益乘数 " + ratio(byKey.equityMult.value) + "），内生盈利与周转贡献有限，杠杆一旦收缩，ROE 将显著回落。");
    if (byKey.invTurn && byKey.invTurn.value != null && byKey.invTurn.value < 1) risks.push("存货周转率仅 " + times(byKey.invTurn.value) + "，资金占用大，存在跌价与积压风险。");
    if (byKey.recvTurn && byKey.recvTurn.value != null && byKey.recvTurn.value < 2) risks.push("应收账款周转率 " + times(byKey.recvTurn.value) + "，回款偏慢，坏账与资金成本上升。");
    if (risks.length === 0) risks.push("暂未触发明确风险阈值，建议持续监控各指标边际变化。");
    risks.forEach(function (r) { lines.push("· " + r); });
    lines.push("");
    lines.push("四、优先建议");
    var recs = [];
    if (byKey.debt && byKey.debt.value != null && byKey.debt.value > 0.8) recs.push("【最高优先】启动降杠杆：压降高成本短期借款，优化债务期限结构，以经营性现金流覆盖利息支出。");
    if (byKey.roe && byKey.roe.value != null && byKey.roe.value < 0) recs.push("【最高优先】扭亏为盈：审视成本费用结构与收入下滑原因，制定 6-12 个月扭亏路径，必要时处置非核心资产。");
    if (byKey.ocfNi && byKey.ocfNi.value != null && byKey.ocfNi.value >= 0 && byKey.ocfNi.value < 0.3) recs.push("【高优先】改善利润现金转化：加强应收账款回款与存货去化，缩短现金循环周期。");
    if (byKey.current && byKey.current.value != null && byKey.current.value < 1) recs.push("【高优先】补足流动性：增加长期资金占比，加快流动资产变现，协商短期债务展期。");
    if (byKey.npm && byKey.npm.value != null && byKey.npm.value > 0 && byKey.npm.value < 0.05) recs.push("【中优先】提升盈利能力：优化产品结构与定价，推进降本增效，提升高毛利业务占比。");
    if (byKey.invTurn && byKey.invTurn.value != null && byKey.invTurn.value < 1) recs.push("【中优先】加速存货周转：推行精益库存管理，清理滞销品，降低资金占用。");
    if (byKey.recvTurn && byKey.recvTurn.value != null && byKey.recvTurn.value < 2) recs.push("【中优先】强化回款管理：信用分级管控，加大催收力度，控制高风险客户敞口。");
    if (recs.length === 0) recs.push("【维持】保持现有经营节奏，持续监控关键指标边际变化，把握扩张与稳健的平衡。");
    recs.forEach(function (r) { lines.push("· " + r); });
    lines.push("");
    lines.push("—— 本洞察由 AI 经营顾问基于已校验财务指标自动生成，口径客观，仅供参考。");

    return lines.join("\n");
  }

  // 总入口
  function diagnose(context) {
    // context = {statements, dupont}
    var ratios = computeRatios(context.statements);
    var dims = diagnoseDimensions(ratios, context.dupont);
    var rating = overallRating(ratios, context.dupont);
    var risks = buildRiskList(ratios, context.dupont, context.statements.balance);
    return {
      ratios: ratios, dimensions: dims, rating: rating, risks: risks,
      formatRatio: formatRatio, fmtAmount: fmtAmount,
      generateAIInsight: generateAIInsight
    };
  }

  return {
    diagnose: diagnose,
    computeRatios: computeRatios,
    overallRating: overallRating,
    buildRiskList: buildRiskList,
    generateAIInsight: generateAIInsight,
    formatRatio: formatRatio,
    fmtAmount: fmtAmount,
    pct: pct, times: times, ratio: ratio
  };

})();
