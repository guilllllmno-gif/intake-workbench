import type { CheckType, ExternalText } from "./types";
export const CHECK_LABELS: Record<CheckType, string> = {
  SCREENING_WATCHLIST: "名单筛查",
  SCREENING_MEDIA: "负面新闻",
  DATA_MATCH: "信息核对",
  IDENTITY_MEDIA: "证件与人脸",
  ASSOCIATED_PERSONS: "关联人核对",
  CLASSIFICATION: "类目核对",
  WEBSITE: "网站核查",
  SCHEME_LIST: "卡组织名单",
  OWNERSHIP: "股权穿透",
  LINKED_ENTITY: "关联匹配",
  MANUAL_VERIFY: "人工核验",
};
type Option = { value: string; label: string; reasons: string[] };
const o = (value: string, label: string, reasons: string[]): Option => ({
  value,
  label,
  reasons,
});
export const CHECK_OPTIONS: Record<CheckType, Option[]> = {
  SCREENING_WATCHLIST: [
    o("FALSE_POSITIVE", "误命中", [
      "名称不同",
      "注册地不同",
      "成立时间不同",
      "标识号不同",
    ]),
    o("TRUE_POSITIVE", "真命中", ["标识号一致", "多项特征一致", "其他"]),
    o("UNCERTAIN", "无法判断", ["关键信息缺失", "证据冲突", "其他"]),
  ],
  SCREENING_MEDIA: [
    o("UNRELATED", "不相关", ["非同一主体", "报道过时", "事件已了结"]),
    o("RELATED_ACCEPTABLE", "相关可接受", [
      "风险已缓释",
      "事件影响有限",
      "其他",
    ]),
    o("RELATED_UNACCEPTABLE", "相关不可接受", [
      "金融犯罪",
      "欺诈",
      "洗钱风险",
      "其他",
    ]),
  ],
  DATA_MATCH: [
    o("ACCEPTABLE_DIFF", "可接受差异", ["音译", "缩写", "格式", "曾用名"]),
    o("REQUEST_INFO", "要求补件", [
      "地址证明",
      "注册文件",
      "信息待确认",
      "其他",
    ]),
    o("DECLINE", "拒绝", ["资料不实", "主体资质不符", "其他"]),
  ],
  IDENTITY_MEDIA: [
    o("NORMAL", "正常", ["光线", "角度", "证件磨损"]),
    o("REVERIFY", "重新验证", ["图像不清晰", "活体不足", "身份待确认"]),
    o("FRAUD_DECLINE", "欺诈拒绝", [
      "证件篡改",
      "证件伪造",
      "冒用身份",
      "其他",
    ]),
  ],
  ASSOCIATED_PERSONS: [
    o("ACCEPTABLE", "可接受", ["已离任", "持股低于阈值", "数据源滞后"]),
    o("ADD_PERSON", "补充人员", ["未申报关联人", "人员信息不完整"]),
    o("DECLINE", "拒绝", ["隐瞒控制人", "资料不实", "其他"]),
  ],
  CLASSIFICATION: [
    o("KEEP_MCC", "维持申报", ["申报符合实际经营", "报告分类不准确"]),
    o("CHANGE_MCC", "改为指定 MCC", ["实际经营业务", "主营业务变化", "其他"]),
    o("PROHIBITED", "禁入", ["禁售类目", "政策禁止", "其他"]),
  ],
  WEBSITE: [
    o("NORMAL", "正常", ["与申报一致", "问题已修复"]),
    o("RECTIFY", "要求整改", [
      "缺少退款政策",
      "缺少客服联系方式",
      "缺少交易条款",
      "经营内容需说明",
    ]),
    o("DECLINE", "拒绝", ["禁售商品", "虚假经营", "其他"]),
  ],
  SCHEME_LIST: [
    o("ACCEPTABLE", "可接受", ["历史问题已整改", "列入原因可接受", "其他"]),
    o("UNACCEPTABLE", "不可接受", ["欺诈风险", "历史问题未解决", "其他"]),
  ],
  OWNERSHIP: [
    o("TRACED", "已穿透", ["已识别自然人 UBO", "股权材料已确认"]),
    o("REQUEST_OWNERSHIP", "补充股权材料", [
      "股权链条不完整",
      "缺少受益人材料",
    ]),
    o("DECLINE", "拒绝", ["无法识别实际控制人", "拒绝披露", "其他"]),
  ],
  LINKED_ENTITY: [
    o("DIFFERENT_ENTITY", "不同主体", ["标识号不同", "独立法人", "其他"]),
    o("SAME_ACCEPTABLE", "同一主体可接受", [
      "合法关联公司",
      "重复申请已撤回",
      "其他",
    ]),
    o("SAME_DECLINE", "同一主体拒绝", ["重复进件", "关联风险", "其他"]),
  ],
  MANUAL_VERIFY: [
    o("MANUAL_PASS", "人工核验通过", ["官方来源已确认", "补充材料已核实"]),
    o("REQUEST_INFO", "要求补件", ["核验材料不足", "其他"]),
    o("DECLINE", "拒绝", ["核验不通过", "资料不实", "其他"]),
  ],
};
export const SUPPLEMENT_CONCLUSIONS: Record<string, true> = {
  REQUEST_INFO: true,
  REVERIFY: true,
  ADD_PERSON: true,
  RECTIFY: true,
  REQUEST_OWNERSHIP: true,
};
export const DECLINE_CONCLUSIONS: Record<string, true> = {
  DECLINE: true,
  FRAUD_DECLINE: true,
  PROHIBITED: true,
  UNACCEPTABLE: true,
  SAME_DECLINE: true,
  RELATED_UNACCEPTABLE: true,
};

const EXTERNAL_TEXT: Record<string, ExternalText> = {
  "KYC-ID-QUALITY": {
    zh: "请提供有效身份证件的清晰彩色原图，完整显示四角、姓名和有效期。",
    en: "Please upload a clear colour image of your valid identity document, showing all four corners, your name and the expiry date.",
  },
  "KYC-ID-EXPIRED": {
    zh: "请提供尚在有效期内的身份证件，完整显示姓名和有效期。",
    en: "Please upload an unexpired identity document showing your name and the expiry date.",
  },
  "KYC-ID-UNSUPPORTED": {
    zh: "请提供有效护照或补件页面列明的受支持身份证件。",
    en: "Please provide a valid passport or another supported identity document listed in the secure portal.",
  },
  "KYC-SELFIE-QUALITY": {
    zh: "请本人在光线充足的环境中重新完成自拍和活体核验。",
    en: "Please complete the selfie and liveness check again in a well-lit setting.",
  },
  "DOC-UNUSABLE": {
    zh: "请上传清晰、完整的商业登记文件，确保登记编号和公司名称可辨认。",
    en: "Please upload a clear, complete business registration document with a legible registration number and company name.",
  },
  "WEB-UNAVAILABLE": {
    zh: "请提供可公开访问的经营网站链接，并确认商品及联系页面正常加载。",
    en: "Please provide a publicly accessible business website and ensure its product and contact pages load correctly.",
  },
  "WEB-POLICY-MISSING": {
    zh: "请完善网站退款政策、交易条款和客户服务联系方式，并提供公开页面链接。",
    en: "Please publish your refund policy, terms of sale and customer service contact details, and provide the public page links.",
  },
  "KYC-INCOMPLETE": {
    zh: "请通知页面列明的相关人员通过安全链接完成身份核验。",
    en: "Please ask the people listed in the secure portal to complete identity verification using their secure links.",
  },
  "KYC-ID-DATA-MISMATCH": {
    zh: "请确认申请中的姓名及证件号码，并提供显示正确信息的有效证件。",
    en: "Please confirm the name and document number in your application and provide a valid document showing the correct details.",
  },
  "KYC-ID-TAMPER": {
    zh: "请重新提供董事本人有效身份证件的清晰彩色原图，完整显示四角及有效期。",
    en: "Please provide a new, clear colour image of the director's valid identity document, showing all four corners and the expiry date.",
  },
  "KYC-SELFIE-MISMATCH": {
    zh: "请证件持有人通过安全链接重新完成本人身份核验。",
    en: "Please ask the document holder to complete identity verification again using the secure link.",
  },
  "KYB-REG-STATUS": {
    zh: "请提供登记机关近期出具的企业登记摘录，显示当前主体状态。",
    en: "Please provide a recent company register extract issued by the registration authority showing the current entity status.",
  },
  "KYB-REG-NOT-FOUND": {
    zh: "请确认登记编号，并提供登记机关出具的公司注册证书。",
    en: "Please confirm your registration number and provide a company registration certificate issued by the registration authority.",
  },
  "KYB-REG-NAME": {
    zh: "请提供最新公司注册证书，显示完整法定名称与公司注册编号。",
    en: "Please provide a current company registration certificate showing the full legal name and company registration number.",
  },
  "KYB-REG-ADDR": {
    zh: "请提供近三个月的注册地址证明，须完整显示公司名称、地址及签发日期。",
    en: "Please provide proof of your registered business address issued within the last three months, showing the company name, full address and issue date.",
  },
  "KYB-REG-NO-SOURCE": {
    zh: "请提供登记机关出具的公司登记摘录及可用于查验的资料。",
    en: "Please provide an official company register extract and the information needed to verify it.",
  },
  "KYB-TIN-MISMATCH": {
    zh: "请确认税号，并提供显示公司法定名称及税号的税务登记文件。",
    en: "Please confirm your tax identification number and provide a tax registration document showing the legal company name and tax number.",
  },
  "KYB-VAT-INVALID": {
    zh: "请确认增值税登记状态，并提供有效的增值税登记证明。",
    en: "Please confirm your VAT registration status and provide a valid VAT registration certificate.",
  },
  "KYB-VAT-MISMATCH": {
    zh: "请提供显示公司名称、地址及增值税号的最新增值税登记文件。",
    en: "Please provide a current VAT registration document showing the company name, address and VAT number.",
  },
  "DOC-DATA-MISMATCH": {
    zh: "请确认申请资料，并提供显示当前公司名称、登记编号及地址的最新文件。",
    en: "Please confirm your application details and provide current documents showing the company name, registration number and address.",
  },
  "KYB-AP-UNDECLARED": {
    zh: "请提交最新董事名册及签字授权书，列明全部董事与授权签字人。",
    en: "Please provide a current register of directors and signatory authorisation listing all directors and authorised signatories.",
  },
  "KYB-AP-MISSING": {
    zh: "请提供相关人员的任职或签字授权文件，确认其在公司的职责。",
    en: "Please provide appointment or signatory authorisation documents confirming the relevant person's role in the company.",
  },
  "KYB-UBO-COMPLEX": {
    zh: "请提供签署的股权结构图及各层股东名册，直至列明最终自然人受益人及持股比例。",
    en: "Please provide a signed ownership chart and shareholder registers for each ownership level, identifying the ultimate individual beneficial owners and their ownership percentages.",
  },
  "CLS-MCC-MISMATCH": {
    zh: "请提供主要商品或服务、价格及销售方式的说明，并附商品目录或网站链接。",
    en: "Please describe your main products or services, prices and sales channels, and include a product catalogue or website links.",
  },
  "CLS-PROHIBITED-LOW": {
    zh: "请提供所售商品或服务的完整说明及适用的经营许可。",
    en: "Please provide a full description of the products or services you sell and any applicable business licences.",
  },
  "WEB-MISMATCH": {
    zh: "请提交已更新的网站退款政策页面与客户服务联系方式，提供公开可访问的页面链接或截图。",
    en: "Please provide public links or screenshots of your updated website refund policy and customer service contact details.",
  },
  "WEB-PROHIBITED": {
    zh: "请提供当前在售商品目录、产品说明及适用的经营许可。",
    en: "Please provide your current product catalogue, product descriptions and any applicable business licences.",
  },
  "INT-DUPLICATE": {
    zh: "请确认本次申请的法律主体，并提供公司注册证书及授权联系人信息。",
    en: "Please confirm the legal entity for this application and provide its registration certificate and authorised contact details.",
  },
  "SYS-REPORT-DELAYED": {
    zh: "请提供登记机关近期出具的企业登记摘录，显示主体存续状态及董事信息。",
    en: "Please provide a recent official company register extract showing the entity's current status and directors.",
  },
  "CH-REJECT-DOCS": {
    zh: "请提供有效的董事签字授权书，完整显示授权范围、签署人和签署日期。",
    en: "Please provide a valid director's signatory authorisation showing the scope of authority, signatory and signing date.",
  },
  "CH-MORE-INFO": {
    zh: "请提供近三个月的注册地址证明，须完整显示公司名称、地址及签发日期。",
    en: "Please provide proof of your registered business address issued within the last three months, showing the company name, full address and issue date.",
  },
};

export interface ReasonDefinition {
  name: string;
  disposition: string;
  checkType?: CheckType;
  priority?: "HIGH" | "NORMAL" | "LOW";
  externalCategory: string;
  externalText: ExternalText;
}
const reason = (
  code: string,
  name: string,
  disposition: string,
  externalCategory: string,
  checkType?: CheckType,
  priority?: ReasonDefinition["priority"],
): [string, ReasonDefinition] => [
  code,
  {
    name,
    disposition,
    externalCategory,
    externalText: EXTERNAL_TEXT[code] ?? {
      zh: "您的申请需要进一步审核。如需补充资料，我们将通过登记的联系方式通知您。",
      en: "Your application requires further review. We will contact you using your registered contact details if additional information is needed.",
    },
    ...(checkType ? { checkType } : {}),
    ...(priority ? { priority } : {}),
  },
];
export const REASONS: Record<string, ReasonDefinition> = Object.fromEntries([
  reason("KYC-ID-QUALITY", "证件图像不合格", "自动补件", "补件项"),
  reason("KYC-ID-EXPIRED", "证件已过期", "自动补件", "补件项"),
  reason("KYC-ID-UNSUPPORTED", "证件类型不支持", "自动补件", "补件项"),
  reason("KYC-SELFIE-QUALITY", "自拍或活体不合格", "自动补件", "补件项"),
  reason("DOC-UNUSABLE", "文件无法使用", "自动补件", "补件项"),
  reason("WEB-UNAVAILABLE", "网站缺失或无法访问", "自动补件", "补件项"),
  reason("WEB-POLICY-MISSING", "网站缺少合规要素", "自动补件", "补件项"),
  reason("KYC-INCOMPLETE", "个人验证未完成", "催办后超时关闭", "补件项"),
  reason("KYB-REG-INACTIVE", "主体已注销", "自动拒绝", "主体资质"),
  reason("INT-BLOCK-EXACT", "内部黑名单精确命中", "自动拒绝", "不披露"),
  reason("INT-GEO-BANNED", "禁止国家", "自动拒绝", "地区政策"),
  reason("CLS-PROHIBITED", "禁入类目(高置信度)", "自动拒绝", "经营类目"),
  reason(
    "KYC-ID-DATA-MISMATCH",
    "证件信息与申报不一致",
    "检查项",
    "身份核验",
    "DATA_MATCH",
    "NORMAL",
  ),
  reason(
    "KYC-ID-TAMPER",
    "证件疑似篡改",
    "检查项",
    "身份核验",
    "IDENTITY_MEDIA",
    "HIGH",
  ),
  reason(
    "KYC-SELFIE-MISMATCH",
    "人脸与证件不一致",
    "检查项",
    "身份核验",
    "IDENTITY_MEDIA",
    "HIGH",
  ),
  reason(
    "KYB-REG-STATUS",
    "主体状态异常",
    "检查项",
    "主体资质",
    "DATA_MATCH",
    "NORMAL",
  ),
  reason(
    "KYB-REG-NOT-FOUND",
    "未查到主体",
    "检查项",
    "主体资质",
    "DATA_MATCH",
    "NORMAL",
  ),
  reason(
    "KYB-REG-NAME",
    "名称部分匹配",
    "检查项",
    "主体资质",
    "DATA_MATCH",
    "NORMAL",
  ),
  reason(
    "KYB-REG-ADDR",
    "注册地址不一致",
    "检查项",
    "主体资质",
    "DATA_MATCH",
    "NORMAL",
  ),
  reason(
    "KYB-REG-NO-SOURCE",
    "无登记源覆盖",
    "检查项",
    "主体资质",
    "DATA_MATCH",
    "NORMAL",
  ),
  reason(
    "KYB-TIN-MISMATCH",
    "税号与名称不匹配",
    "检查项",
    "主体资质",
    "DATA_MATCH",
    "NORMAL",
  ),
  reason(
    "KYB-VAT-INVALID",
    "VAT 无效或未注册",
    "检查项",
    "主体资质",
    "DATA_MATCH",
    "NORMAL",
  ),
  reason(
    "KYB-VAT-MISMATCH",
    "VAT 名称或地址不一致",
    "检查项",
    "主体资质",
    "DATA_MATCH",
    "NORMAL",
  ),
  reason(
    "DOC-DATA-MISMATCH",
    "文件信息不一致",
    "检查项",
    "主体资质",
    "DATA_MATCH",
    "NORMAL",
  ),
  reason(
    "KYB-AP-UNDECLARED",
    "未申报的关联人",
    "检查项",
    "主体资质",
    "ASSOCIATED_PERSONS",
    "NORMAL",
  ),
  reason(
    "KYB-AP-MISSING",
    "申报人员未见于关联人",
    "检查项",
    "主体资质",
    "ASSOCIATED_PERSONS",
    "NORMAL",
  ),
  reason(
    "KYB-UBO-COMPLEX",
    "股权无法穿透",
    "检查项",
    "主体资质",
    "OWNERSHIP",
    "NORMAL",
  ),
  reason(
    "SCR-WL-POTENTIAL",
    "名单潜在命中",
    "检查项",
    "不披露",
    "SCREENING_WATCHLIST",
    "HIGH",
  ),
  reason(
    "SCR-AM-HIGH",
    "高严重负面新闻",
    "检查项",
    "不披露",
    "SCREENING_MEDIA",
    "NORMAL",
  ),
  reason(
    "SCR-AM-LOW",
    "一般负面新闻",
    "检查项",
    "不披露",
    "SCREENING_MEDIA",
    "LOW",
  ),
  reason(
    "CLS-PROHIBITED-LOW",
    "疑似禁入类目(低置信度)",
    "检查项",
    "经营类目",
    "CLASSIFICATION",
    "NORMAL",
  ),
  reason(
    "CLS-MCC-MISMATCH",
    "类目与申报 MCC 不一致",
    "检查项",
    "经营类目",
    "CLASSIFICATION",
    "NORMAL",
  ),
  reason(
    "WEB-MISMATCH",
    "网站内容与业务不符",
    "检查项",
    "网站与线上经营",
    "WEBSITE",
    "NORMAL",
  ),
  reason(
    "WEB-PROHIBITED",
    "疑似销售禁售商品",
    "检查项",
    "经营类目",
    "WEBSITE",
    "HIGH",
  ),
  reason(
    "INT-BLOCK-FUZZY",
    "内部黑名单模糊命中",
    "检查项",
    "不披露",
    "LINKED_ENTITY",
    "NORMAL",
  ),
  reason(
    "INT-DUPLICATE",
    "重复或关联申请",
    "检查项",
    "综合评估",
    "LINKED_ENTITY",
    "NORMAL",
  ),
  reason(
    "INT-SCHEME-LIST",
    "卡组织名单命中",
    "检查项",
    "不披露",
    "SCHEME_LIST",
    "NORMAL",
  ),
  reason(
    "SYS-REPORT-DELAYED",
    "证据缺失",
    "检查项",
    "综合评估",
    "MANUAL_VERIFY",
    "NORMAL",
  ),
  reason("CLS-HIGH-RISK", "高风险类目", "审批原因", "经营类目"),
  reason("INT-GEO-HIGH", "涉及高风险国家", "审批原因", "地区政策"),
  reason("INT-PEP", "UBO 或董事为 PEP", "审批原因", "不披露"),
  reason("INT-VOLUME", "交易量超出审核员额度", "审批原因", "综合评估"),
  reason("INT-COMBO-NEW", "新主体且线上信息少", "审批原因", "综合评估"),
  reason("CH-REJECT-DOCS", "渠道以资料问题驳回", "渠道工单", "补件项"),
  reason("CH-REJECT-POLICY", "渠道以风险或政策驳回", "渠道工单", "综合评估"),
  reason("CH-MORE-INFO", "渠道要求补充材料", "渠道工单", "补件项"),
  reason("CH-TIMEOUT", "渠道超时未回执", "渠道工单", "—"),
  reason("WEB-PRESENCE-WEAK", "线上存在感弱", "组合规则", "—"),
  reason("SYS-VENDOR-ERROR", "供应商接口异常", "技术告警", "—"),
  reason("SYS-WEBHOOK-MISSING", "webhook 丢失", "对账补齐", "—"),
]);
export const reasonName = (code?: string) =>
  code ? (REASONS[code]?.name ?? code) : "—";
