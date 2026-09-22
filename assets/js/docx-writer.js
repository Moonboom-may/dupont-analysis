/* =========================================================
   docx-writer.js
   零依赖 .docx 写入器（手写 OOXML）
   - 提供 Builder API：doc.title/heading/para/table/pageBreak/list
   - build() 返回 Uint8Array（即 .docx 二进制）
   - 内部依赖 ZipTool.write() 打包
   字符全部转义，数值按 UTF-8 写入
   ========================================================= */

window.DocxWriter = (function () {

  function escapeXml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function nl2br(s) {
    return escapeXml(s).replace(/\n/g, '</w:t><w:br/><w:t>');
  }

  // run 文本块
  function run(text, opts) {
    opts = opts || {};
    var rpr = "";
    if (opts.bold || opts.size || opts.color || opts.font) {
      rpr += "<w:rPr>";
      if (opts.bold) rpr += '<w:b/><w:bCs/>';
      if (opts.italic) rpr += '<w:i/><w:iCs/>';
      if (opts.color) rpr += '<w:color w:val="' + opts.color + '"/>';
      if (opts.size) rpr += '<w:sz w:val="' + opts.size + '"/><w:szCs w:val="' + opts.size + '"/>';
      if (opts.font) rpr += '<w:rFonts w:ascii="' + opts.font + '" w:hAnsi="' + opts.font + '" w:eastAsia="' + opts.font + '"/>';
      rpr += "</w:rPr>";
    }
    // 保留空格
    var xml = rpr + '<w:t xml:space="preserve">' + nl2br(text) + '</w:t>';
    return '<w:r>' + xml + '</w:r>';
  }

  // 段落
  function paragraph(content, opts) {
    opts = opts || {};
    var ppr = "<w:pPr>";
    if (opts.align) ppr += '<w:jc w:val="' + opts.align + '"/>';
    if (opts.spacing) ppr += '<w:spacing ' + opts.spacing + '/>';
    if (opts.indent) ppr += '<w:ind ' + opts.indent + '/>';
    if (opts.heading) ppr += '<w:pStyle w:val="' + opts.heading + '"/>';
    if (opts.shading) ppr += '<w:shd w:val="clear" w:color="auto" w:fill="' + opts.shading + '"/>';
    if (opts.borders) ppr += '<w:pBdr>' + opts.borders + '</w:pBdr>';
    ppr += "</w:pPr>";
    return '<w:p>' + ppr + (content || "") + '</w:p>';
  }

  // 标题样式
  var HEADING = {
    title: { size: 44, bold: true, color: "1A3A8A" },
    h1: { size: 32, bold: true, color: "1A3A8A" },
    h2: { size: 28, bold: true, color: "1F5FFF" },
    h3: { size: 24, bold: true, color: "1F2A44" },
    body: { size: 21, font: "微软雅黑" },
    small: { size: 18, color: "5B6678" }
  };

  // 表格单元格
  function cell(text, opts) {
    opts = opts || {};
    var w = opts.width || 2000;
    var shd = opts.shading ? '<w:shd w:val="clear" w:color="auto" w:fill="' + opts.shading + '"/>' : "";
    var borders = "";
    var vmerge = opts.vmerge ? '<w:vMerge ' + (opts.vmerge === "restart" ? 'w:val="restart"' : "") + '/>' : "";
    var cellRun = run(text, { size: opts.size || 20, bold: opts.bold, color: opts.color, font: "微软雅黑" });
    return '<w:tc>' +
      '<w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + shd + borders + vmerge + '</w:tcPr>' +
      paragraph(cellRun, { align: opts.align || "left", spacing: 'w:line="320" w:lineRule="auto"' }) +
      '</w:tc>';
  }

  // 表格行
  function row(cells, opts) {
    opts = opts || {};
    var trPr = opts.header ? '<w:trPr><w:tblHeader/></w:trPr>' : "";
    return '<w:tr>' + trPr + cells.join("") + '</w:tr>';
  }

  // 表格
  function table(rows, opts) {
    opts = opts || {};
    var width = opts.width || 9000;
    var borders = '<w:tblBorders>' +
      '<w:top w:val="single" w:sz="4" w:color="B8C2D4"/>' +
      '<w:left w:val="single" w:sz="4" w:color="B8C2D4"/>' +
      '<w:bottom w:val="single" w:sz="4" w:color="B8C2D4"/>' +
      '<w:right w:val="single" w:sz="4" w:color="B8C2D4"/>' +
      '<w:insideH w:val="single" w:sz="4" w:color="DDE3ED"/>' +
      '<w:insideV w:val="single" w:sz="4" w:color="DDE3ED"/>' +
      '</w:tblBorders>';
    var tblPr = '<w:tblPr>' +
      '<w:tblW w:w="' + width + '" w:type="dxa"/>' +
      '<w:jc w:val="center"/>' + borders +
      '<w:tblLayout w:type="fixed"/>' +
      '</w:tblPr>';
    return '<w:tbl>' + tblPr + rows.join("") + '</w:tbl>';
  }

  // 分页符
  function pageBreak() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  // 空段
  function spacer() {
    return '<w:p/>';
  }

  // 项目符号段落
  function bullet(text, level) {
    level = level || 0;
    return paragraph(run(text, { size: 21, font: "微软雅黑" }), {
      indent: 'w:left="' + (480 + level * 360) + '" w:hanging="240"',
      spacing: 'w:line="320" w:lineRule="auto" w:before="60"'
    });
  }

  // ============ Builder ============
  function Builder() {
    this.parts = [];
  }
  Builder.prototype.cover = function (title, meta, grade) {
    var gradeColor = grade === "优秀" ? "1AA56F" : (grade === "正常" ? "D98A00" : "E0413D");
    this.parts.push(spacer());
    this.parts.push(spacer());
    this.parts.push(paragraph(run("经营诊断报告", { size: 28, color: "8A93A4", font: "微软雅黑" }), { align: "center", spacing: 'w:before="600"' }));
    this.parts.push(paragraph(run(title, { size: 52, bold: true, color: "1A3A8A", font: "微软雅黑" }), { align: "center", spacing: 'w:before="200" w:after="300"' }));
    if (meta) {
      this.parts.push(paragraph(run(meta, { size: 22, color: "5B6678", font: "微软雅黑" }), { align: "center", spacing: 'w:after="600"' }));
    }
    if (grade) {
      this.parts.push(paragraph(run("综合经营评级：" + grade, { size: 36, bold: true, color: gradeColor, font: "微软雅黑" }), { align: "center", spacing: 'w:before="400" w:after="200"'}));
    }
    this.parts.push(pageBreak());
    return this;
  };
  Builder.prototype.heading = function (text, level) {
    level = level || 2;
    var h = HEADING["h" + level] || HEADING.h2;
    this.parts.push(paragraph(run(text, { bold: true, size: h.size, color: h.color, font: "微软雅黑" }), { spacing: 'w:before="360" w:after="160" w:line="360" w:lineRule="auto"' }));
    return this;
  };
  Builder.prototype.para = function (text, opts) {
    opts = opts || {};
    this.parts.push(paragraph(run(text, { size: opts.size || 21, bold: opts.bold, color: opts.color, font: "微软雅黑" }), {
      spacing: 'w:line="360" w:lineRule="auto" w:after="80"',
      align: opts.align,
      indent: opts.indent
    }));
    return this;
  };
  Builder.prototype.bullet = function (text) {
    this.parts.push(bullet(text));
    return this;
  };
  Builder.prototype.table = function (rows, opts) {
    this.parts.push(table(rows, opts));
    this.parts.push(spacer());
    return this;
  };
  Builder.prototype.pageBreak = function () {
    this.parts.push(pageBreak());
    return this;
  };
  Builder.prototype.raw = function (xml) {
    this.parts.push(xml);
    return this;
  };
  Builder.prototype.build = function () {
    return buildDocx(this.parts.join(""));
  };

  // ============ 构建 .docx ============
  function buildDocx(bodyXml) {
    var CONTENT_TYPES =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/_rels/document.xml.rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Override PartName="/_rels/.rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '</Types>';

    var ROOT_RELS =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';

    var DOC_RELS =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    var DOCUMENT =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:body>' + bodyXml +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
      '<w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>' +
      '</w:body></w:document>';

    var STYLES =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults>' +
      '<w:rPrDefault><w:rPr><w:rFonts w:ascii="微软雅黑" w:hAnsi="微软雅黑" w:eastAsia="微软雅黑"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
      '</w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>' +
      '</w:styles>';

    var files = {
      "[Content_Types].xml": CONTENT_TYPES,
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": DOCUMENT,
      "word/_rels/document.xml.rels": DOC_RELS,
      "word/styles.xml": STYLES
    };

    return ZipTool.write(files);
  }

  return {
    Builder: Builder,
    cell: cell,
    row: row,
    table: table,
    run: run,
    paragraph: paragraph,
    pageBreak: pageBreak,
    spacer: spacer,
    escapeXml: escapeXml
  };

})();
