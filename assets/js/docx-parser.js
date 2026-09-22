/* =========================================================
   docx-parser.js
   本地 .docx 解析引擎
   - 基于 JSZip 解压 .docx，读取 word/document.xml
   - 抽取表格文本 → 识别报表类型与科目
   - 平衡校验 / 勾稽校验
   - 金额单位自动换算（元/万元/亿元 → 元）
   ========================================================= */

window.DocxParser = (function () {

  // 科目别名映射（覆盖常见命名差异）
  var KEY_ALIASES = {
    // 资产负债表
    "资产总计": ["资产总计", "资产合计", "总资产"],
    "流动资产合计": ["流动资产合计", "流动资产"],
    "非流动资产合计": ["非流动资产合计", "非流动资产"],
    "负债合计": ["负债合计", "总负债", "负债总计"],
    "流动负债合计": ["流动负债合计", "流动负债"],
    "非流动负债合计": ["非流动负债合计", "非流动负债"],
    "所有者权益合计": ["所有者权益合计", "股东权益合计", "净资产", "所有者权益"],
    "实收资本": ["实收资本", "股本"],
    "未分配利润": ["未分配利润"],
    "货币资金": ["货币资金"],
    "应收账款": ["应收账款"],
    "存货": ["存货"],
    "短期借款": ["短期借款"],
    "长期借款": ["长期借款"],
    "固定资产": ["固定资产"],
    "在建工程": ["在建工程"],
    "无形资产": ["无形资产"],
    // 利润表
    "营业收入": ["营业收入", "主营业务收入", "营业总收入"],
    "营业成本": ["营业成本", "主营业务成本", "营业总成本"],
    "销售费用": ["销售费用", "销售及管理费用"],
    "管理费用": ["管理费用"],
    "研发费用": ["研发费用", "研究开发费用"],
    "财务费用": ["财务费用"],
    "营业利润": ["营业利润"],
    "利润总额": ["利润总额", "税前利润"],
    "所得税费用": ["所得税费用", "所得税"],
    "净利润": ["净利润", "净收益"],
    // 现金流量表
    "经营活动产生的现金流量净额": ["经营活动产生的现金流量净额", "经营活动现金流量净额", "经营活动现金流净额", "经营活动产生的现金流量净额"],
    "投资活动产生的现金流量净额": ["投资活动产生的现金流量净额", "投资活动现金流量净额"],
    "筹资活动产生的现金流量净额": ["筹资活动产生的现金流量净额", "筹资活动现金流量净额", "融资活动产生的现金流量净额"],
  };

  // 关键科目定义（用于抽取）
  var KEY_ITEMS = Object.keys(KEY_ALIASES);

  // 报表类型识别关键词
  var SHEET_KEYWORDS = {
    balance: ["资产负债表", "资产合计", "负债合计", "所有者权益合计"],
    income: ["利润表", "营业收入", "营业成本", "利润总额", "净利润"],
    cashflow: ["现金流量表", "经营活动产生的现金流量", "投资活动产生的现金流量"]
  };

  // 金额单位识别
  function detectUnit(text) {
    if (!text) return "元";
    if (/亿元|亿/.test(text)) return "亿元";
    if (/万元|万/.test(text)) return "万元";
    if (/千元|千/.test(text)) return "千元";
    return "元";
  }

  // 单位换算系数 → 元
  var UNIT_FACTOR = {
    "元": 1,
    "千元": 1000,
    "万元": 10000,
    "亿元": 100000000
  };

  // 企业名称识别
  function detectCompany(text) {
    var m = text.match(/([一-龥A-Za-z（）()]{4,40}(?:股份有限公司|有限责任公司|有限公司|集团|公司))/);
    return m ? m[1].trim() : "";
  }

  // 报告期间识别
  function detectPeriod(text) {
    var m = text.match(/(\d{4})\s*[年度年]?\s*[-—至]\s*(\d{4})?\s*[年度年]?/) ||
            text.match(/(\d{4})\s*[年度年]/) ||
            text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
      if (m[2] && m[2].length === 4) return m[1] + "-" + m[2] + "年度";
      if (m[1]) return m[1] + "年度";
    }
    m = text.match(/(\d{4})/);
    return m ? m[1] + "年度" : "报告期";
  }

  // 解析金额字符串（处理千分位、括号负数、含单位）
  function parseAmount(str, unitFactor) {
    if (str == null) return null;
    var s = String(str).trim();
    if (!s || s === "-" || s === "—" || s === "N/A") return null;
    var negative = false;
    // 括号表示负数
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
    if (/^-/.test(s)) { negative = true; s = s.slice(1); }
    s = s.replace(/,/g, "").replace(/¥|￥|\s/g, "");
    // 提取数字（含小数）
    var m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    var num = parseFloat(m[0]);
    if (isNaN(num)) return null;
    if (negative) num = -num;
    return Math.round(num * unitFactor);
  }

  // 从 XML 中提取所有表格（行/列）
  function extractTables(xmlText) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlText, "application/xml");
    var tables = [];
    var tblNodes = doc.getElementsByTagName("w:tbl");
    for (var i = 0; i < tblNodes.length; i++) {
      var rows = [];
      var trNodes = tblNodes[i].getElementsByTagName("w:tr");
      for (var j = 0; j < trNodes.length; j++) {
        var cells = [];
        var tcNodes = trNodes[j].getElementsByTagName("w:tc");
        for (var k = 0; k < tcNodes.length; k++) {
          var txt = extractCellText(tcNodes[k]);
          cells.push(txt);
        }
        if (cells.length) rows.push(cells);
      }
      if (rows.length) tables.push(rows);
    }
    return tables;
  }

  function extractCellText(tcNode) {
    var txt = [];
    var nodes = tcNode.getElementsByTagName("w:t");
    for (var i = 0; i < nodes.length; i++) {
      txt.push(nodes[i].textContent);
    }
    return txt.join("").trim();
  }

  // 提取全文文本（用于识别企业名称、期间、单位）
  function extractAllText(xmlText) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlText, "application/xml");
    var parts = [];
    var nodes = doc.getElementsByTagName("w:t");
    for (var i = 0; i < nodes.length; i++) {
      parts.push(nodes[i].textContent);
    }
    return parts.join("");
  }

  // 识别表格所属报表类型
  function classifyTable(rows, surroundingText) {
    var text = (surroundingText || "") + " " + rows.slice(0, 6).map(function (r) { return r.join(" "); }).join(" ");
    var scores = { balance: 0, income: 0, cashflow: 0 };
    SHEET_KEYWORDS.balance.forEach(function (k) { if (text.indexOf(k) >= 0) scores.balance++; });
    SHEET_KEYWORDS.income.forEach(function (k) { if (text.indexOf(k) >= 0) scores.income++; });
    SHEET_KEYWORDS.cashflow.forEach(function (k) { if (text.indexOf(k) >= 0) scores.cashflow++; });
    var max = Math.max(scores.balance, scores.income, scores.cashflow);
    if (max === 0) return null;
    if (scores.balance === max) return "balance";
    if (scores.income === max) return "income";
    return "cashflow";
  }

  // 从一张报表表格中抽取科目 → {科目名: 金额}
  // 财务表常见格式：第一列科目名，后面列是金额（本期/上期）
  function extractItemsFromTable(rows, unitFactor) {
    var result = {};
    var amountColHint = -1;
    // 找含数字的列（优先第一列金额 = 本期）
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var c = 1; c < row.length; c++) {
        if (/[\d,]/.test(row[c]) && amountColHint < 0) { amountColHint = c; break; }
      }
      if (amountColHint >= 0) break;
    }
    if (amountColHint < 0) amountColHint = 1;

    for (var r2 = 0; r2 < rows.length; r2++) {
      var row2 = rows[r2];
      if (!row2.length) continue;
      var name = row2[0];
      if (!name || name.length < 2) continue;
      // 匹配别名
      var matchedKey = matchAlias(name);
      if (!matchedKey) continue;
      var amount = null;
      // 尝试 amountColHint，否则取第一个能解析的
      amount = parseAmount(row2[amountColHint], unitFactor);
      if (amount === null) {
        for (var c2 = 1; c2 < row2.length; c2++) {
          amount = parseAmount(row2[c2], unitFactor);
          if (amount !== null) break;
        }
      }
      if (amount !== null && result[matchedKey] === undefined) {
        result[matchedKey] = amount;
      }
    }
    return result;
  }

  function matchAlias(name) {
    var clean = name.replace(/[\s:：]/g, "");
    for (var key in KEY_ALIASES) {
      var aliases = KEY_ALIASES[key];
      for (var i = 0; i < aliases.length; i++) {
        if (clean.indexOf(aliases[i]) >= 0 || aliases[i].indexOf(clean) >= 0) {
          return key;
        }
      }
    }
    return null;
  }

  // 对外：从 .docx ArrayBuffer 解析出结构化财务数据
  function parseDocx(arrayBuffer) {
    return new Promise(function (resolve, reject) {
      if (typeof JSZip === "undefined") {
        reject(new Error("JSZip 未加载"));
        return;
      }
      JSZip.loadAsync(arrayBuffer).then(function (zip) {
        var docFile = zip.file("word/document.xml");
        if (!docFile) {
          reject(new Error("无法在 .docx 中找到 word/document.xml"));
          return;
        }
        return docFile.async("string");
      }).then(function (xmlText) {
        var allText = extractAllText(xmlText);
        var tables = extractTables(xmlText);
        var company = detectCompany(allText);
        var period = detectPeriod(allText);
        var unit = detectUnit(allText);
        var unitFactor = UNIT_FACTOR[unit] || 1;

        var classified = { balance: null, income: null, cashflow: null };
        // 多文件场景下用户已指定类型 → 外部直接合并；此处单文件分类
        tables.forEach(function (rows) {
          var type = classifyTable(rows, allText);
          if (type && !classified[type]) {
            classified[type] = extractItemsFromTable(rows, unitFactor);
          }
        });

        resolve({
          company: company,
          period: period,
          unit: unit,
          tables: tables,
          statements: classified,
          rawText: allText.slice(0, 2000)
        });
      }).catch(function (err) {
        reject(new Error("解析 .docx 失败：" + (err.message || err)));
      });
    });
  }

  // 对外：直接合并多张已分类报表（多文件场景外部已分类）
  function mergeStatements(parsedResults) {
    // parsedResults: [{company,period,unit,statements:{balance,income,cashflow}}, ...]
    var merged = { company: "", period: "", unit: "元", statements: { balance: {}, income: {}, cashflow: {} } };
    parsedResults.forEach(function (r) {
      if (!merged.company && r.company) merged.company = r.company;
      if (!merged.period && r.period) merged.period = r.period;
      if (!merged.unit || merged.unit === "元") merged.unit = r.unit;
      ["balance", "income", "cashflow"].forEach(function (t) {
        if (r.statements && r.statements[t]) {
          for (var k in r.statements[t]) {
            if (merged.statements[t][k] === undefined) merged.statements[t][k] = r.statements[t][k];
          }
        }
      });
    });
    return merged;
  }

  // 平衡校验：资产 = 负债 + 所有者权益
  function checkBalance(statements) {
    var b = statements.balance || {};
    var totalAssets = b["资产总计"];
    var totalLiab = b["负债合计"];
    var totalEquity = b["所有者权益合计"];
    if (totalAssets == null || totalLiab == null || totalEquity == null) {
      return {
        pass: false,
        level: "incomplete",
        message: "缺少资产总计/负债合计/所有者权益合计，无法完成平衡校验",
        details: {}
      };
    }
    var liabEquity = totalLiab + totalEquity;
    var diff = totalAssets - liabEquity;
    var diffRatio = Math.abs(diff) / (Math.abs(totalAssets) || 1);
    var pass = diffRatio <= 0.005; // 0.5% 阈值
    return {
      pass: pass,
      level: pass ? "ok" : "block",
      message: pass
        ? "资产负债表平衡校验通过：资产总计 = 负债合计 + 所有者权益合计"
        : "资产负债表不平衡，差额超过 0.5%，已阻断分析",
      details: {
        totalAssets: totalAssets,
        totalLiab: totalLiab,
        totalEquity: totalEquity,
        liabEquity: liabEquity,
        diff: diff,
        diffRatio: diffRatio
      }
    };
  }

  // 勾稽校验：净利润 vs 未分配利润变动（近似）/ 现金流 vs 利润（质量校验）
  function checkReconciliation(statements) {
    var notes = [];
    var inc = statements.income || {};
    var cf = statements.cashflow || {};
    var b = statements.balance || {};

    var netProfit = inc["净利润"];
    var ocf = cf["经营活动产生的现金流量净额"];
    // 现金流质量：经营现金流 / 净利润
    if (netProfit != null && ocf != null && netProfit > 0) {
      var ratio = ocf / netProfit;
      if (ratio < 0.3) {
        notes.push({
          level: "warn",
          key: "cash_quality",
          message: "经营现金流/净利润 = " + (ratio * 100).toFixed(1) + "%，低于 30%，利润现金支撑偏弱",
          ratio: ratio
        });
      } else {
        notes.push({
          level: "ok",
          key: "cash_quality",
          message: "经营现金流/净利润 = " + (ratio * 100).toFixed(1) + "%，利润现金支撑良好",
          ratio: ratio
        });
      }
    }
    // 亏损企业仍要提示
    if (netProfit != null && netProfit < 0 && ocf != null && ocf < 0) {
      notes.push({
        level: "block",
        key: "loss_neg_cash",
        message: "净利润与经营现金流均为负，企业造血能力受损，需重点关注",
      });
    }
    return notes;
  }

  return {
    parseDocx: parseDocx,
    mergeStatements: mergeStatements,
    checkBalance: checkBalance,
    checkReconciliation: checkReconciliation,
    detectCompany: detectCompany,
    detectPeriod: detectPeriod,
    detectUnit: detectUnit,
    extractItemsFromTable: extractItemsFromTable,
    classifyTable: classifyTable,
    UNIT_FACTOR: UNIT_FACTOR
  };

})();
