/* =========================================================
   ziptool.js
   零依赖迷你 ZIP 工具（基于浏览器原生 CompressionStream / DecompressionStream）
   - read(arrayBuffer)  解析 .docx 等 ZIP，返回 {path: Uint8Array}
   - write(files)        构造 ZIP（含 CRC32 / local header / central dir）
   完全本地、无第三方库、无网络请求
   ========================================================= */

window.ZipTool = (function () {

  // ---- CRC32 ----
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---- 字节拼接 ----
  function concat(chunks) {
    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < chunks.length; j++) { out.set(chunks[j], off); off += chunks[j].length; }
    return out;
  }

  // ---- 原始 deflate 压缩（无 zlib 头，ZIP method 8 需要的格式）----
  function deflateRaw(bytes) {
    return new Promise(function (resolve, reject) {
      if (typeof CompressionStream === "undefined") {
        reject(new Error("当前浏览器不支持 CompressionStream，建议使用 Chrome/Edge 80+ 或 Firefox 113+"));
        return;
      }
      var cs = new CompressionStream("deflate-raw");
      var writer = cs.writable.getWriter();
      writer.write(bytes);
      writer.close();
      var reader = cs.readable.getReader();
      var chunks = [];
      (function pump() {
        reader.read().then(function (res) {
          if (res.done) { resolve(concat(chunks)); return; }
          chunks.push(new Uint8Array(res.value));
          pump();
        }).catch(reject);
      })();
    });
  }

  // ---- 原始 deflate 解压 ----
  function inflateRaw(bytes) {
    return new Promise(function (resolve, reject) {
      if (typeof DecompressionStream === "undefined") {
        reject(new Error("当前浏览器不支持 DecompressionStream，建议使用 Chrome/Edge 80+ 或 Firefox 113+"));
        return;
      }
      var ds = new DecompressionStream("deflate-raw");
      var writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      var reader = ds.readable.getReader();
      var chunks = [];
      (function pump() {
        reader.read().then(function (res) {
          if (res.done) { resolve(concat(chunks)); return; }
          chunks.push(new Uint8Array(res.value));
          pump();
        }).catch(reject);
      })();
    });
  }

  // ---- UTF-8 编码 ----
  function strToBytes(str) {
    return new TextEncoder().encode(str);
  }
  function bytesToStr(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  // ---- 读取 ZIP ----
  // 返回 Promise<{ path: Uint8Array }>
  function read(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    var view = new DataView(arrayBuffer);
    var files = {};
    var off = 0;

    // 扫描 local file header 签名 0x04034b50
    function findSig(start, sig) {
      for (var i = start; i < bytes.length - 4; i++) {
        if (view.getUint32(i, true) === sig) return i;
      }
      return -1;
    }

    function parseNext(off) {
      return new Promise(function (resolve, reject) {
        var p = findSig(off, 0x04034b50);
        if (p < 0) { resolve(null); return; }
        var compression = view.getUint16(p + 8, true);
        var compSize = view.getUint32(p + 18, true);
        var uncompSize = view.getUint32(p + 22, true);
        var nameLen = view.getUint16(p + 26, true);
        var extraLen = view.getUint16(p + 28, true);
        var nameStart = p + 30;
        var name = bytesToStr(bytes.subarray(nameStart, nameStart + nameLen));
        var dataStart = nameStart + nameLen + extraLen;
        var dataEnd = dataStart + compSize;
        var rawData = bytes.subarray(dataStart, dataEnd);

        if (compression === 0) {
          // stored
          files[name] = new Uint8Array(rawData);
          resolve(dataEnd);
        } else if (compression === 8) {
          // deflate
          inflateRaw(new Uint8Array(rawData)).then(function (inflated) {
            files[name] = inflated;
            resolve(dataEnd);
          }).catch(reject);
        } else {
          reject(new Error("不支持的压缩方法: " + compression));
        }
      });
    }

    return new Promise(function (resolve, reject) {
      (function loop(off) {
        parseNext(off).then(function (nextOff) {
          if (nextOff === null) { resolve(files); return; }
          loop(nextOff);
        }).catch(reject);
      })(off);
    });
  }

  // ---- 写入 ZIP ----
  // files: { path: Uint8Array | string }
  // 返回 Promise<Uint8Array>
  function write(files) {
    var entries = [];
    var localChunks = [];
    var centralChunks = [];
    var offset = 0;

    var names = Object.keys(files);
    var idx = 0;

    function processNext() {
      if (idx >= names.length) {
        // 写 central directory end record
        var cdBytes = concat(centralChunks);
        var eocd = new Uint8Array(22);
        var edv = new DataView(eocd.buffer);
        edv.setUint32(0, 0x06054b50, true);  // EOCD sig
        edv.setUint16(4, 0, true);            // disk num
        edv.setUint16(6, 0, true);            // disk with CD
        edv.setUint16(8, names.length, true);
        edv.setUint16(10, names.length, true);
        edv.setUint32(12, cdBytes.length, true);
        edv.setUint32(16, offset, true);      // CD offset
        edv.setUint16(20, 0, true);           // comment len
        var all = concat([concat(localChunks), cdBytes, eocd]);
        return Promise.resolve(all);
      }
      var name = names[idx];
      idx++;
      var raw = files[name];
      if (typeof raw === "string") raw = strToBytes(raw);
      var nameBytes = strToBytes(name);
      var crc = crc32(raw);

      return deflateRaw(raw).then(function (compressed) {
        // 若压缩无收益，使用 stored
        var useStore = (compressed.length >= raw.length);
        var compData = useStore ? raw : compressed;
        var method = useStore ? 0 : 8;
        var compSize = compData.length;

        // local file header (30 bytes + name)
        var lfh = new Uint8Array(30 + nameBytes.length);
        var lv = new DataView(lfh.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);   // version needed
        lv.setUint16(6, 0, true);    // flags
        lv.setUint16(8, method, true);
        lv.setUint16(10, 0, true);   // mod time
        lv.setUint16(12, 0x0021, true); // mod date (1980-01-01 approx)
        lv.setUint32(14, crc, true);
        lv.setUint32(18, compSize, true);
        lv.setUint32(22, raw.length, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);   // extra len
        lfh.set(nameBytes, 30);

        localChunks.push(lfh);
        localChunks.push(compData);

        var localOff = offset;
        offset += lfh.length + compSize;

        // central directory header (46 bytes + name)
        var cdh = new Uint8Array(46 + nameBytes.length);
        var cv = new DataView(cdh.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);    // version made by
        cv.setUint16(6, 20, true);    // version needed
        cv.setUint16(8, 0, true);     // flags
        cv.setUint16(10, method, true);
        cv.setUint16(12, 0, true);    // mod time
        cv.setUint16(14, 0x0021, true); // mod date
        cv.setUint32(16, crc, true);
        cv.setUint32(20, compSize, true);
        cv.setUint32(24, raw.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);   // extra
        cv.setUint16(32, 0, true);   // comment
        cv.setUint16(34, 0, true);   // disk start
        cv.setUint16(36, 0, true);   // internal attrs
        cv.setUint32(38, 0, true);   // external attrs
        cv.setUint32(42, localOff, true);
        cdh.set(nameBytes, 46);
        centralChunks.push(cdh);

        return processNext();
      });
    }

    return processNext();
  }

  return {
    read: read,
    write: write,
    crc32: crc32,
    deflateRaw: deflateRaw,
    inflateRaw: inflateRaw,
    strToBytes: strToBytes,
    bytesToStr: bytesToStr
  };

})();
