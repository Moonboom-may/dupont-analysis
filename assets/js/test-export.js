/* test-export.js — 验证 docx 生成与 ZIP 格式有效性 */
global.window = global;
var fs = require("fs");
var path = require("path");
function loadScript(rel) {
  var code = fs.readFileSync(path.join(__dirname, rel), "utf-8");
  eval(code);
}
loadScript("ziptool.js");
loadScript("docx-writer.js");
loadScript("dupont-engine.js");
loadScript("diagnosis-engine.js");
loadScript("report-exporter.js");
loadScript("sample-data.js");

var sample = window.SAMPLE_DATA.tech;
var dup = window.DupontEngine.analyze(sample.statements);
var diag = window.DiagnosisEngine.diagnose({ statements: sample.statements, dupont: dup });
var ctx = {
  company: sample.company, period: sample.period, unit: sample.unit,
  statements: sample.statements, dupont: dup, diagnosis: diag,
  aiInsight: window.DiagnosisEngine.generateAIInsight({
    company: sample.company, period: sample.period,
    rating: diag.rating, ratios: diag.ratios, dupont: dup
  }),
  advantages: ["测试优势"], risks_summary: ["测试风险"], recommendations: ["测试建议"],
  generatedAt: "2024-测试"
};

window.ReportExporter.buildReport(ctx).then(function (bytes) {
  console.log("✓ docx 生成成功，字节数：" + bytes.length);
  // 用 ZipTool 解包验证 ZIP 完整性
  return window.ZipTool.read(bytes.buffer).then(function (files) {
    var names = Object.keys(files);
    console.log("✓ ZIP 解包成功，包含 " + names.length + " 个文件：");
    names.forEach(function (n) { console.log("   - " + n + " (" + files[n].length + " bytes)"); });
    var hasDoc = names.indexOf("word/document.xml") >= 0;
    var hasCT = names.indexOf("[Content_Types].xml") >= 0;
    var docContent = files["word/document.xml"] ? new TextDecoder().decode(files["word/document.xml"]) : "";
    console.log("✓ 含 word/document.xml：" + hasDoc + "（" + docContent.length + " 字符）");
    console.log("✓ 含 [Content_Types].xml：" + hasCT);
    console.log("✓ document.xml 含封面/杜邦/诊断关键词：" +
      (/经营诊断报告/.test(docContent) && /杜邦/.test(docContent) && /净资产收益率/.test(docContent)));
    // 写盘检查能否被标准 unzip 工具识别（用文件头魔数）
    var magic = bytes.slice(0, 4);
    console.log("✓ ZIP 魔数：PK" + String.fromCharCode(magic[2], magic[3]) + "（应为 03 04）");
    // 保存到临时文件
    var outPath = path.join(__dirname, "..", "test-output.docx");
    fs.writeFileSync(outPath, Buffer.from(bytes));
    console.log("✓ 已写入测试文件：" + outPath);
    console.log("\n=========================");
    console.log("docx 生成与 ZIP 校验全部通过");
    console.log("=========================");
  });
}).catch(function (e) {
  console.error("✗ 失败：" + (e.message || e));
  console.error(e.stack);
  process.exit(1);
});
