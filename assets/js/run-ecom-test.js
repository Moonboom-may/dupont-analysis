/* run-ecom-test.js — 独立电商引擎测试入口（路径已修正）*/
global.window = global;
var fs = require("fs");
var path = require("path");
var base = path.join(__dirname, "..", "..", "ecommerce", "js");
function loadScript(rel) { eval(fs.readFileSync(path.join(base, rel), "utf-8")); }
loadScript("ecom-data.js");
loadScript("ecom-engine.js");

var ok = 0, fail = 0;
function assert(c, m) { if (c) { ok++; console.log("  ✓ " + m); } else { fail++; console.error("  ✗ " + m); } }

var expect = { growth: "优秀", traffic_drop: "风险", margin_squeeze: "正常" };
Object.keys(window.ECOM_DATA).forEach(function (key) {
  var data = JSON.parse(JSON.stringify(window.ECOM_DATA[key]));
  console.log("\n=== 样本：" + data.shop + " ===");
  var r = window.EcomEngine.analyze(data);
  if (r.decompose.traffic != null && r.decompose.conv != null && r.decompose.aov != null) {
    var calcGmv = r.decompose.traffic * r.decompose.conv * r.decompose.aov;
    assert(Math.abs(calcGmv - r.decompose.gmv) / r.decompose.gmv < 0.01, "GMV 三因素一致性");
  }
  assert(r.attribution.mode !== "unknown", "GMV 归因 = " + r.attribution.tag);
  if (key === "growth") assert(r.decompose.gmvDelta > 0, "增长型 GMV 环比正");
  if (key === "traffic_drop") { assert(r.decompose.convDelta < 0, "转化崩塌"); assert(r.profit.netProfit < 0, "亏损"); }
  if (key === "margin_squeeze") assert(r.profit.grossMarginDelta < 0, "毛利下滑");
  assert(r.ratios.length === 14, "14项指标齐全（" + r.ratios.length + "）");
  assert(["优秀", "正常", "风险"].indexOf(r.rating.grade) >= 0, "评级 = " + r.rating.grade);
  assert(r.dimensions.length === 5, "五维度诊断齐全");
  assert(Array.isArray(r.risks) && r.risks.length > 0, "风险清单 " + r.risks.length + " 项");
  assert(r.rating.grade === expect[key], "评级符合预期：" + expect[key]);
  if (r.decompose.volContribution != null && r.decompose.priceContribution != null) {
    var tc = r.decompose.volContribution + r.decompose.priceContribution;
    var gd = r.decompose.gmv - r.decompose.prevGmv;
    if (Math.abs(gd) > 1000) assert(Math.abs(tc - gd) / Math.abs(gd) < 0.05, "量价分解自洽（量" + (r.decompose.volContribution / 10000).toFixed(2) + "万 + 价" + (r.decompose.priceContribution / 10000).toFixed(2) + "万 ≈ Δ" + (gd / 10000).toFixed(2) + "万）");
  }
  console.log("  — 归因：" + r.attribution.tag + " | 评级：" + r.rating.grade + " | GMV环比：" + (r.decompose.gmvDelta * 100).toFixed(1) + "% | 净利：" + (r.profit.netProfit / 10000).toFixed(2) + "万");
});
console.log("\n=========================");
console.log("通过 " + ok + " / 失败 " + fail);
console.log("=========================");
process.exit(fail > 0 ? 1 : 0);
