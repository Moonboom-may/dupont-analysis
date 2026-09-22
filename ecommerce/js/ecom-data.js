/* =========================================================
   ecom-data.js
   电商样本数据（三类典型店铺）+ 模板生成器
   数据结构：店铺核心经营指标 + 明细
   口径：日均/月度，金额单位元
   ========================================================= */

window.ECOM_DATA = {
  // 高利润 + 增长型（健康）
  growth: {
    shop: "某相机旗舰店（佳能自营）",
    period: "2025年8月",
    tag: "增长健康型",
    summary: "高毛利相机品类，付费流量增长带动 GMV 提升利润同步扩张，整体经营健康。",
    metrics: {
      gmv: 3200000,            // 月 GMV
      prevGmv: 2600000,        // 上月 GMV
      traffic: 52000,          // 访客数
      prevTraffic: 45000,
      paidTraffic: 22000,      // 付费访客
      prevPaidTraffic: 15000,
      freeTraffic: 30000,      // 免费访客
      prevFreeTraffic: 30000,
      orders: 1560,            // 成交订单数
      prevOrders: 1300,
      avgPrice: 2051,          // 客单价
      prevAvgPrice: 2000,
      conversionRate: 0.03,    // 转化率
      prevConversionRate: 0.0289,
      grossMargin: 0.18,       // 毛利率
      prevGrossMargin: 0.17,
      refundRate: 0.03,        // 退款率
      cost: 2624000,           // 总成本（含商品成本+营销+物流+人工）
      prevCost: 2158000,
      adSpend: 280000,         // 广告投放
      prevAdSpend: 180000,
      inventoryTurnover: 5.2,  // 库存周转（月）
      prevInventoryTurnover: 4.8,
      stockoutRate: 0.04,      // 缺货率
      inventoryDays: 6,        // 库存天数
    }
  },

  // 流量上来但转化崩 + 亏损（典型预警）
  traffic_drop: {
    shop: "某数码配件店（内存卡/补光灯）",
    period: "2025年8月",
    tag: "转化崩塌·亏损预警",
    summary: "付费流量激增但转化率断崖下跌，广告投入产出比恶化，已进入亏损，需立即止损。",
    metrics: {
      gmv: 1800000,
      prevGmv: 2200000,
      traffic: 90000,
      prevTraffic: 70000,
      paidTraffic: 60000,
      prevPaidTraffic: 30000,
      freeTraffic: 30000,
      prevFreeTraffic: 40000,
      orders: 900,
      prevOrders: 1320,
      avgPrice: 2000,
      prevAvgPrice: 1667,
      conversionRate: 0.01,
      prevConversionRate: 0.0189,
      grossMargin: 0.12,
      prevGrossMargin: 0.16,
      refundRate: 0.08,
      cost: 1900000,
      prevCost: 1750000,
      adSpend: 450000,
      prevAdSpend: 150000,
      inventoryTurnover: 2.1,
      prevInventoryTurnover: 3.5,
      stockoutRate: 0.02,
      inventoryDays: 14,
    }
  },

  // GMV 平 + 利润下滑（利润挤压型）
  margin_squeeze: {
    shop: "某镜头组套店",
    period: "2025年8月",
    tag: "利润挤压型",
    summary: "GMV 持平但毛利率下滑、客单价下降，陷入价格战，营收健康但利润被侵蚀。",
    metrics: {
      gmv: 2500000,
      prevGmv: 2520000,
      traffic: 50000,
      prevTraffic: 50000,
      paidTraffic: 20000,
      prevPaidTraffic: 20000,
      freeTraffic: 30000,
      prevFreeTraffic: 30000,
      orders: 1380,
      prevOrders: 1280,
      avgPrice: 1812,
      prevAvgPrice: 1969,
      conversionRate: 0.0276,
      prevConversionRate: 0.0256,
      grossMargin: 0.10,
      prevGrossMargin: 0.15,
      refundRate: 0.05,
      cost: 2300000,
      prevCost: 2142000,
      adSpend: 200000,
      prevAdSpend: 200000,
      inventoryTurnover: 3.8,
      prevInventoryTurnover: 4.2,
      stockoutRate: 0.03,
      inventoryDays: 9,
    }
  }
};

// 空白模板（供手动输入）
window.ECOM_BLANK_TEMPLATE = {
  shop: "我的店铺",
  period: "本月",
  tag: "自定义",
  summary: "",
  metrics: {
    gmv: null, prevGmv: null,
    traffic: null, prevTraffic: null,
    paidTraffic: null, prevPaidTraffic: null,
    freeTraffic: null, prevFreeTraffic: null,
    orders: null, prevOrders: null,
    avgPrice: null, prevAvgPrice: null,
    conversionRate: null, prevConversionRate: null,
    grossMargin: null, prevGrossMargin: null,
    refundRate: null,
    cost: null, prevCost: null,
    adSpend: null, prevAdSpend: null,
    inventoryTurnover: null, prevInventoryTurnover: null,
    stockoutRate: null, inventoryDays: null,
  }
};
