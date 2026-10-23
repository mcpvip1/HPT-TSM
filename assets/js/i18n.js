const TRANSLATIONS = {
    en: {
        uploadBtn: "Upload Data", printBtn: "Print", exportPngBtn: "Export PNG", exportPdfBtn: "Export PDF",
        biCycleLabel: "BI Incubation Period:", metaLotNumber: "Lot Number:",
        brandTagline: "Temperature Monitoring & Reporting System",
        acceptanceCriteriaText: "BI Incubation Acceptance Criteria:",
        minTempRun: "Min. temp. this run:", maxTempRun: "Max. temp. this run:",
        lotNumberHeader: "Date Time & Lot number", lotIdentifier: "Identifier / Lot",
        lotPlaceholder: "Enter Lot Number",
        startDateTimeLabel: "Start Date & Time", endDateTimeLabel: "End Date & Time",
        resetRangeBtn: "Full Result", last24hBtn: "Last 24H",
        tempSettingsHeader: "Min/Max Temperature Setting",
        maxThresholdLabel: "Max Threshold (°C)", minThresholdLabel: "Min Threshold (°C)",
        durationLabel: "Total Duration",
        language: "Language",
        chartModeLabel: "Graph Style:", modeColor: "Color", modeMono: "B&W",
        outlierToggle: "Highlight Outliers",
        fallbackPdfName: "Sterilization Temperature Result",
        noDataToPrint: "No data to print", noDataToExport: "No data to export",
        generatingPng: "Generating PNG…", generatingPdf: "Generating PDF…",
        pngExported: "PNG exported", pdfExported: "PDF exported",
        pngFailed: "PNG export failed: ", pdfFailed: "PDF export failed: ",
        loading: "Reading...", parseFailed: "Parse failed",
        noValidData: "No valid data found.", parseError: "Parse error: ",
        readError: "Read error", loadedRows: "Loaded {n} rows"
    },
    zh: {
        uploadBtn: "上传数据", printBtn: "打印", exportPngBtn: "导出PNG", exportPdfBtn: "导出PDF",
        biCycleLabel: "BI培养周期 :", metaLotNumber: "批次号 Lot Number:",
        brandTagline: "温度监测与报告系统",
        acceptanceCriteriaText: "BI 培养接收标准:",
        minTempRun: "本次最低温度:", maxTempRun: "最高温度:",
        lotNumberHeader: "日期时间与批次号", lotIdentifier: "批次标识符",
        lotPlaceholder: "请输入批次号",
        startDateTimeLabel: "开始日期与时间", endDateTimeLabel: "结束日期与时间",
        resetRangeBtn: "完整结果", last24hBtn: "最近24小时",
        tempSettingsHeader: "最高/最低温度设置",
        maxThresholdLabel: "上限阈值 (°C)", minThresholdLabel: "下限阈值 (°C)",
        durationLabel: "总时长",
        language: "语言",
        chartModeLabel: "图表样式:", modeColor: "彩色", modeMono: "黑白",
        outlierToggle: "高亮偏离点",
        fallbackPdfName: "灭菌温度结果",
        noDataToPrint: "没有可打印的数据", noDataToExport: "没有可导出的数据",
        generatingPng: "正在生成 PNG…", generatingPdf: "正在生成 PDF…",
        pngExported: "PNG 已导出", pdfExported: "PDF 已导出",
        pngFailed: "PNG 导出失败: ", pdfFailed: "PDF 导出失败: ",
        loading: "读取中...", parseFailed: "解析失败",
        noValidData: "未找到有效数据。", parseError: "解析错误: ",
        readError: "读取错误", loadedRows: "已加载 {n} 行数据"
    },
    th: {
        uploadBtn: "อัปโหลดข้อมูล", printBtn: "พิมพ์", exportPngBtn: "ส่งออก PNG", exportPdfBtn: "ส่งออก PDF",
        biCycleLabel: "ระยะเวลาบ่ม BI :", metaLotNumber: "หมายเลขล็อต Lot Number:",
        brandTagline: "ระบบตรวจสอบและรายงานอุณหภูมิ",
        acceptanceCriteriaText: "เกณฑ์การยอมรับการบ่ม BI :",
        minTempRun: "อุณหภูมิต่ำสุดในการรันนี้ :", maxTempRun: "อุณหภูมิสูงสุดในการรันนี้ :",
        lotNumberHeader: "วันที่ เวลา และหมายเลขล็อต", lotIdentifier: "ตัวระบุ / ล็อต",
        lotPlaceholder: "ป้อนหมายเลขล็อต",
        startDateTimeLabel: "วันเวลาเริ่มต้น", endDateTimeLabel: "วันเวลาสิ้นสุด",
        resetRangeBtn: "ผลลัพธ์ทั้งหมด", last24hBtn: "24 ชม. ล่าสุด",
        tempSettingsHeader: "ตั้งค่าอุณหภูมิสูงสุด / ต่ำสุด",
        maxThresholdLabel: "ขีดจำกัดสูงสุด (°C)", minThresholdLabel: "ขีดจำกัดต่ำสุด (°C)",
        durationLabel: "ระยะเวลารวม",
        language: "ภาษา",
        chartModeLabel: "สไตล์กราฟ:", modeColor: "สี", modeMono: "ขาวดำ",
        outlierToggle: "ไฮไลต์จุดผิดปกติ",
        fallbackPdfName: "ผลลัพธ์อุณหภูมิการฆ่าเชื้อ",
        noDataToPrint: "ไม่มีข้อมูลที่จะพิมพ์", noDataToExport: "ไม่มีข้อมูลที่จะส่งออก",
        generatingPng: "กำลังสร้าง PNG…", generatingPdf: "กำลังสร้าง PDF…",
        pngExported: "ส่งออก PNG แล้ว", pdfExported: "ส่งออก PDF แล้ว",
        pngFailed: "การส่งออก PNG ล้มเหลว: ", pdfFailed: "การส่งออก PDF ล้มเหลว: ",
        loading: "กำลังอ่าน...", parseFailed: "การแยกวิเคราะห์ล้มเหลว",
        noValidData: "ไม่พบข้อมูลที่ถูกต้อง", parseError: "ข้อผิดพลาดในการแยกวิเคราะห์: ",
        readError: "ข้อผิดพลาดในการอ่าน", loadedRows: "โหลดแล้ว {n} แถว"
    },
    my: {
        uploadBtn: "ဒေတာတင်ရန်", printBtn: "ပရင့်", exportPngBtn: "PNG ထုတ်ယူရန်", exportPdfBtn: "PDF ထုတ်ယူရန်",
        biCycleLabel: "BI မွေးမြူကာလ :", metaLotNumber: "အစုအဝေးနံပါတ် Lot Number:",
        brandTagline: "အပူချိန် စောင့်ကြည့်စစ်ဆေးခြင်း နှင့် အစီရင်ခံစာ စနစ်",
        acceptanceCriteriaText: "BI မွေးမြူမှု လက်ခံစံနှုန်း :",
        minTempRun: "ဤအကြိမ် အနိမ့်ဆုံးအပူချိန် :", maxTempRun: "ဤအကြိမ် အမြင့်ဆုံးအပူချိန် :",
        lotNumberHeader: "ရက်စွဲ အချိန် နှင့် အစုအဝေးနံပါတ်", lotIdentifier: "သတ်မှတ်အမှတ် / အစုအဝေး",
        lotPlaceholder: "အစုအဝေးနံပါတ် ထည့်ပါ",
        startDateTimeLabel: "စတင်ရက် နှင့် အချိန်", endDateTimeLabel: "အဆုံးသတ်ရက် နှင့် အချိန်",
        resetRangeBtn: "ရလဒ်အပြည့်အစုံ", last24hBtn: "နောက်ဆုံး 24 နာရီ",
        tempSettingsHeader: "အမြင့်ဆုံး / အနိမ့်ဆုံး အပူချိန် သတ်မှတ်ရန်",
        maxThresholdLabel: "အမြင့်ဆုံးကန့်သတ်ချက် (°C)", minThresholdLabel: "အနိမ့်ဆုံးကန့်သတ်ချက် (°C)",
        durationLabel: "စုစုပေါင်းကြာချိန်",
        language: "ဘာသာစကား",
        chartModeLabel: "ဂရပ်ဖ်ပုံစံ:", modeColor: "အရောင်", modeMono: "အဖြူအမဲ",
        outlierToggle: "သတ်မှတ်ချက်လွန် အမှတ်များ",
        fallbackPdfName: "မြုံခွဲခြားမှုအပူချိန်ရလဒ်",
        noDataToPrint: "ပရင့်ထုတ်ရန် ဒေတာမရှိပါ", noDataToExport: "ထုတ်ယူရန် ဒေတာမရှိပါ",
        generatingPng: "PNG ဖန်တီးနေသည်…", generatingPdf: "PDF ဖန်တီးနေသည်…",
        pngExported: "PNG ထုတ်ယူပြီးပါပြီ", pdfExported: "PDF ထုတ်ယူပြီးပါပြီ",
        pngFailed: "PNG ထုတ်ယူမှု မအောင်မြင်ပါ: ", pdfFailed: "PDF ထုတ်ယူမှု မအောင်မြင်ပါ: ",
        loading: "ဖတ်နေသည်...", parseFailed: "ခွဲခြမ်းစိတ်ဖြာမှု မအောင်မြင်ပါ",
        noValidData: "မှန်ကန်သော ဒေတာ မတွေ့ပါ။", parseError: "ခွဲခြမ်းစိတ်ဖြာမှု အမှား: ",
        readError: "ဖတ်ရှုမှု အမှား", loadedRows: "အတန်း {n} ခု တင်ပြီးပါပြီ"
    }
};

const I18n = {
    dict(lang = state.language) { return TRANSLATIONS[lang] || TRANSLATIONS.en; },
    t(key, lang = state.language, vars = null) {
        let str = this.dict(lang)[key] || key;
        if (vars) {
            Object.keys(vars).forEach(k => {
                str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
            });
        }
        return str;
    },
    apply(lang) {
        state.language = lang;
        const dict = this.dict(lang);
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) el.textContent = dict[key];
        });
        const lotInput = document.getElementById('lotNumberInput');
        if (lotInput && dict.lotPlaceholder) lotInput.placeholder = dict.lotPlaceholder;
        document.documentElement.lang = lang;
    }
};