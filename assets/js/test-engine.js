/* =========================================================
   test-engine.js — 端到端冒烟测试（控制台输出）
   用 Node 加载各引擎脚本，对三套样本跑全流程并断言。
   运行：在项目根目录执行  node assets/js/test-engine.js
   ========================================================= */

// 由于纯前端脚本挂在 window 上，Node 环境需 mock window
global.window = global;
var fs = require("fs");
var path = require("path");

function loadScript(rel) {
  var code = fs.readFileSync(path.join(__dirname, rel), "utf-8");
  // 包装：在 global 上下文执行
  eval(code);
}

// ZipTool 是 docx-writer 依赖；在 Node 下 CompressionStream 不可用，
// 但测试只验证引擎，不生成 docx，故无需加载 docx-writer。
loadScript("sample-data.js");
loadScript("docx-parser.js");
loadScript("dupont-engine.js");
loadScript("diagnosis-engine.js");

var ok = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { ok++; console.log("  ✓ " + msg); }
  else { fail++; console.error("  ✗ " + msg); }
}

function approx(a, b, eps) { eps = eps || 1e-6; return Math.abs(a - b) < eps; }

["tech", "trade", "heavy"].forEach(function (key) {
  var sample = window.SAMPLE_DATA[key];
  console.log("\n=== 样本：" + sample.company + " ===");

  // 平衡校验
  var bc = window.DocxParser.checkBalance(sample.statements);
  assert(bc.pass, "资产负债表平衡校验通过（差额 " + (bc.details ? (bc.details.diffRatio * 100).toFixed(4) + "%" : "?") + "）");

  // 杜邦
  var dup = window.DupontEngine.analyze(sample.statements);
  assert(dup.metrics.roe != null, "ROE 已计算 = " + (dup.metrics.roe * 100).toFixed(2) + "%");
  assert(dup.driver.mode != null, "驱动归因 = " + dup.driver.tag);
  // ROE ≈ 三因素之积
  if (dup.metrics.product != null && dup.metrics.roe != null) {
    assert(approx(dup.metrics.product, dup.metrics.roe, 0.01),
      "ROE ≈ 净利率×周转×权益乘数（" + (dup.metrics.product * 100).toFixed(2) + "% vs " + (dup.metrics.roe * 100).toFixed(2) + "%）");
  }

  // 诊断
  var diag = window.DiagnosisEngine.diagnose({ statements: sample.statements, dupont: dup });
  assert(diag.ratios.length === 14, "核心比率 14 项齐全（实际 " + diag.ratios.length + "）");
  assert(["优秀", "正常", "风险"].indexOf(diag.rating.grade) >= 0, "综合评级 = " + diag.rating.grade);
  assert(diag.dimensions.length === 4, "四维度诊断齐全");
  assert(Array.isArray(diag.risks), "风险清单已生成（" + diag.risks.length + " 项）");

  // AI 洞察
  var insight = window.DiagnosisEngine.generateAIInsight({
    company: sample.company, period: sample.period,
    rating: diag.rating, ratios: diag.ratios, dupont: dup
  });
  assert(typeof insight === "string" && insight.length > 200, "AI 洞察已生成（" + insight.length + " 字）");
  assert(/总体判断|主要优势|主要风险|优先建议/.test(insight), "AI 洞察包含四大模块");

  // 期望评级核对
  var expect = { tech: "优秀", trade: "正常", heavy: "风险" }[key];
  assert(diag.rating.grade === expect, "评级符合预期场景：" + expect);

  console.log("  — 驱动：" + dup.driver.tag + " | 评级：" + diag.rating.grade +
    " | ROE：" + (dup.metrics.roe * 100).toFixed(2) + "%");
});

console.log("\n=========================");
console.log("通过 " + ok + " / 失败 " + fail);
console.log("=========================");
process.exit(fail > 0 ? 1 : 0);
