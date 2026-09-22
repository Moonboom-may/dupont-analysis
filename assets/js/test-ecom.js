/* test-ecom.js — 电商诊断引擎冒烟测试 */
global.window = global;
var fs = require("fs");
var path = require("path");
function loadScript(rel) {
  var code = fs.readFileSync(path.join(__dirname, rel), "utf-8");
  eval(code);
}
loadScript("ecom-data.js");
loadScript("ecom-engine.js");

var ok = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { ok++; console.log("  ✓ " + msg); }
  else { fail++; console.error("  ✗ " + msg); }
}

var expect = {
  growth: "优秀",
  traffic_drop: "风险",
  margin_squeeze: "正常"
};

Object.keys(window.ECOM_DATA).forEach(function (key) {
  var data = JSON.parse(JSON.stringify(window.ECOM_DATA[key]));
  console.log("\n=== 样本：" + data.shop + " ===");
  var r = window.EcomEngine.analyze(data);

  // GMV 拆解一致性：traffic * conv * aov ≈ gmv
  if (r.decompose.traffic != null && r.decompose.conv != null && r.decompose.aov != null) {
    var calcGmv = r.decompose.traffic * r.decompose.conv * r.decompose.aov;
    assert(Math.abs(calcGmv - r.decompose.gmv) / r.decompose.gmv < 0.01,
      "GMV 三因素一致性（计算 " + (calcGmv / 10000).toFixed(2) + "万 ≈ 实际 " + (r.decompose.gmv / 10000).toFixed(2) + "万）");
  }

  // 归因 tag 非空
  assert(r.attribution.mode !== "unknown", "GMV 归因 = " + r.attribution.tag + "（" + r.attribution.mode + "）");

  // 归因逻辑验证
  if (key === "growth") {
    assert(r.decompose.gmvDelta > 0, "增长型 GMV 环比为正（" + (r.decompose.gmvDelta * 100).toFixed(1) + "%）");
    assert(r.attribution.mode === "growth_quality" || r.attribution.mode === "growth_paid", "归因属增长类");
  }
  if (key === "traffic_drop") {
    assert(r.decompose.convDelta < 0, "转化崩塌型转化率环比为负（" + (r.decompose.convDelta * 100).toFixed(1) + "%）");
    assert(r.profit.netProfit < 0, "亏损型净利润为负（" + (r.profit.netProfit / 10000).toFixed(2) + "万）");
  }
  if (key === "margin_squeeze") {
    assert(r.profit.grossMarginDelta < 0, "利润挤压型毛利率环比为负（" + (r.profit.grossMarginDelta * 100).toFixed(1) + "%）");
  }

  // 14 项指标
  assert(r.ratios.length === 14, "核心比率 14 项齐全（实际 " + r.ratios.length + "）");
  assert(["优秀", "正常", "风险"].indexOf(r.rating.grade) >= 0, "综合评级 = " + r.rating.grade);
  assert(r.dimensions.length === 5, "五维度诊断齐全");
  assert(Array.isArray(r.risks) && r.risks.length > 0, "风险清单已生成（" + r.risks.length + " 项）");

  // 评级符合预期
  assert(r.rating.grade === expect[key], "评级符合预期场景：" + expect[key]);

  // 量价分解：量贡献+价贡献 ≈ GMV 增量
  if (r.decompose.volContribution != null && r.decompose.priceContribution != null) {
    var totalContrib = r.decompose.volContribution + r.decompose.priceContribution;
    var gmvDelta = r.decompose.gmv - r.decompose.prevGmv;
    if (Math.abs(gmvDelta) > 1000) {
      assert(Math.abs(totalContrib - gmvDelta) / Math.abs(gmvDelta) < 0.05,
        "量价分解自洽（量" + (r.decompose.volContribution / 10000).toFixed(2) + "万 + 价" + (r.decompose.priceContribution / 10000).toFixed(2) + "万 ≈ ΔGMV " + (gmvDelta / 10000).toFixed(2) + "万）");
    }
  }

  console.log("  — 归因：" + r.attribution.tag + " | 评级：" + r.rating.grade +
    " | GMV环比：" + (r.decompose.gmvDelta * 100).toFixed(1) + "% | 净利：" + (r.profit.netProfit / 10000).toFixed(2) + "万");
});

console.log("\n=========================");
console.log("通过 " + ok + " / 失败 " + fail);
console.log("=========================");
process.exit(fail > 0 ? 1 : 0);
