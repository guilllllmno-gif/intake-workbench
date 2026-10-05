import { USERS } from "./access";
import { REASONS, reasonName } from "./catalog";
import evidenceAssets from "./seed-evidence.json";
import type {
  Application,
  CheckItem,
  CheckType,
  Evidence,
  Merchant,
  Person,
  Status,
  Store,
  UploadedFile,
  UserRef,
  WorkOrder,
} from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RULE_VERSION = "triage-v1.0.3";

interface Profile {
  displayName: string;
  legalName: string;
  country: string;
  registrationNo: string;
  mcc: string;
  volume: number;
  domain: string;
  business: string;
}

const SCENARIO_PROFILES: [number, Profile][] = [
  [
    1,
    {
      displayName: "澄海生活",
      legalName: "Chenghai Living Pte. Ltd.",
      country: "SG",
      registrationNo: "201936482N",
      mcc: "5719",
      volume: 35000,
      domain: "chenghai-living",
      business: "家居用品线上零售，销售餐具、灯具与软装。",
    },
  ],
  [
    2,
    {
      displayName: "北辰跨境",
      legalName: "Beichen Cross-Border Commerce Limited",
      country: "HK",
      registrationNo: "2984417",
      mcc: "5999",
      volume: 860000,
      domain: "beichen-commerce",
      business: "跨境日用品零售，自营库存，订单由香港仓发货。",
    },
  ],
  [
    3,
    {
      displayName: "青禾家居",
      legalName: "Qinghe Home Furnishings Ltd",
      country: "GB",
      registrationNo: "14820573",
      mcc: "5712",
      volume: 76000,
      domain: "qinghe-home",
      business: "家具零售，提供餐桌、书柜及组装配送服务。",
    },
  ],
  [
    4,
    {
      displayName: "星桥旅行",
      legalName: "Starbridge Travel Pte. Ltd.",
      country: "SG",
      registrationNo: "201807215R",
      mcc: "4722",
      volume: 320000,
      domain: "starbridge-travel",
      business: "旅行社，提供国际机票代理与预付度假套餐。",
    },
  ],
  [
    5,
    {
      displayName: "光屿数码",
      legalName: "Guangyu Digital Pte. Ltd.",
      country: "SG",
      registrationNo: "202214738K",
      mcc: "5732",
      volume: 58000,
      domain: "guangyu-digital",
      business: "电脑外设、耳机和消费电子线上零售。",
    },
  ],
  [
    6,
    {
      displayName: "远岸贸易",
      legalName: "Yuan'an Trading Limited",
      country: "HK",
      registrationNo: "3158842",
      mcc: "5999",
      volume: 1200000,
      domain: "yuanan-trading",
      business: "跨境家用百货零售，向亚太市场直销。",
    },
  ],
  [
    7,
    {
      displayName: "云帆设计",
      legalName: "Yunfan Design Studio Ltd",
      country: "GB",
      registrationNo: "SC748219",
      mcc: "7333",
      volume: 18000,
      domain: "yunfan-design",
      business: "商业平面设计、品牌视觉及包装设计服务。",
    },
  ],
  [
    8,
    {
      displayName: "临川咖啡",
      legalName: "Linchuan Coffee Roasters Ltd",
      country: "GB",
      registrationNo: "09431876",
      mcc: "5499",
      volume: 22000,
      domain: "linchuan-coffee",
      business: "自营烘焙咖啡豆与食品零售。",
    },
  ],
  [
    9,
    {
      displayName: "海汐美妆",
      legalName: "Haixi Beauty Pte. Ltd.",
      country: "SG",
      registrationNo: "201544318W",
      mcc: "5977",
      volume: 41000,
      domain: "haixi-beauty",
      business: "护肤品与彩妆零售，代理品牌直供。",
    },
  ],
  [
    11,
    {
      displayName: "森屿数字",
      legalName: "Senyu Digital Retail GmbH",
      country: "DE",
      registrationNo: "Amtsgericht Hamburg HRB 178245",
      mcc: "5732",
      volume: 148000,
      domain: "senyu-digital",
      business: "消费电子产品零售，德国本地仓配送。",
    },
  ],
  [
    12,
    {
      displayName: "望舒数字",
      legalName: "Wangshu Digital Media Ltd",
      country: "GB",
      registrationNo: "13874520",
      mcc: "5815",
      volume: 64000,
      domain: "wangshu-media",
      business: "数字图书、音乐与创意素材按次付费下载。",
    },
  ],
];

const JURISDICTIONS: Record<
  string,
  {
    authority: string;
    currency: string;
    address: string;
    phone: string;
    first: string[];
    last: string[];
  }
> = {
  GB: {
    authority: "Companies House",
    currency: "GBP",
    address: "Bristol BS1 4ST, United Kingdom",
    phone: "+44 20 7946",
    first: [
      "Oliver",
      "Amelia",
      "George",
      "Isla",
      "Arthur",
      "Grace",
      "Henry",
      "Freya",
    ],
    last: [
      "Bennett",
      "Clarke",
      "Hughes",
      "Parker",
      "Reed",
      "Foster",
      "Collins",
      "Brooks",
      "Morgan",
      "Ward",
      "Turner",
      "Ellis",
      "Bailey",
      "Mitchell",
      "Cooper",
      "Wright",
    ],
  },
  SG: {
    authority: "Accounting and Corporate Regulatory Authority (ACRA)",
    currency: "SGD",
    address: "Robinson Road, Singapore 068898",
    phone: "+65 6123",
    first: [
      "Wei Ming",
      "Jia Hui",
      "Jun Jie",
      "Xin Yi",
      "Zhi Hao",
      "Mei Ling",
      "Kai Wen",
      "Hui Min",
    ],
    last: [
      "Tan",
      "Lim",
      "Lee",
      "Ng",
      "Ong",
      "Goh",
      "Teo",
      "Chua",
      "Koh",
      "Yeo",
      "Low",
      "Seah",
      "Sim",
      "Toh",
      "Tay",
      "Lau",
    ],
  },
  HK: {
    authority: "Companies Registry, Hong Kong",
    currency: "HKD",
    address: "Queen's Road Central, Central, Hong Kong",
    phone: "+852 3123",
    first: [
      "Ka Ho",
      "Tsz Yan",
      "Chun Kit",
      "Wing Sze",
      "Wai Man",
      "Hoi Yan",
      "Chi Chung",
      "Pui Lam",
    ],
    last: [
      "Chan",
      "Wong",
      "Cheung",
      "Lau",
      "Leung",
      "Lee",
      "Ho",
      "Ng",
      "Cheng",
      "Chow",
      "Mak",
      "Tsang",
      "Yip",
      "Lam",
      "Lo",
      "Tang",
    ],
  },
  DE: {
    authority: "Amtsgericht Hamburg",
    currency: "EUR",
    address: "20457 Hamburg, Deutschland",
    phone: "+49 40 555",
    first: [
      "Lukas",
      "Hannah",
      "Leon",
      "Emilia",
      "Jonas",
      "Clara",
      "Felix",
      "Mia",
    ],
    last: [
      "Schneider",
      "Fischer",
      "Weber",
      "Meyer",
      "Wagner",
      "Becker",
      "Hoffmann",
      "Schulz",
      "Koch",
      "Bauer",
      "Richter",
      "Klein",
      "Wolf",
      "Neumann",
      "Schwarz",
      "Zimmermann",
    ],
  },
};

export function createSeed(now = Date.now()): Store {
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const date = (offsetDays: number) =>
    new Date(Date.parse(evidenceAssets.capturedAt) + offsetDays * DAY)
      .toISOString()
      .slice(0, 10);
  const random = (key: string) => {
    let value = 2166136261;
    for (const character of key)
      value = Math.imul(value ^ character.charCodeAt(0), 16777619);
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };
  const jitter = (key: string, span: number) => Math.floor(random(key) * span);
  const personaRef = (prefix: string, key: string) =>
    `${prefix}_${Array.from(
      { length: 24 },
      (_, index) =>
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"[
          jitter(`${key}:${index}`, 55)
        ],
    ).join("")}`;
  const user = (id: string): UserRef => {
    const found = USERS.find((candidate) => candidate.id === id)!;
    return {
      id: found.id,
      name: found.name,
      account: found.account,
      team: found.team,
    };
  };
  const reviewer = user("u_1023");
  const ops = user("u_2051");
  const senior = user("u_1101");
  const head = user("u_1201");
  const salesOwners = ["u_4001", "u_4002", "u_4003", "u_4004"].map(user);
  const system: UserRef = {
    id: "system",
    name: "进件规则引擎",
    account: "intake.rules",
    team: "自动核验",
  };
  const store: Store = {
    schema: 6,
    nextId: 10000,
    users: USERS.map((account) => ({ ...account, roles: [...account.roles] })),
    merchants: [],
    applications: [],
    people: [],
    orders: [],
    evidence: [],
    events: [],
    triage: [],
    audit: [],
    snapshots: {},
    qa: {},
    submissions: [],
    channelMappings: [],
    approvalDecisions: [],
    restrictedDecisions: [],
    notifications: [],
    correctiveObjects: [],
  };
  let fileSequence = 0;
  const personSequence: Record<string, number> = { GB: 0, SG: 0, HK: 0, DE: 0 };
  const applicationIndex = new Map<string, Application>();
  const merchantIndex = new Map<string, Merchant>();
  const addressIndex = new Map<string, string>();
  const germanOffices = [
    {
      court: "Amtsgericht Hamburg",
      address: "Am Kaiserkai 18, 20457 Hamburg, Deutschland",
    },
    {
      court: "Amtsgericht München",
      address: "Rosenheimer Straße 27, 81667 München, Deutschland",
    },
    {
      court: "Amtsgericht Frankfurt am Main",
      address: "Mainzer Landstraße 46, 60325 Frankfurt am Main, Deutschland",
    },
    {
      court: "Amtsgericht Köln",
      address: "Hohenzollernring 22, 50672 Köln, Deutschland",
    },
    {
      court: "Amtsgericht Charlottenburg",
      address: "Kantstraße 84, 10627 Berlin, Deutschland",
    },
    {
      court: "Amtsgericht Stuttgart",
      address: "Königstraße 28, 70173 Stuttgart, Deutschland",
    },
  ];
  const registrationNumber = (country: string, key: string) => {
    const digits = (label: string, count: number) =>
      String(
        jitter(`${key}:${label}`, 9 * 10 ** (count - 1)) + 10 ** (count - 1),
      );
    if (country === "GB") return digits("company", 8);
    if (country === "SG")
      return `${2004 + jitter(`${key}:year`, 20)}${digits("uen", 5)}${"ABCDEFGHJKLMNPQRSTUVWXYZ"[jitter(`${key}:suffix`, 23)]}`;
    if (country === "HK") return digits("company", 7);
    const office = germanOffices[jitter(`${key}:court`, germanOffices.length)];
    return `${office.court} HRB ${digits("hrb", 6)}`;
  };
  const incorporationDate = (country: string, registrationNo: string) =>
    country === "SG"
      ? `${registrationNo.slice(0, 4)}-${String(1 + jitter(`${registrationNo}:month`, 12)).padStart(2, "0")}-${String(1 + jitter(`${registrationNo}:day`, 28)).padStart(2, "0")}`
      : date(-1500 - jitter(`${registrationNo}:incorporation`, 4000));
  const orderId = (number: number) =>
    `WO-20261005-${String(number).padStart(4, "0")}`;
  const merchantFor = (appId: string) =>
    merchantIndex.get(applicationIndex.get(appId)!.merchantId)!;
  const peopleFor = (merchant: Merchant) =>
    store.people.filter((person) => person.merchantId === merchant.id);

  function file(
    merchant: Merchant,
    name: string,
    options: { uploadedAt?: string } = {},
  ): UploadedFile {
    const id = `file_${String(++fileSequence).padStart(8, "0")}`;
    // Scans and byte metadata are frozen together at evidenceAssets.capturedAt.
    const asset = (
      evidenceAssets.files as Record<string, { type: string; size: number }>
    )[name];
    const person = peopleFor(merchant)[0];
    return {
      id,
      name,
      type: asset.type,
      size: asset.size,
      pages: 1,
      uploadedBy: {
        id: person.id,
        name: person.name,
        team: merchant.legalName,
      },
      uploadedAt: options.uploadedAt ?? iso(-2 * DAY),
      url: `${import.meta.env?.BASE_URL ?? "/"}evidence/${encodeURIComponent(name)}`,
    };
  }

  function registryFile(merchant: Merchant): UploadedFile {
    const localName =
      merchant.country === "DE"
        ? `Handelsregisterauszug_HRB${merchant.registrationNo.split(" ").at(-1)}.jpg`
        : `Company_Register_${merchant.registrationNo.replace(/\W/g, "")}.jpg`;
    return file(merchant, localName, { uploadedAt: iso(-2 * DAY) });
  }

  function addApplication(number: number, profile: Profile): Application {
    const id = `APP-${number}`;
    const jurisdiction = JURISDICTIONS[profile.country];
    const merchant: Merchant = {
      id: `MER-${number}`,
      displayName: profile.displayName,
      legalName: profile.legalName,
      registrationNo: profile.registrationNo,
      registrationAuthority:
        profile.country === "DE"
          ? profile.registrationNo.split(" HRB ")[0]
          : jurisdiction.authority,
      country: profile.country,
      declaredMcc: profile.mcc,
      expectedMonthlyVolume: {
        amount: profile.volume,
        currency: jurisdiction.currency,
      },
      averageTransaction: {
        amount: profile.mcc === "4722" ? 1800 : 125,
        currency: jurisdiction.currency,
      },
      website: `https://${profile.domain}.example`,
      businessModel: profile.business,
      mccRisk: profile.mcc === "4722" ? "高" : "低",
      countryRisk: "低",
      isNewEntity: false,
    };
    addressIndex.set(
      merchant.id,
      profile.country === "GB"
        ? `${22 + store.merchants.length} Harbour Street, ${jurisdiction.address}`
        : profile.country === "DE"
          ? germanOffices.find(
              (office) => office.court === merchant.registrationAuthority,
            )!.address
          : `${35 + store.merchants.length} ${jurisdiction.address}`,
    );
    store.merchants.push(merchant);
    merchantIndex.set(merchant.id, merchant);
    for (let index = 0; index < 3; index++) {
      const sequence = personSequence[profile.country]++;
      const first = jurisdiction.first[sequence % jurisdiction.first.length];
      const last =
        jurisdiction.last[
          Math.floor(sequence / jurisdiction.first.length) %
            jurisdiction.last.length
        ];
      const name =
        profile.country === "SG" || profile.country === "HK"
          ? `${last} ${first}`
          : `${first} ${last}`;
      store.people.push({
        id: `PER-${number}-${index + 1}`,
        merchantId: merchant.id,
        name,
        role: index === 0 ? "UBO / 董事" : index === 1 ? "UBO" : "授权签字人",
        ownershipPct: index === 0 ? 65 : index === 1 ? 35 : undefined,
        declared: true,
        kycStatus: "VERIFIED",
        needsReverify: false,
      });
    }
    const contact = peopleFor(merchant)[2];
    merchant.contacts = [
      {
        name: contact.name,
        email: `finance@${profile.domain}.example`,
        phone: `${jurisdiction.phone} ${String(number % 10000).padStart(4, "0")}`,
        preferredChannel: "EMAIL",
      },
    ];
    const age = 3 * DAY + jitter(`application-age:${number}`, 24 * DAY);
    const sales = salesOwners[store.applications.length % salesOwners.length];
    const application: Application = {
      id,
      merchantId: merchant.id,
      communicationLanguage:
        random(`correspondence:${number}`) < 0.4 ? "zh" : "en",
      stage: "MANUAL_REVIEW",
      status: "IN_PROGRESS",
      externalStatus: "审核中",
      isKeyMerchant: false,
      salesOwner: sales,
      submittedBy: sales,
      createdAt: iso(-age),
      version: 1,
      stageTimes: {
        SUBMITTED: iso(-age),
        AUTO_CHECK: iso(-age + 37_000 + jitter(`auto:${number}`, 13 * 60_000)),
        MANUAL_REVIEW: iso(
          -age + 23 * 60_000 + jitter(`manual:${number}`, 47 * 60_000),
        ),
      },
    };
    store.applications.push(application);
    applicationIndex.set(id, application);
    return application;
  }

  function moveApplication(
    app: Application,
    stage: Application["stage"],
    externalStatus: Application["externalStatus"] = "审核中",
    status = "IN_PROGRESS",
  ) {
    app.stage = stage;
    app.status = status;
    app.externalStatus = externalStatus;
    const submitted = Date.parse(app.createdAt);
    const stages: Application["stage"][] = [
      "SUBMITTED",
      "AUTO_CHECK",
      "MANUAL_REVIEW",
      "APPROVAL",
      "CHANNEL",
      "LIVE",
    ];
    let completedAt = submitted;
    app.stageTimes = Object.fromEntries(
      stages.slice(0, stages.indexOf(stage) + 1).map((value, index) => {
        if (index)
          completedAt += 41_000 + jitter(`${app.id}:${value}`, 3 * HOUR);
        return [value, new Date(completedAt).toISOString()];
      }),
    );
  }

  function addOrder(
    number: number,
    app: Application,
    type: WorkOrder["type"],
    status: Status,
    assignee?: UserRef,
    reasons: string[] = [],
  ): WorkOrder {
    const previousCreatedAt = store.orders.reduce(
      (latest, order) =>
        order.applicationId === app.id
          ? Math.max(latest, Date.parse(order.createdAt))
          : latest,
      0,
    );
    const createdAt = new Date(
      Math.max(
        now -
          (type === "SUPPLEMENT"
            ? 65 * 60_000 + jitter(`order-age:${number}`, 2 * HOUR)
            : 90 * 60_000 + jitter(`order-age:${number}`, 10 * HOUR)),
        previousCreatedAt
          ? previousCreatedAt +
              17 * 60_000 +
              jitter(`order-gap:${number}`, 19 * 60_000)
          : 0,
      ),
    ).toISOString();
    const priority =
      reasons.some((reason) => REASONS[reason]?.priority === "HIGH") ||
      app.isKeyMerchant
        ? "HIGH"
        : reasons.length &&
            reasons.every((reason) => REASONS[reason]?.priority === "LOW")
          ? "LOW"
          : "NORMAL";
    const paused =
      status === "WAITING_SUPPLEMENT" ||
      status === "COMPLIANCE_HOLD" ||
      status === "WAITING_MERCHANT" ||
      status === "WAITING_COMPLIANCE" ||
      status === "WAITING_CHANNEL";
    const duration =
      type === "QA"
        ? 5 * DAY
        : type === "SUPPLEMENT"
          ? 4 * HOUR
          : priority === "HIGH"
            ? DAY
            : 2 * DAY;
    const order: WorkOrder = {
      id: orderId(number),
      applicationId: app.id,
      type,
      stage:
        type === "CHANNEL"
          ? "CHANNEL"
          : type === "QA"
            ? "POST_APPROVAL"
            : "FORM_SUBMITTED",
      status,
      queue:
        type === "REVIEW" && reasons.some((reason) => reason.startsWith("SCR-"))
          ? "SCREENING"
          : type,
      assignee,
      submittedBy: app.submittedBy,
      priority,
      createdAt,
      enteredStatusAt: createdAt,
      slaDueAt: new Date(Date.parse(createdAt) + duration).toISOString(),
      slaPaused: paused,
      slaRemainingMs: paused ? duration - HOUR : undefined,
      ruleVersion: RULE_VERSION,
      reasonCodes: reasons,
      approvalReasons: [],
      checkItems: [],
      version: 1,
    };
    if (assignee)
      order.firstResponderAt = new Date(
        Date.parse(createdAt) +
          91_000 +
          jitter(`response:${number}`, 12 * 60_000),
      ).toISOString();
    if (["CLOSED", "DONE", "CLOSED_NO_RESPONSE", "WITHDRAWN"].includes(status))
      order.closedAt = iso(
        -8 * 60_000 - jitter(`closed:${number}`, 21 * 60_000),
      );
    store.orders.push(order);
    return order;
  }

  function addEvidence(
    order: WorkOrder,
    reason: string,
    slot: number,
    overrides: Record<string, any> = {},
  ): CheckItem {
    const merchant = merchantFor(order.applicationId);
    const people = peopleFor(merchant);
    const kind = REASONS[reason]?.checkType as CheckType;
    const suffix = `${Number(order.id.slice(-4))}-${slot}`;
    const item: CheckItem = {
      id: `CI-${suffix}`,
      checkType: kind,
      title: reasonName(reason),
      reasonCodes: [reason],
      evidenceIds: [`EV-${suffix}`],
      status: "PENDING",
      hasNewEvidence: false,
    };
    const subject = {
      name: merchant.legalName,
      aliases: [merchant.displayName],
      country: merchant.country,
      registrationNo: merchant.registrationNo,
      incorporatedAt: incorporationDate(
        merchant.country,
        merchant.registrationNo,
      ),
    };
    const registry = {
      registrationAuthority: merchant.registrationAuthority,
      legalName: merchant.legalName,
      registrationNo: merchant.registrationNo,
      status: "Active",
      incorporatedAt: incorporationDate(
        merchant.country,
        merchant.registrationNo,
      ),
      registeredAddress: addressIndex.get(merchant.id),
      directors: people
        .filter((person) => person.role.includes("董事"))
        .map((person) => person.name),
    };
    let fields: Evidence["fields"];
    let mediaRefs: Evidence["mediaRefs"] = [];
    switch (kind) {
      case "DATA_MATCH": {
        const address = reason === "KYB-REG-ADDR";
        fields = {
          rows: [
            {
              field: address ? "注册地址" : "法定名称",
              declared: address
                ? addressIndex.get(merchant.id)!.replace(/\d+/, "10")
                : merchant.legalName.replace(
                    / (Ltd|Limited|GmbH|Pte\. Ltd\.)$/,
                    "",
                  ),
              evidence: address
                ? addressIndex.get(merchant.id)
                : merchant.legalName,
              source: merchant.registrationAuthority,
              difference: address
                ? "门牌号与登记记录不一致"
                : "申报名称省略法律形式，与登记全称不同",
              tolerance: "超出自动容差，需人工确认",
            },
          ],
          registry,
          documents: [registryFile(merchant)],
        };
        break;
      }
      case "SCREENING_WATCHLIST":
        fields = {
          subject,
          hits: [
            {
              id: `hit_${suffix.replace("-", "")}a`,
              name: merchant.legalName.replace(/ Limited$/, " Trading Co."),
              aliases: [merchant.displayName],
              country: merchant.country === "HK" ? "SG" : "HK",
              registrationNo:
                merchant.country === "HK" ? "200715894W" : "2871459",
              incorporatedAt: date(-4500),
              listName: "OFAC SDN List",
              listedAt: date(-120),
              strength: "MEDIUM",
              reason: "名称相似，注册标识与日期待核对",
            },
          ],
        };
        break;
      case "SCREENING_MEDIA":
        fields = {
          articles: [
            {
              id: `article_${suffix}a`,
              title:
                reason === "SCR-AM-HIGH"
                  ? `${merchant.legalName} faces safety investigation`
                  : `${merchant.legalName} completes product recall`,
              source: "Regional Commerce Review",
              date: date(-25),
              topic:
                reason === "SCR-AM-HIGH"
                  ? "重大产品安全调查"
                  : "产品质量与召回",
              severity: reason === "SCR-AM-HIGH" ? "HIGH" : "LOW",
              summary:
                reason === "SCR-AM-HIGH"
                  ? "监管机构因多起伤害报告调查该公司的供应链和产品安全记录，涉事批次仍在召回；需核实公司责任与整改结果。"
                  : "监管机构记录了批次召回；报道显示公司已通知客户，退款和供应链整改仍需核实。",
              url: `https://commerce-review.example/reports/${merchant.id.toLowerCase()}`,
            },
            {
              id: `article_${suffix}b`,
              title: "Similar-name retailer settles delivery dispute",
              source: "Market Bulletin",
              date: date(-140),
              topic: "消费纠纷",
              severity: "LOW",
              summary:
                "同名零售企业的历史物流纠纷，文中注册标识不同，需要确认是否为同一主体。",
              url: `https://market-bulletin.example/archive/${merchant.id.toLowerCase()}`,
            },
          ],
        };
        break;
      case "IDENTITY_MEDIA": {
        const expiry = date(1095);
        const holder = people[0];
        const number = `K${String(Number(order.applicationId.slice(4)) * 91).padStart(7, "0")}`;
        const front = file(
          merchant,
          `Passport_${holder.name.replace(/ /g, "_")}_photo.jpg`,
        );
        const back = file(
          merchant,
          `Passport_${holder.name.replace(/ /g, "_")}_endorsements.jpg`,
        );
        const selfie = file(
          merchant,
          `Identity_${holder.name.replace(/ /g, "_")}_live_frame.jpg`,
        );
        fields = {
          document: {
            type: "护照",
            country: merchant.country,
            lastFour: number.slice(-4),
            expiresAt: expiry,
            holderName: holder.name,
          },
          checks: [
            { name: "证件有效期", passed: true, reason: "证件处于有效期" },
            {
              name: "版面一致性",
              passed: false,
              reason: "出生日期区域字体基线与相邻字段不一致",
              mediaId: `media_${suffix}_1`,
              region: { x: 4.4, y: 38.2, width: 64, height: 7.2 },
            },
            { name: "人脸相似度", passed: true, reason: "相似度 96.4%" },
            { name: "活体检测", passed: true, reason: "动作序列完整" },
          ],
        };
        mediaRefs = [front, back, selfie].map((uploaded, index) => ({
          id: `media_${suffix}_${index + 1}`,
          label: ["证件正面", "证件附页", "自拍帧"][index],
          file: uploaded,
          url: uploaded.url,
        }));
        break;
      }
      case "ASSOCIATED_PERSONS": {
        const undeclared = people[2];
        undeclared.declared = false;
        undeclared.role = "董事 / 授权签字人";
        const entry = (person: Person, source: string) => ({
          name: person.name,
          role: person.role,
          ownershipPct: person.ownershipPct,
          startDate: date(-900),
          source,
        });
        fields = {
          declared: people
            .filter((person) => person.declared)
            .map((person) => entry(person, "商户申报")),
          reported: people.map((person) =>
            entry(person, merchant.registrationAuthority),
          ),
        };
        break;
      }
      case "CLASSIFICATION": {
        const screenshot = file(
          merchant,
          `Storefront_${merchant.registrationNo.replace(/\W/g, "")}.jpg`,
        );
        fields = {
          declaredMcc: merchant.declaredMcc,
          reportedMcc:
            merchant.declaredMcc === "4722"
              ? "7011"
              : merchant.declaredMcc === "5732"
                ? "5734"
                : "5999",
          confidence: 0.84,
          onlinePresence:
            "网站可访问，商品目录、价格和客服渠道完整；分类依据为最近抓取的商品页。",
          riskLevel: merchant.mccRisk,
          screenshots: [{ title: "商品目录与价格", url: screenshot.url }],
        };
        break;
      }
      case "WEBSITE": {
        const screenshot = file(
          merchant,
          `Website_Contact_Terms_${merchant.id}.jpg`,
        );
        fields = {
          accessible: true,
          domainCreatedAt: date(-640),
          ownerMatches: true,
          keywords: [merchant.declaredMcc, "线上交易"],
          policies: { refund: false, contact: true, terms: true },
          screenshots: [{ title: "客服与交易条款", url: screenshot.url }],
        };
        break;
      }
      case "SCHEME_LIST":
        fields = {
          subject,
          record: {
            ...subject,
            id: `match_${suffix}`,
            listName: "Card Scheme Merchant Alert",
            listedAt: date(-670),
            strength: "HIGH",
            reason: "历史拒付率超阈值，收单关系终止后商户提交整改材料",
            matchedPerson: people[0].name,
          },
        };
        break;
      case "OWNERSHIP":
        fields = {
          nodes: [
            {
              id: merchant.id,
              name: merchant.legalName,
              ownershipPct: 100,
              type: "COMPANY",
              verified: true,
            },
            {
              id: `${merchant.id}-holding`,
              parentId: merchant.id,
              name: `${merchant.legalName.split(" ")[0]} Holdings`,
              ownershipPct: 65,
              type: "COMPANY",
              verified: false,
            },
            {
              id: people[0].id,
              parentId: `${merchant.id}-holding`,
              name: people[0].name,
              ownershipPct: 100,
              type: "PERSON",
              verified: false,
            },
            {
              id: people[1].id,
              parentId: merchant.id,
              name: people[1].name,
              ownershipPct: 35,
              type: "PERSON",
              verified: true,
            },
          ],
          documents: [
            file(merchant, `Shareholding_Schedule_${merchant.id}.jpg`),
          ],
        };
        break;
      case "LINKED_ENTITY": {
        const blacklist = reason === "INT-BLOCK-FUZZY";
        const recordNo = `${blacklist ? "INT-BL" : "INT-APP"}-${String(Number(order.id.slice(-4)) + 730100)}`;
        const historicalRegistrationNo = registrationNumber(
          merchant.country,
          `historical:${merchant.id}`,
        );
        const bank = {
          GB: "Barclays",
          SG: "DBS",
          HK: "HSBC",
          DE: "Commerzbank",
        }[merchant.country];
        const account = `${bank} •••• ${1000 + jitter(`${merchant.id}:account`, 9000)}`;
        fields = {
          matchBasis: blacklist
            ? `同一董事：${people[0].name}；注册地址与收款账户一致，登记编号不同，需确认关联关系`
            : "法定名称相似，登记编号与董事信息不同，需排除重复申请。",
          subject: {
            ...subject,
            website: merchant.website,
            director: people[0].name,
            address: addressIndex.get(merchant.id),
            account,
          },
          matched: {
            id: `historic_${suffix}`,
            recordNo,
            name: `${merchant.legalName.split(" ")[0]} Wholesale ${{ GB: "Ltd", SG: "Pte. Ltd.", HK: "Limited", DE: "GmbH" }[merchant.country]}`,
            country: merchant.country,
            registrationNo: historicalRegistrationNo,
            website: merchant.website.replace("https://", "https://wholesale."),
            director: blacklist ? people[0].name : people[2].name,
            address: blacklist
              ? addressIndex.get(merchant.id)
              : `48 ${JURISDICTIONS[merchant.country].address}`,
            account: blacklist
              ? account
              : `${bank} •••• ${1000 + jitter(`${merchant.id}:historical-account`, 9000)}`,
            matchedFields: blacklist ? ["director", "address", "account"] : [],
            status: "CLOSED",
            decision: blacklist ? "DECLINED" : "WITHDRAWN",
            history: blacklist
              ? "历史申请因商户资质不符合准入要求被拒绝；本次仅为关联待核实，不代表当前申请已作出决定。"
              : "历史申请由商户撤回，本次需确认是否为不同法律主体。",
            incorporatedAt: incorporationDate(
              merchant.country,
              historicalRegistrationNo,
            ),
          },
        };
        break;
      }
      case "MANUAL_VERIFY":
        fields = {
          missing: [
            {
              name: "企业登记实时报告",
              reason:
                "登记服务维护；技术工单已确认本工作日无法恢复，需使用官方摘录完成核验。",
            },
          ],
          materials: [registryFile(merchant)],
        };
        break;
      default:
        throw new Error(`Unsupported evidence reason: ${reason}`);
    }
    const evidence: Evidence = {
      id: item.evidenceIds[0],
      applicationId: order.applicationId,
      kind,
      sourceRef:
        kind === "LINKED_ENTITY"
          ? fields.matched.recordNo
          : personaRef(
              kind.startsWith("SCREENING") ? "rep" : "inq",
              `${order.applicationId}:${slot}`,
            ),
      generatedAt: new Date(
        Date.parse(order.createdAt) - 10 * 60_000,
      ).toISOString(),
      fields: { ...fields, ...overrides },
      mediaRefs,
    };
    store.evidence.push(evidence);
    order.checkItems!.push(item);
    return item;
  }

  function decided(
    order: WorkOrder,
    item: CheckItem,
    conclusion: string,
    reason: string,
  ) {
    Object.assign(item, {
      status: "DECIDED",
      conclusion,
      conclusionReason: reason,
      decidedBy: reviewer,
      decidedAt: new Date(
        Date.parse(order.createdAt) +
          17 * 60_000 +
          jitter(`decision:${item.id}`, 21 * 60_000),
      ).toISOString(),
    });
  }

  function supplement(
    number: number,
    app: Application,
    status: Status,
    parent?: WorkOrder,
  ): WorkOrder {
    const order = addOrder(number, app, "SUPPLEMENT", status, ops);
    order.parentId = parent?.id;
    order.merchantToken = crypto.randomUUID();
    order.extensions = [];
    order.contactLog = [];
    order.remindersSent = status === "WAITING_MERCHANT" ? 1 : 0;
    const reason = parent?.checkItems?.[0]?.reasonCodes[0] ?? "KYB-REG-ADDR";
    const templates: Record<string, { note: string }> = {
      "KYB-REG-ADDR": {
        note: "核对地址证明的主体、完整地址及签发日期，不接受邮政信箱地址。",
      },
      "KYB-REG-NAME": {
        note: "核对证书法定名称与申请表；如使用商业简称，请同时收集名称关联说明。",
      },
      "KYB-AP-UNDECLARED": {
        note: "收集完整董事名册、任职日期及授权范围，不向商户披露内部核验来源。",
      },
      "KYB-UBO-COMPLEX": {
        note: "核对每层持股总额、穿透路径和签章；不要仅收取最上层控股公司资料。",
      },
      "WEB-MISMATCH": {
        note: "核对退款条件、联系渠道及网站可访问性，材料应对应本申请的网站。",
      },
      "KYC-ID-TAMPER": {
        note: "仅收集重新拍摄的证件，不披露内部影像校验结果；后续由合规核验。",
      },
      "SYS-REPORT-DELAYED": {
        note: "核对官方摘录的签发机关、日期与查验信息，用于补齐登记证明。",
      },
    };
    const template = templates[reason] ?? templates["KYB-REG-ADDR"];
    order.noteToOps = template.note;
    order.items = [
      {
        id: `SI-${number}-1`,
        sourceWorkOrderId: parent?.id ?? order.id,
        source:
          parent?.type === "CHANNEL"
            ? "CHANNEL"
            : parent
              ? "COMPLIANCE"
              : "AUTO",
        checkItemId: parent?.checkItems?.[0]?.id,
        reasonCode: reason,
        externalText: {
          ...REASONS[templates[reason] ? reason : "KYB-REG-ADDR"].externalText,
        },
        actionType: reason === "KYC-ID-TAMPER" ? "REVERIFY" : "UPLOAD",
        targetPersonId:
          reason === "KYC-ID-TAMPER"
            ? peopleFor(merchantFor(app.id))[0].id
            : undefined,
        status:
          status === "TO_SEND"
            ? "PENDING"
            : status === "TO_CHECK" || status === "DONE"
              ? "PROVIDED"
              : "SENT",
      },
    ];
    if (reason === "KYC-ID-TAMPER")
      peopleFor(merchantFor(app.id))[0].needsReverify = true;
    if (status !== "TO_SEND") {
      order.sentAt = new Date(
        Date.parse(order.createdAt) + 20 * 60_000,
      ).toISOString();
      order.dueAt = new Date(Date.parse(order.sentAt) + 7 * DAY).toISOString();
      order.contactLog.push({
        id: `CL-${number}-1`,
        at: order.sentAt,
        channel: "EMAIL",
        summary: "已向登记联系人发送资料补充通知。",
        by: ops,
      });
    }
    if (status === "TO_CHECK" || status === "DONE") {
      const merchant = merchantFor(app.id);
      order.items[0].files = [
        file(
          merchant,
          `Address_Statement_${merchant.registrationNo.replace(/\W/g, "")}.jpg`,
          { uploadedAt: iso(-40 * 60_000) },
        ),
      ];
      if (status === "DONE")
        Object.assign(order.items[0], {
          checked: true,
          checkedBy: ops,
          checkedAt: order.closedAt,
        });
    }
    if (
      status === "WAITING_MERCHANT" ||
      status === "TO_CHECK" ||
      status === "TO_SEND"
    )
      app.externalStatus = "资料待补充";
    return order;
  }

  function channel(
    number: number,
    app: Application,
    status: Status,
    risk = false,
    unmapped = false,
    receiptType: "REJECTED" | "MORE_INFO" = risk || unmapped
      ? "REJECTED"
      : "MORE_INFO",
  ): WorkOrder {
    moveApplication(app, "CHANNEL", "审核中", status);
    const order = addOrder(
      number,
      app,
      "CHANNEL",
      status,
      status === "QUEUED" ? undefined : ops,
      [
        risk
          ? "CH-REJECT-POLICY"
          : receiptType === "REJECTED"
            ? "CH-REJECT-DOCS"
            : "CH-MORE-INFO",
      ],
    );
    const id = `SUB-${number}`;
    order.channelSubmissionId = id;
    const merchant = merchantFor(app.id);
    const director = peopleFor(merchant)[0];
    const certificate = registryFile(merchant);
    const identity = file(merchant, `Director_Identity_${merchant.id}.jpg`);
    const address = file(merchant, `Address_Proof_${merchant.id}.jpg`);
    store.submissions.push({
      id,
      applicationId: app.id,
      channelId: "acq_harbour",
      channelName: "海港收单",
      submissionNo: `HBA-${String(number + 470000)}`,
      status:
        status === "WAITING_CHANNEL"
          ? "SUBMITTED"
          : status === "CLOSED"
            ? "APPROVED"
            : "ACTION_REQUIRED",
      submittedAt: new Date(Date.parse(order.createdAt) - HOUR).toISOString(),
      receiptAt: new Date(
        Date.parse(order.createdAt) - 5 * 60_000,
      ).toISOString(),
      receiptType,
      upstreamCode: risk
        ? "R17"
        : unmapped
          ? receiptType === "REJECTED"
            ? "U73"
            : "B42"
          : "D16",
      upstreamReasonRaw: risk
        ? "Merchant risk review: declared business requires enhanced compliance assessment."
        : receiptType === "REJECTED"
          ? "Submission rejected: signatory authorisation requires review under local acquiring policy."
          : "Please provide a registered business address document issued within the last 3 months.",
      requiredDocuments: risk
        ? []
        : receiptType === "REJECTED"
          ? ["有效的董事签字授权书"]
          : ["近三个月的注册地址证明"],
      mappedReasonCode: unmapped
        ? undefined
        : risk
          ? "CH-REJECT-POLICY"
          : "CH-MORE-INFO",
      isRiskType: risk,
      documents: [
        {
          name: "公司注册证书",
          value: merchant.registrationNo,
          file: certificate,
        },
        { name: "董事身份证件", value: director.name, file: identity },
        {
          name: "注册地址证明",
          value: addressIndex.get(merchant.id)!,
          file: address,
        },
      ],
    });
    return order;
  }

  for (const [number, profile] of SCENARIO_PROFILES)
    addApplication(88200 + number, profile);
  const scenarioApp = (number: number) =>
    applicationIndex.get(`APP-${88200 + number}`)!;
  const s1 = addOrder(1, scenarioApp(1), "QA", "QUEUED");
  moveApplication(scenarioApp(1), "LIVE", "已通过", "APPROVED");
  scenarioApp(1).autoDecision = "APPROVED";
  scenarioApp(1).decision = "APPROVED";
  store.qa[s1.id] = {
    id: `QA-${s1.id}`,
    sampledObjectId: s1.applicationId,
    snapshotId: `SNAP-${s1.id}`,
    reviewMode: "APPLICATION",
    batchId: "BATCH-DAILY-17",
    sampledAt: s1.createdAt,
    originalConclusions: { overall: "APPROVED" },
  };

  const s2 = addOrder(2, scenarioApp(2), "REVIEW", "QUEUED", undefined, [
    "SCR-WL-POTENTIAL",
  ]);
  const s2Item = addEvidence(s2, "SCR-WL-POTENTIAL", 1);
  const s2Evidence = store.evidence.find(
    (evidence) => evidence.id === s2Item.evidenceIds[0],
  )!;
  s2Evidence.fields.hits.push({
    id: "hit_21b",
    name: "Beichen Cross-Border Commerce Limited",
    aliases: ["北辰商贸"],
    country: "HK",
    registrationNo: "2165834",
    incorporatedAt: date(-4100),
    listName: "UK Sanctions List",
    listedAt: date(-260),
    strength: "MEDIUM",
    reason: "名称相同但公司编号不同",
  });

  const s3 = addOrder(3, scenarioApp(3), "REVIEW", "QUEUED", undefined, [
    "KYB-REG-NAME",
    "KYB-REG-ADDR",
  ]);
  addEvidence(s3, "KYB-REG-NAME", 1, {
    rows: [
      {
        field: "法定名称",
        declared: "Qinghe Home Ltd",
        evidence: "Qinghe Home Furnishings Ltd",
        source: "Companies House",
        difference: "申报简称省略 Furnishings",
        tolerance: "需人工确认商业简称与法律主体关系",
      },
    ],
  });
  addEvidence(s3, "KYB-REG-ADDR", 2);

  const s4 = addOrder(4, scenarioApp(4), "REVIEW", "IN_PROGRESS", reviewer, [
    "CLS-MCC-MISMATCH",
  ]);
  s4.approvalReasons = ["CLS-HIGH-RISK", "INT-PEP"];
  s4.requiresDual = true;
  s4.complianceNote = `${peopleFor(merchantFor(s4.applicationId))[0].name} 为现任公职人员的近亲属，申报和独立登记资料一致，需高级管理层双人审批。`;
  const s4Item = addEvidence(s4, "CLS-MCC-MISMATCH", 1);
  decided(s4, s4Item, "KEEP_MCC", "申报符合实际经营");

  const s5 = addOrder(5, scenarioApp(5), "REVIEW", "QUEUED", undefined, [
    "KYC-ID-TAMPER",
  ]);
  addEvidence(s5, "KYC-ID-TAMPER", 1);
  const s6 = addOrder(6, scenarioApp(6), "REVIEW", "QUEUED", undefined, [
    "SCR-WL-POTENTIAL",
  ]);
  const s6Item = addEvidence(s6, "SCR-WL-POTENTIAL", 1);
  const s6Evidence = store.evidence.find(
    (evidence) => evidence.id === s6Item.evidenceIds[0],
  )!;
  s6Evidence.fields.hits = [
    {
      ...s6Evidence.fields.subject,
      id: "hit_61a",
      listName: "OFAC SDN List",
      listedAt: date(-70),
      strength: "HIGH",
      reason: "名称、注册编号及成立日期一致",
    },
  ];
  channel(7, scenarioApp(7), "QUEUED", false, true, "MORE_INFO");
  const s8 = addOrder(8, scenarioApp(8), "REVIEW", "IN_PROGRESS", reviewer, [
    "KYB-REG-ADDR",
  ]);
  addEvidence(s8, "KYB-REG-ADDR", 1);
  s8.lateHardReject = "KYB-REG-INACTIVE";
  const s8Evidence = store.evidence.find(
    (evidence) => evidence.id === s8.checkItems![0].evidenceIds[0],
  )!;
  s8Evidence.fields.registry.status = "Dissolved";
  s8Evidence.fields.registry.dissolvedAt = date(-1);
  s8Evidence.generatedAt = iso(-15 * 60_000);
  const s8Merchant = merchantFor(s8.applicationId);
  s8Evidence.fields.documents = [
    file(s8Merchant, "Companies_House_Status_Update.jpg", {
      uploadedAt: s8Evidence.generatedAt,
    }),
  ];
  s8.hasNewEvidence = true;
  s8.checkItems![0].hasNewEvidence = true;
  const s9 = supplement(9, scenarioApp(9), "TO_CHECK");
  s9.noteToOps =
    "自助补件已进入人工齐套检查，请分别检查地址证明与商业登记文件。";
  const s9Merchant = merchantFor(s9.applicationId);
  s9.items!.push({
    id: "SI-9-2",
    sourceWorkOrderId: s9.id,
    source: "AUTO",
    reasonCode: "DOC-UNUSABLE",
    externalText: { ...REASONS["DOC-UNUSABLE"].externalText },
    actionType: "UPLOAD",
    status: "PROVIDED",
    files: [
      file(s9Merchant, "Haixi_Beauty_Business_Profile_201544318W.jpg", {
        uploadedAt: iso(-40 * 60_000),
      }),
    ],
  });
  const s10 = supplement(10, scenarioApp(6), "DONE", s6);
  s10.scenario = "S10";
  s10.items![0].reasonCode = "SCR-WL-POTENTIAL";
  s10.noteToOps = "已收齐公司登记资料，无需再次联系商户。";
  const s11 = addOrder(11, scenarioApp(11), "REVIEW", "QUEUED", undefined, [
    "SYS-REPORT-DELAYED",
  ]);
  addEvidence(s11, "SYS-REPORT-DELAYED", 1);
  s11.missingEvidence = ["企业登记实时报告"];
  channel(12, scenarioApp(12), "IN_PROGRESS", true);
  for (const order of store.orders)
    if (!order.scenario) order.scenario = `S${Number(order.id.slice(-4))}`;

  // Each business has one distinct trading identity, not a brand/country product.
  const merchantProfiles: [string, string][] = [
    ["Morrow & Finch", "5712"],
    ["Tamarind Pantry", "5499"],
    ["Pixelhaven Electronics", "5732"],
    ["Kestrel Running Club", "5941"],
    ["Seabrook Booksellers", "5942"],
    ["Nacre Beauty Collective", "5977"],
    ["Hearthstone Atelier", "5719"],
    ["Copperleaf Kitchenware", "5722"],
    ["Mariner Coffee Works", "5499"],
    ["Brindle Outdoor Supply", "5941"],
    ["Fable Paper House", "5943"],
    ["Oakwell Furnishings", "5712"],
    ["Velvet Orchard Skincare", "5977"],
    ["Circuit Grove", "5732"],
    ["Lantern Print Studio", "7333"],
    ["Dovetail Office Tools", "5734"],
    ["Harbourline Records", "5735"],
    ["Magnolia Ceramics", "5719"],
    ["Bramble Pet Provision", "5995"],
    ["Wrenwood Textiles", "5691"],
    ["Ashcombe Home", "5712"],
    ["Saffron Market", "5499"],
    ["Nightjar Audio", "5732"],
    ["Caldera Cycling", "5941"],
    ["Foxglove Press", "5942"],
    ["Solstice Botanical Care", "5977"],
    ["Pebble & Reed", "5719"],
    ["Blue Quay Appliances", "5722"],
    ["Acorn Stationers", "5943"],
    ["Meadowlark Apparel", "5691"],
    ["Raster Cloud Systems", "5734"],
    ["Baywater Pet Company", "5995"],
    ["Oriel Design Partners", "7333"],
    ["Longshore Music Shop", "5735"],
    ["Sundial Roastery", "5499"],
    ["Juniper Lane Furniture", "5712"],
    ["Ridgeway Climbing Supply", "5941"],
    ["Cedar Ledger Books", "5942"],
    ["Tidal Bloom Cosmetics", "5977"],
    ["Peregrine Sound", "5732"],
    ["Elmbridge Linen", "5691"],
    ["Portico Tableware", "5719"],
    ["Mossfield Provisions", "5499"],
    ["Aster Codeworks", "5734"],
    ["Walnut Street Cabinetry", "5712"],
    ["Larkspur Art Direction", "7333"],
    ["Ironbark Sporting Goods", "5941"],
    ["Brookstone Animal Care", "5995"],
    ["Vellum Writing Supplies", "5943"],
    ["Wharfside Kitchen Electrics", "5722"],
    ["Apricity Record Store", "5735"],
    ["Hawthorn Reading Room", "5942"],
    ["Compass Rose Journeys", "4722"],
    ["Silver Coast Expeditions", "4722"],
    ["Windward Passage Holidays", "4722"],
    ["Alpine Lantern Travel", "4722"],
    ["Mistral Route Planning", "4722"],
    ["Orchid Rail Adventures", "4722"],
    ["Cairn & Coast Tours", "4722"],
    ["Sandpiper Island Escapes", "4722"],
    ["Amber Trail Experiences", "4722"],
    ["Crescent Harbor Voyages", "4722"],
    ["Everglade Trip Studio", "4722"],
    ["Polaris Walking Holidays", "4722"],
    ["Terracotta City Breaks", "4722"],
    ["Snowcap Itineraries", "4722"],
    ["Indigo Passage Tours", "4722"],
    ["Morning Tide Getaways", "4722"],
    ["Kitehouse Living", "5719"],
    ["Pomegranate Food Hall", "5499"],
    ["Westhaven Desk Company", "5712"],
    ["Redwood Trail Outfitters", "5941"],
    ["Paperboat Publishing", "5942"],
    ["Harborbell Wellness Beauty", "5977"],
    ["Trellis Consumer Devices", "5732"],
    ["Cobalt Thread Studio", "5691"],
    ["Gannet Digital Editions", "5815"],
    ["Honeycomb Bakehouse", "5499"],
    ["Quartz Productivity Software", "5734"],
    ["Flint & Fern Ceramics", "5719"],
    ["Mallow Companion Supplies", "5995"],
    ["Bowerhouse Illustration", "7333"],
    ["Aurelia Vinyl Exchange", "5735"],
    ["Reedbank Office Paper", "5943"],
    ["Arcadia Download Library", "5815"],
    ["Strandwell Woodworks", "5712"],
    ["Wisteria Homeware", "5719"],
  ];
  const businessProfiles: Record<string, string> = {
    "5712": "家具零售，提供餐桌、书柜与本地组装配送。",
    "5719": "餐具、陶瓷和室内装饰用品线上零售。",
    "5722": "厨房小家电零售，提供保修与安装服务。",
    "5732": "消费电子、耳机和电脑外设零售。",
    "5734": "办公软件许可和企业效率工具订阅。",
    "5735": "唱片及音频制品零售，实体库存发货。",
    "5499": "咖啡、烘焙和包装食品零售。",
    "5941": "自行车、户外装备与运动用品零售。",
    "5942": "图书出版物零售，提供纸质书配送。",
    "5943": "办公文具、纸张和书写用品零售。",
    "5977": "护肤品、彩妆与个人护理用品零售。",
    "5995": "宠物食品和日常护理用品零售。",
    "5691": "服装和家用纺织品零售，自营库存。",
    "7333": "商业插画、品牌视觉和印刷设计服务。",
    "4722": "机票代理、导览行程与预付旅行套餐服务。",
    "5815": "数字图书、音乐及创意素材付费下载。",
  };
  let profileSequence = 0;
  function extraApplication(number: number): Application {
    const index = profileSequence++;
    const [name, mcc] = merchantProfiles[index];
    const country = ["GB", "SG", "HK", "DE"][index % 4];
    const suffix = { GB: "Ltd", SG: "Pte. Ltd.", HK: "Limited", DE: "GmbH" }[
      country
    ];
    const registrationNo = registrationNumber(country, `application:${number}`);
    const application = addApplication(number, {
      displayName: name,
      legalName: `${name} ${suffix}`,
      country,
      registrationNo,
      mcc,
      volume:
        18000 + jitter(`volume:${number}`, mcc === "4722" ? 380000 : 160000),
      domain: name.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-"),
      business: businessProfiles[mcc],
    });
    application.isKeyMerchant = index % 11 === 0;
    return application;
  }

  // Unclaimed review work: all evidence kinds are distributed across focused cases.
  const reviewReasons = [
    "KYB-REG-ADDR",
    "KYB-AP-UNDECLARED",
    "CLS-MCC-MISMATCH",
    "WEB-MISMATCH",
    "INT-SCHEME-LIST",
    "KYB-UBO-COMPLEX",
    "INT-BLOCK-FUZZY",
    "SCR-AM-HIGH",
    "SCR-AM-LOW",
    "SCR-WL-POTENTIAL",
    "KYB-REG-NAME",
    "KYB-REG-ADDR",
    "KYB-AP-UNDECLARED",
    "CLS-MCC-MISMATCH",
    "WEB-MISMATCH",
    "KYB-UBO-COMPLEX",
    "INT-DUPLICATE",
    "SCR-WL-POTENTIAL",
    "KYB-REG-NAME",
    "KYB-REG-ADDR",
  ];
  for (let index = 0; index < 20; index++) {
    const app = extraApplication(88400 + index);
    const order = addOrder(100 + index, app, "REVIEW", "QUEUED", undefined, [
      reviewReasons[index],
    ]);
    addEvidence(order, reviewReasons[index], 1);
  }

  const supplementReasons = [
    "KYB-REG-ADDR",
    "KYB-REG-NAME",
    "KYB-AP-UNDECLARED",
    "KYB-UBO-COMPLEX",
    "WEB-MISMATCH",
    "KYC-ID-TAMPER",
    "SYS-REPORT-DELAYED",
  ];

  // Every pending operational request has its own waiting compliance source.
  for (let index = 0; index < 16; index++) {
    const app = extraApplication(88420 + index);
    const parent = addOrder(
      200 + index,
      app,
      "REVIEW",
      "WAITING_SUPPLEMENT",
      reviewer,
      [supplementReasons[index % supplementReasons.length]],
    );
    const check = addEvidence(
      parent,
      supplementReasons[index % supplementReasons.length],
      1,
    );
    const outcome: Record<string, [string, string]> = {
      DATA_MATCH: [
        "REQUEST_INFO",
        check.reasonCodes[0] === "KYB-REG-ADDR" ? "地址证明" : "注册文件",
      ],
      ASSOCIATED_PERSONS: ["ADD_PERSON", "未申报关联人"],
      OWNERSHIP: ["REQUEST_OWNERSHIP", "股权链条不完整"],
      WEBSITE: ["RECTIFY", "缺少退款政策"],
      IDENTITY_MEDIA: ["REVERIFY", "身份待确认"],
      MANUAL_VERIFY: ["REQUEST_INFO", "核验材料不足"],
    };
    decided(parent, check, ...outcome[check.checkType]);
    const request = supplement(220 + index, app, "TO_SEND", parent);
    request.createdAt = new Date(
      Math.max(
        Date.parse(request.createdAt),
        Date.parse(check.decidedAt!) + 71_000,
      ),
    ).toISOString();
    request.enteredStatusAt = request.createdAt;
    request.slaDueAt = new Date(
      Date.parse(request.createdAt) + 4 * HOUR,
    ).toISOString();
    request.firstResponderAt = new Date(
      Date.parse(request.createdAt) + 10 * 60_000,
    ).toISOString();
  }

  // Restricted records have a frozen parent, never replace the actionable S6.
  for (let index = 0; index < 16; index++) {
    const app = extraApplication(88440 + index);
    const parent = addOrder(
      250 + index,
      app,
      "REVIEW",
      "COMPLIANCE_HOLD",
      reviewer,
      ["SCR-WL-POTENTIAL"],
    );
    const item = addEvidence(parent, "SCR-WL-POTENTIAL", 1);
    decided(parent, item, "UNCERTAIN", "关键信息缺失");
    const status: Status =
      index < 6 ? "QUEUED" : index < 12 ? "IN_PROGRESS" : "PENDING_SECOND";
    const restricted = addOrder(
      270 + index,
      app,
      "RESTRICTED",
      status,
      status === "QUEUED" ? undefined : head,
      ["SCR-WL-POTENTIAL"],
    );
    restricted.parentId = parent.id;
    restricted.checkItems = parent.checkItems!.map((check) => ({
      ...check,
      reasonCodes: [...check.reasonCodes],
      evidenceIds: [...check.evidenceIds],
    }));
    restricted.requiresDual = true;
    restricted.restrictedType = "名单待核实";
    restricted.restrictedReason =
      "多个身份字段相似，现有资料不足以排除关联，需负责人核实。";
    restricted.frozenAt = restricted.createdAt;
    parent.frozenAt = restricted.createdAt;
    restricted.restrictedActorIds =
      status === "PENDING_SECOND" ? [head.id] : [];
    if (status === "PENDING_SECOND") {
      restricted.pendingDecision = "DECLINE";
      store.restrictedDecisions.push({
        id: `RD-${index}`,
        workOrderId: restricted.id,
        decision: "DECLINE",
        reason: "登记标识已补充确认，提请第二人独立核实。",
        reviewers: [head],
        at: iso(-20 * 60_000),
      });
    }
    app.status = "COMPLIANCE_HOLD";
  }

  for (let index = 0; index < 16; index++) {
    const app = extraApplication(88460 + index);
    moveApplication(app, "APPROVAL", "审核中", "PENDING_APPROVAL");
    const order = addOrder(
      300 + index,
      app,
      "REVIEW",
      "PENDING_APPROVAL",
      reviewer,
      ["CLS-MCC-MISMATCH"],
    );
    order.approvalReasons =
      index % 4 === 0 ? ["CLS-HIGH-RISK", "INT-PEP"] : ["CLS-HIGH-RISK"];
    order.requiresDual = index % 4 === 0;
    order.approvalActorIds = [];
    const check = addEvidence(order, "CLS-MCC-MISMATCH", 1);
    decided(order, check, "KEEP_MCC", "申报符合实际经营");
    order.complianceNote =
      "已核对业务模式及退款条款；预付交易模式需审批确认敞口与保证金条件。";
  }

  for (let index = 0; index < 16; index++) {
    const app = extraApplication(88500 + index);
    const number = 400 + index * 3;
    if (index < 4) {
      const status: Status = [
        "WAITING_MERCHANT",
        "DONE",
        "CLOSED_NO_RESPONSE",
        "WITHDRAWN",
      ][index] as Status;
      const parent = addOrder(
        number,
        app,
        "REVIEW",
        index === 0 ? "WAITING_SUPPLEMENT" : "CLOSED",
        reviewer,
        ["KYB-REG-ADDR"],
      );
      const item = addEvidence(parent, "KYB-REG-ADDR", 1);
      decided(
        parent,
        item,
        index === 1 ? "ACCEPTABLE_DIFF" : "REQUEST_INFO",
        index === 1 ? "格式" : "地址证明",
      );
      const request = supplement(number + 1, app, status, parent);
      request.createdAt = new Date(
        Date.parse(parent.createdAt) + 30 * 60_000,
      ).toISOString();
      request.enteredStatusAt = request.createdAt;
      request.slaDueAt = new Date(
        Date.parse(request.createdAt) + 4 * HOUR,
      ).toISOString();
      request.sentAt = new Date(
        Date.parse(request.createdAt) + 20 * 60_000,
      ).toISOString();
      request.contactLog![0].at = request.sentAt;
      request.dueAt = new Date(
        Date.parse(request.sentAt) + 7 * DAY,
      ).toISOString();
      if (index === 0) {
        const firstExtendedDueAt = new Date(
          Date.parse(request.dueAt!) + 7 * DAY,
        ).toISOString();
        const secondExtendedDueAt = new Date(
          Date.parse(firstExtendedDueAt) + 7 * DAY,
        ).toISOString();
        request.extensions = [
          {
            id: "EXT-400-1",
            requestedBy: ops,
            originalDueAt: request.dueAt!,
            requestedDueAt: firstExtendedDueAt,
            reason: "登记机构尚未出具正式文件。",
            status: "APPROVED",
            approvedBy: ops,
            requestedAt: iso(-2 * HOUR),
            approvedAt: iso(-2 * HOUR),
          },
          {
            id: "EXT-400-2",
            requestedBy: ops,
            originalDueAt: firstExtendedDueAt,
            requestedDueAt: secondExtendedDueAt,
            reason: "商户已提供登记申请回执，申请追加七天。",
            status: "PENDING",
            requestedAt: iso(-HOUR),
          },
        ];
        request.dueAt = firstExtendedDueAt;
      } else {
        parent.outcome = index === 1 ? "APPROVED" : status;
        if (index === 1) moveApplication(app, "CHANNEL", "已通过", "APPROVED");
        else {
          app.status = status;
          app.externalStatus = "未通过";
          app.decision = status;
        }
      }
      if (index === 2) {
        const oldCreated = iso(-9 * DAY);
        parent.createdAt = oldCreated;
        parent.enteredStatusAt = oldCreated;
        parent.slaDueAt = iso(-7 * DAY);
        request.createdAt = iso(-9 * DAY + HOUR);
        request.sentAt = iso(-9 * DAY + 2 * HOUR);
        request.dueAt = iso(-2 * DAY + HOUR);
        request.slaDueAt = iso(-9 * DAY + 5 * HOUR);
        app.createdAt = iso(-10 * DAY);
        app.stageTimes = {
          SUBMITTED: app.createdAt,
          AUTO_CHECK: iso(-10 * DAY + HOUR),
          MANUAL_REVIEW: iso(-10 * DAY + 2 * HOUR),
        };
        parent.firstResponderAt = iso(-9 * DAY + 10 * 60_000);
        item.decidedAt = iso(-9 * DAY + 20 * 60_000);
        request.firstResponderAt = iso(-9 * DAY + 70 * 60_000);
        request.enteredStatusAt = request.closedAt!;
        request.contactLog![0].at = request.sentAt;
        const expiredEvidence = store.evidence.find(
          (evidence) => evidence.id === item.evidenceIds[0],
        )!;
        expiredEvidence.generatedAt = iso(-9 * DAY - 10 * 60_000);
        for (const document of expiredEvidence.fields
          .documents as UploadedFile[])
          document.uploadedAt = iso(-10 * DAY + 2 * HOUR);
      }
    } else if (index === 4) {
      const order = addOrder(number, app, "REVIEW", "IN_PROGRESS", reviewer, [
        "KYB-REG-ADDR",
      ]);
      const check = addEvidence(order, "KYB-REG-ADDR", 1);
      order.hasNewEvidence = true;
      check.hasNewEvidence = true;
    } else if (index >= 5 && index <= 9) {
      const status: Status = [
        "QUEUED",
        "WAITING_CHANNEL",
        "CLOSED",
        "WAITING_COMPLIANCE",
        "WAITING_SUPPLEMENT",
      ][index - 5] as Status;
      const order = channel(number, app, status, index === 8);
      if (index === 5) {
        const submission = store.submissions.find(
          (candidate) => candidate.id === order.channelSubmissionId,
        )!;
        submission.receiptType = "TIMEOUT";
        submission.upstreamCode = "T01";
        submission.upstreamReasonRaw =
          "No processing receipt received after two scheduled status enquiries.";
        submission.mappedReasonCode = "CH-TIMEOUT";
        submission.requiredDocuments = [];
        submission.lastReminderAt = new Date(
          Date.parse(order.createdAt) - 15 * 60_000,
        ).toISOString();
        order.reasonCodes = ["CH-TIMEOUT"];
      }
      if (index === 7) {
        order.outcome = "APPROVED";
        moveApplication(app, "LIVE", "已通过", "APPROVED");
      }
      if (index === 8) {
        const review = addOrder(
          number + 1,
          app,
          "REVIEW",
          "IN_PROGRESS",
          reviewer,
          ["WEB-MISMATCH"],
        );
        review.parentId = order.id;
        review.stage = "CHANNEL";
        addEvidence(review, "WEB-MISMATCH", 1);
      }
      if (index === 9) supplement(number + 1, app, "WAITING_MERCHANT", order);
    } else if (index <= 12) {
      moveApplication(app, "LIVE", "已通过", "APPROVED");
      app.autoDecision = "APPROVED";
      app.decision = "APPROVED";
      const status: Status = ["BLIND", "COMPARE", "CLOSED"][
        index - 10
      ] as Status;
      const order = addOrder(number, app, "QA", status, senior, [
        "KYB-REG-NAME",
      ]);
      const merchant = merchantFor(app.id);
      addEvidence(order, "KYB-REG-NAME", 1, {
        rows: [
          {
            field: "法定名称",
            declared: merchant.legalName,
            evidence: merchant.legalName,
            source: merchant.registrationAuthority,
            difference: "一致",
            tolerance: "核对法定名称与登记文件",
          },
        ],
      });
      store.qa[order.id] = {
        id: `QA-${number}`,
        sampledObjectId: app.id,
        snapshotId: `SNAP-${order.id}`,
        reviewMode: "APPLICATION",
        batchId: "BATCH-DAILY-17",
        sampledAt: order.createdAt,
        originalConclusions: { overall: "APPROVED" },
        blindConclusions: index >= 11 ? { overall: "APPROVED" } : undefined,
        consistent: index === 12 ? true : undefined,
      };
      if (index === 12) order.outcome = "CONSISTENT";
    } else if (index === 13) {
      const parent = addOrder(number, app, "REVIEW", "CLOSED", reviewer, [
        "SCR-WL-POTENTIAL",
      ]);
      const check = addEvidence(parent, "SCR-WL-POTENTIAL", 1);
      const confirmedEvidence = store.evidence.find(
        (evidence) => evidence.id === check.evidenceIds[0],
      )!;
      confirmedEvidence.fields.hits = [
        {
          ...confirmedEvidence.fields.subject,
          id: "hit_closed_1",
          listName: "OFAC SDN List",
          listedAt: date(-90),
          strength: "HIGH",
          reason: "登记编号及主体名称一致",
        },
      ];
      decided(parent, check, "TRUE_POSITIVE", "标识号一致");
      parent.outcome = "DECLINED";
      parent.restrictedResolved = true;
      const restricted = addOrder(
        number + 1,
        app,
        "RESTRICTED",
        "CLOSED",
        head,
        ["SCR-WL-POTENTIAL"],
      );
      restricted.parentId = parent.id;
      restricted.checkItems = structuredClone(parent.checkItems);
      restricted.outcome = "DECLINED";
      restricted.restrictedType = "名单确认命中";
      restricted.restrictedReason =
        "独立核实的登记编号和主体名称与名单记录一致。";
      restricted.restrictedActorIds = [head.id, "u_1202"];
      restricted.requiresDual = true;
      store.restrictedDecisions.push({
        id: "RD-CLOSED",
        workOrderId: restricted.id,
        decision: "DECLINE",
        reason: "两名负责人分别核对登记资料后确认命中。",
        reviewers: [head, user("u_1202")],
        at: restricted.closedAt!,
      });
      app.status = "DECLINED";
      app.decision = "DECLINED";
      app.externalStatus = "未通过";
    } else moveApplication(app, index === 14 ? "SUBMITTED" : "AUTO_CHECK");
  }

  const softReject = extraApplication(88390);
  const hardReject = extraApplication(88391);
  for (const [app, reason] of [
    [softReject, "CLS-PROHIBITED"],
    [hardReject, "KYB-REG-INACTIVE"],
  ] as const) {
    moveApplication(app, "AUTO_CHECK", "未通过", "DECLINED");
    app.autoDecision = "DECLINED";
    app.decision = "DECLINED";
    app.externalCategory =
      reason === "CLS-PROHIBITED" ? "经营类目" : "主体资质";
    store.triage.push({
      id: `TRI-${app.id}`,
      applicationId: app.id,
      outcome: "AUTO_DECLINED",
      reasonCodes: [reason],
      ruleVersion: RULE_VERSION,
      at: app.stageTimes.AUTO_CHECK!,
    });
    store.events.push({
      id: `RISK-${app.id}`,
      applicationId: app.id,
      reasonCode: reason,
      severity: "HIGH",
      source: "内部规则",
      evidenceIds: [],
      createdAt: app.stageTimes.AUTO_CHECK!,
    });
  }
  const mergeApp = extraApplication(88392);
  const mergeReview = addOrder(
    392,
    mergeApp,
    "REVIEW",
    "IN_PROGRESS",
    reviewer,
    ["KYB-REG-ADDR"],
  );
  addEvidence(mergeReview, "KYB-REG-ADDR", 1);
  mergeReview.stage = "CHANNEL";
  channel(393, mergeApp, "IN_PROGRESS", false, true);
  for (const order of store.orders.filter((order) => order.type === "CHANNEL"))
    store.submissions.push({
      id: `ALT-${order.id}`,
      applicationId: order.applicationId,
      channelId: "acq_northstar",
      channelName: "北极星收单",
      submissionNo: "",
      status: "AVAILABLE",
      submittedAt: applicationIndex.get(order.applicationId)!.createdAt,
      upstreamReasonRaw: "",
      requiredDocuments: [],
      documents: [],
    });

  store.channelMappings.push(
    {
      id: "MAP-R17",
      channelId: "acq_harbour",
      upstreamCode: "R17",
      rawReason:
        "Merchant risk review: digital content business requires enhanced compliance assessment.",
      reasonCode: "CH-REJECT-POLICY",
      isRiskType: true,
      createdBy: user("u_2101"),
    },
    {
      id: "MAP-D16",
      channelId: "acq_harbour",
      upstreamCode: "D16",
      rawReason:
        "Please provide a registered business address document issued within the last 3 months.",
      reasonCode: "CH-MORE-INFO",
      isRiskType: false,
      createdBy: user("u_2101"),
    },
  );

  // Finalize live state before deriving risk events, notifications and snapshots.
  s8.slaDueAt = iso(73 * 60_000 + jitter("s8-sla", 45_000));
  s4.slaDueAt = iso(112 * 60_000 + jitter("s4-sla", 45_000));
  const reviewOrders = store.orders.filter((order) => order.type === "REVIEW");
  const existingMulti = reviewOrders.filter(
    (order) => (order.checkItems?.length ?? 0) > 1,
  ).length;
  const enrich = reviewOrders
    .filter(
      (order) =>
        !order.scenario &&
        order.checkItems?.length === 1 &&
        [
          "QUEUED",
          "IN_PROGRESS",
          "WAITING_SUPPLEMENT",
          "PENDING_APPROVAL",
        ].includes(order.status),
    )
    .sort(
      (left, right) =>
        random(`checks:${left.id}`) - random(`checks:${right.id}`),
    )
    .slice(
      0,
      Math.max(0, Math.round(reviewOrders.length * 0.3) - existingMulti),
    );
  for (const [index, order] of enrich.entries()) {
    const reasons = (order.reasonCodes ??= []);
    const additional = ["KYB-REG-NAME", "KYB-REG-ADDR"]
      .filter((reason) => !reasons.includes(reason))
      .slice(0, index % 3 === 0 ? 2 : 1);
    for (const reason of additional) {
      const check = addEvidence(order, reason, order.checkItems!.length + 1);
      reasons.push(reason);
      if (["WAITING_SUPPLEMENT", "PENDING_APPROVAL"].includes(order.status))
        decided(order, check, "ACCEPTABLE_DIFF", "格式");
    }
  }
  // Sampling freezes the whole application dossier, not just exception evidence.
  for (const order of store.orders.filter(
    (candidate) =>
      candidate.type === "QA" &&
      store.qa[candidate.id].reviewMode === "APPLICATION",
  )) {
    const merchant = merchantFor(order.applicationId);
    const people = peopleFor(merchant);
    const samples: [string, string][] = [
      ["KYB-REG-NAME", "主体登记资料"],
      ["KYC-ID-TAMPER", "身份核验影像"],
      ["CLS-MCC-MISMATCH", "经营类目与商品目录"],
      ["WEB-MISMATCH", "经营网站与交易条款"],
      ["KYB-UBO-COMPLEX", "股东名册与受益所有人"],
      ["SYS-REPORT-DELAYED", "名单与公开资料检索记录"],
    ];
    for (const [index, [reason, title]] of samples.entries()) {
      const check =
        order.checkItems?.[index] ?? addEvidence(order, reason, index + 1);
      check.title = title;
      check.reasonCodes = [];
      check.status = "PENDING";
      const evidence = store.evidence.find(
        (entry) => entry.id === check.evidenceIds[0],
      )!;
      if (check.checkType === "DATA_MATCH") {
        evidence.fields.rows = [
          ["法定名称", merchant.legalName],
          ["登记编号", merchant.registrationNo],
          ["注册地址", addressIndex.get(merchant.id)!],
        ].map(([field, value]) => ({
          field,
          declared: value,
          evidence: value,
          source: merchant.registrationAuthority,
          difference: "一致",
          tolerance: "核对登记原件",
        }));
      } else if (check.checkType === "IDENTITY_MEDIA") {
        evidence.fields.checks = [
          { name: "证件有效期", passed: true, reason: "证件处于有效期" },
          { name: "版面一致性", passed: true, reason: "字段与证件版式一致" },
          { name: "人脸相似度", passed: true, reason: "相似度 98.2%" },
          { name: "活体检测", passed: true, reason: "动作序列完整" },
        ];
      } else if (check.checkType === "CLASSIFICATION") {
        evidence.fields.reportedMcc = merchant.declaredMcc;
        evidence.fields.confidence = 0.98;
      } else if (check.checkType === "WEBSITE") {
        evidence.fields.policies = { refund: true, contact: true, terms: true };
      } else if (check.checkType === "OWNERSHIP") {
        evidence.fields.nodes = [
          {
            id: merchant.id,
            name: merchant.legalName,
            ownershipPct: 100,
            type: "COMPANY",
            verified: true,
          },
          ...people
            .filter((person) => person.ownershipPct)
            .map((person) => ({
              id: person.id,
              parentId: merchant.id,
              name: person.name,
              ownershipPct: person.ownershipPct,
              type: "PERSON",
              verified: true,
            })),
        ];
        evidence.fields.documents = [
          file(merchant, `Beneficial_Ownership_${merchant.id}.jpg`),
        ];
      } else if (check.checkType === "MANUAL_VERIFY") {
        evidence.fields.missing = [];
        evidence.fields.materials = [
          registryFile(merchant),
          file(merchant, `Public_Records_Search_${merchant.id}.jpg`),
        ];
      }
    }
    order.reasonCodes = [];
    // Auto decisions are sampled at application level, never as manual judgments.
    order.checkItems = [];
  }

  // Two active cases retain their elapsed SLA, including one in a personal queue.
  for (const [number, overdueMinutes] of [
    [100, 95],
    [412, 42],
  ]) {
    const order = store.orders.find(
      (candidate) => candidate.id === orderId(number),
    )!;
    const duration = order.priority === "HIGH" ? DAY : 2 * DAY;
    order.createdAt = iso(-duration - overdueMinutes * 60_000);
    order.enteredStatusAt = order.createdAt;
    order.slaDueAt = iso(-overdueMinutes * 60_000);
    if (order.assignee)
      order.firstResponderAt = new Date(
        Date.parse(order.createdAt) + 10 * 60_000,
      ).toISOString();
    for (const evidence of store.evidence.filter(
      (entry) => entry.applicationId === order.applicationId,
    ))
      evidence.generatedAt = new Date(
        Date.parse(order.createdAt) - 10 * 60_000,
      ).toISOString();
  }

  for (const evidence of store.evidence) {
    if (evidence.kind === "SCREENING_WATCHLIST")
      for (const hit of evidence.fields.hits ?? []) {
        hit.source = hit.listName;
        hit.program =
          hit.listName === "UK Sanctions List"
            ? "英国金融制裁名单"
            : "美国财政部特别指定国民和被封锁人员名单";
      }
    if (evidence.kind === "DATA_MATCH") {
      for (const row of evidence.fields.rows ?? []) {
        row.region =
          row.field === "注册地址"
            ? { x: 4.4, y: 46.5, width: 89, height: 7 }
            : row.field === "登记编号"
              ? { x: 4.4, y: 30.4, width: 89, height: 7 }
              : { x: 4.4, y: 15, width: 89, height: 4.2 };
        row.fileId = evidence.fields.documents?.[0]?.id;
      }
    }
  }
  for (const order of store.orders) {
    if (order.type === "SUPPLEMENT") {
      if (!order.sentAt) delete order.dueAt;
      else if (!order.extensions?.length)
        order.dueAt = new Date(
          Date.parse(order.sentAt) + 7 * DAY,
        ).toISOString();
      for (const extension of order.extensions ?? [])
        if (extension.status === "PENDING")
          extension.assignedTo = user("u_2101");
    }
    if (order.type === "RESTRICTED" && order.status === "PENDING_SECOND")
      order.assignee = user("u_1202");
    if (order.status === "PENDING_APPROVAL") {
      order.originalAssignee = order.assignee;
      order.assignee =
        Number(order.id.slice(-4)) % 3 === 0 ? user("u_3001") : undefined;
    }
  }
  for (const app of store.applications) {
    if (app.autoDecision === "APPROVED") {
      delete app.stageTimes.MANUAL_REVIEW;
      delete app.stageTimes.APPROVAL;
    } else if (
      !store.orders.some(
        (order) =>
          order.applicationId === app.id && order.status === "PENDING_APPROVAL",
      )
    ) {
      delete app.stageTimes.APPROVAL;
    }
    const related = store.orders.filter(
      (order) => order.applicationId === app.id && order.type !== "QA",
    );
    const active = related.filter(
      (order) =>
        !["CLOSED", "DONE", "CLOSED_NO_RESPONSE", "WITHDRAWN"].includes(
          order.status,
        ),
    );
    const current =
      active.find((order) => order.type === "RESTRICTED") ??
      active.find(
        (order) =>
          order.type === "REVIEW" && order.status === "PENDING_APPROVAL",
      ) ??
      active.find((order) => order.type === "SUPPLEMENT") ??
      active.find((order) => order.type === "REVIEW") ??
      active[0];
    app.status =
      current?.type === "RESTRICTED"
        ? "COMPLIANCE_HOLD"
        : (current?.status ??
          (related.length || app.decision || app.autoDecision
            ? "CLOSED"
            : "QUEUED"));
  }

  // Materialize historical references after all scenario-specific fields are final.
  for (const order of store.orders) {
    const snapshotId = `SNAP-${order.id}`;
    const evidenceIds = new Set(
      order.checkItems?.flatMap((check) => check.evidenceIds) ?? [],
    );
    const snapshotEvidence = store.evidence.filter((evidence) =>
      order.type === "QA"
        ? evidence.applicationId === order.applicationId
        : evidenceIds.has(evidence.id),
    );
    for (const check of order.checkItems ?? [])
      if (check.status === "DECIDED") check.snapshotId = snapshotId;
    const snapshotAt = new Date(
      Math.max(
        Date.parse(order.closedAt ?? order.enteredStatusAt),
        ...(order.checkItems ?? []).map((check) =>
          Date.parse(check.decidedAt ?? order.createdAt),
        ),
        ...snapshotEvidence.map((evidence) => Date.parse(evidence.generatedAt)),
      ),
    ).toISOString();
    store.snapshots[snapshotId] = {
      id: snapshotId,
      at: snapshotAt,
      workOrderId: order.id,
      checkItems: structuredClone(order.checkItems ?? []),
      evidence: structuredClone(snapshotEvidence),
    };
    if (order.type === "QA") store.qa[order.id].sampledAt = snapshotAt;
    store.audit.push({
      id: `AUD-${order.id}`,
      objectId: order.id,
      actor: system,
      action: "工单生成",
      before: null,
      after: {
        status: order.status,
        type: order.type,
        applicationId: order.applicationId,
      },
      snapshotId,
      at: order.createdAt,
      visibility:
        order.type === "SUPPLEMENT" || order.type === "CHANNEL"
          ? "OPS"
          : "COMPLIANCE",
    });
    for (const check of order.checkItems ?? [])
      if (check.status === "DECIDED")
        store.audit.push({
          id: `AUD-${order.id}-${check.id}`,
          objectId: order.id,
          actor: check.decidedBy!,
          action: "提交检查项结论",
          before: { status: "PENDING" },
          after: {
            checkItemId: check.id,
            conclusion: check.conclusion,
            conclusionReason: check.conclusionReason,
          },
          snapshotId,
          at: check.decidedAt!,
          visibility: "COMPLIANCE",
        });
    if (order.type === "REVIEW")
      for (const check of order.checkItems ?? [])
        store.events.push({
          id: `RISK-${order.id}-${check.id}`,
          applicationId: order.applicationId,
          reasonCode: check.reasonCodes[0],
          severity: order.priority ?? "NORMAL",
          source:
            check.checkType === "LINKED_ENTITY" ? "内部关联记录" : "Persona",
          evidenceIds: [...check.evidenceIds],
          createdAt: store.evidence.find(
            (evidence) => evidence.id === check.evidenceIds[0],
          )!.generatedAt,
        });
  }
  for (const app of store.applications)
    if (!store.triage.some((triage) => triage.applicationId === app.id)) {
      const orders = store.orders.filter(
        (order) => order.applicationId === app.id,
      );
      const reasons = [
        ...new Set(orders.flatMap((order) => order.reasonCodes ?? [])),
      ];
      store.triage.push({
        id: `TRI-${app.id}`,
        applicationId: app.id,
        outcome:
          app.autoDecision === "APPROVED"
            ? "AUTO_APPROVED"
            : orders.some((order) => order.type === "REVIEW")
              ? "MANUAL_REVIEW"
              : app.stage === "SUBMITTED"
                ? "PENDING"
                : "AUTO_CHECK",
        reasonCodes: reasons,
        ruleVersion: RULE_VERSION,
        at: app.stageTimes.AUTO_CHECK ?? app.createdAt,
      });
    }
  for (const order of store.orders) {
    if (
      [
        "IN_PROGRESS",
        "TO_SEND",
        "TO_CHECK",
        "BLIND",
        "COMPARE",
        "PENDING_SECOND",
        "PENDING_APPROVAL",
      ].includes(order.status) &&
      order.assignee
    ) {
      const merchant = merchantFor(order.applicationId);
      store.notifications.push({
        id: `NOT-ASSIGNMENT-${order.id}`,
        type: "ASSIGNMENT",
        userId: order.assignee.id,
        title: `${merchant.displayName}的工单已分配给你`,
        workOrderId: order.id,
        at: order.firstResponderAt ?? order.createdAt,
        read: false,
      });
      if (order.hasNewEvidence || order.status === "TO_CHECK")
        store.notifications.push({
          id: `NOT-EVIDENCE-${order.id}`,
          type: "NEW_EVIDENCE",
          userId: order.assignee.id,
          title: `${merchant.displayName}有新材料待处理`,
          workOrderId: order.id,
          at: iso(
            -9 * 60_000 - jitter(`notification:${order.id}`, 26 * 60_000),
          ),
          read: false,
        });
      // SLA reminders are aggregated once per recipient below.
    }
    for (const extension of order.extensions ?? [])
      if (extension.status === "PENDING" && extension.assignedTo)
        store.notifications.push({
          id: `NOT-EXTENSION-${extension.id}`,
          type: "EXTENSION",
          userId: extension.assignedTo.id,
          title: `${merchantFor(order.applicationId).displayName}的延期申请待审批`,
          workOrderId: order.id,
          at: extension.requestedAt,
          read: false,
        });
  }
  for (const recipient of store.users) {
    const actionable = store.orders.filter(
      (order) =>
        order.assignee?.id === recipient.id &&
        !order.slaPaused &&
        !["CLOSED", "DONE", "CLOSED_NO_RESPONSE", "WITHDRAWN"].includes(
          order.status,
        ) &&
        Date.parse(order.slaDueAt) - now <= 2 * HOUR,
    );
    if (actionable.length)
      store.notifications.push({
        id: `NOT-SLA-${recipient.id}`,
        type: "SLA",
        userId: recipient.id,
        title: `${actionable.length} 张工单已超时或即将到期，请及时处理`,
        count: actionable.length,
        at: iso(-5 * 60_000),
        read: false,
      });
  }
  return store;
}
