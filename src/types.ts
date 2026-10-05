export type Role =
  | "OPS_AGENT"
  | "OPS_LEAD"
  | "COMPLIANCE_REVIEWER"
  | "COMPLIANCE_SENIOR"
  | "COMPLIANCE_HEAD"
  | "APPROVER"
  | "SALES"
  | "MERCHANT";
export interface UserRef {
  id: string;
  name: string;
  account?: string;
  team?: string;
}
export interface User extends UserRef {
  account: string;
  roles: Role[];
  team: string;
  approvalLimit?: number;
  authority?: "RISK" | "MANAGEMENT";
  salesLead?: boolean;
}
export interface Session {
  role: Role;
  userId: string;
  name: string;
  account: string;
  team: string;
}
export type WorkOrderType =
  "REVIEW" | "SUPPLEMENT" | "CHANNEL" | "RESTRICTED" | "QA";
export type Status =
  | "QUEUED"
  | "IN_PROGRESS"
  | "WAITING_SUPPLEMENT"
  | "PENDING_APPROVAL"
  | "COMPLIANCE_HOLD"
  | "CLOSED"
  | "TO_SEND"
  | "WAITING_MERCHANT"
  | "TO_CHECK"
  | "DONE"
  | "CLOSED_NO_RESPONSE"
  | "WITHDRAWN"
  | "WAITING_COMPLIANCE"
  | "WAITING_CHANNEL"
  | "PENDING_SECOND"
  | "BLIND"
  | "COMPARE";
export type Priority = "HIGH" | "NORMAL" | "LOW";
export type CheckType =
  | "SCREENING_WATCHLIST"
  | "SCREENING_MEDIA"
  | "DATA_MATCH"
  | "IDENTITY_MEDIA"
  | "ASSOCIATED_PERSONS"
  | "CLASSIFICATION"
  | "WEBSITE"
  | "SCHEME_LIST"
  | "OWNERSHIP"
  | "LINKED_ENTITY"
  | "MANUAL_VERIFY";
export interface CheckItem {
  id: string;
  checkType: CheckType;
  title: string;
  reasonCodes: string[];
  evidenceIds: string[];
  status: "PENDING" | "DECIDED" | "AUTO_CLOSED";
  conclusion?: string;
  conclusionReason?: string;
  note?: string;
  decidedBy?: UserRef;
  decidedAt?: string;
  snapshotId?: string;
  hasNewEvidence: boolean;
  hitConclusions?: Record<
    string,
    { conclusion: string; reason: string; note?: string }
  >;
  articles?: Record<string, { relevance: string; reason?: string }>;
  mcc?: string;
  uboNames?: string[];
  remediationItems?: string[];
  verificationFiles?: UploadedFile[];
}
export interface Money {
  amount: number;
  currency: string;
}
export interface Contact {
  name: string;
  email: string;
  phone: string;
  preferredChannel: "EMAIL" | "SMS" | "PORTAL";
}
export type CommunicationLanguage = "zh" | "en";
export type ExternalText = Record<CommunicationLanguage, string>;

export interface Merchant {
  id: string;
  legalName: string;
  displayName?: string;
  registrationNo: string;
  registrationAuthority: string;
  country: string;
  declaredMcc: string;
  expectedMonthlyVolume: Money;
  website: string;
  businessModel: string;
  contacts?: Contact[];
  conditions?: ApprovalConditions;
  blacklisted?: boolean;
  averageTransaction?: Money;
  mccRisk?: string;
  countryRisk?: string;
  isNewEntity?: boolean;
}
export interface Application {
  id: string;
  merchantId: string;
  communicationLanguage?: CommunicationLanguage;
  stage:
    | "SUBMITTED"
    | "AUTO_CHECK"
    | "MANUAL_REVIEW"
    | "APPROVAL"
    | "CHANNEL"
    | "LIVE";
  status: string;
  externalStatus: "资料待补充" | "审核中" | "已通过" | "未通过";
  isKeyMerchant: boolean;
  salesOwner: UserRef;
  createdAt: string;
  version: number;
  submittedBy?: UserRef;
  decision?: string;
  autoDecision?: string;
  lastRerun?: string[];
  stageTimes: Partial<Record<Application["stage"], string>>;
  externalCategory?: string;
}
export interface Person {
  id: string;
  merchantId: string;
  name: string;
  role: string;
  ownershipPct?: number;
  declared: boolean;
  kycStatus?: string;
  needsReverify: boolean;
}
export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedBy: UserRef;
  uploadedAt: string;
  pages?: number;
  url?: string;
  content?: string;
  digest?: string;
}
export interface Evidence {
  id: string;
  applicationId: string;
  kind: CheckType;
  sourceRef: string;
  generatedAt: string;
  fields: Record<string, any>;
  mediaRefs: { id: string; label: string; url?: string; file?: UploadedFile }[];
}
export type SupplementAction = "UPLOAD" | "REVERIFY" | "CONFIRM_FIELD";
export interface SupplementItem {
  id: string;
  sourceWorkOrderId: string;
  source: "COMPLIANCE" | "CHANNEL" | "AUTO";
  reasonCode?: string;
  checkItemId?: string;
  externalText: ExternalText;
  actionType: SupplementAction;
  status: "PENDING" | "SENT" | "PROVIDED" | "REJECTED" | "MISSING";
  rejectReason?: string;
  field?: string;
  response?: string;
  files?: UploadedFile[];
  checked?: boolean;
  checkedBy?: UserRef;
  checkedAt?: string;
  targetPersonId?: string;
}
export interface Extension {
  id: string;
  requestedBy: UserRef;
  originalDueAt: string;
  requestedDueAt: string;
  reason: string;
  approvedBy?: UserRef;
  requestedAt: string;
  assignedTo?: UserRef;
  approvedAt?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}
export interface ContactLog {
  id: string;
  at: string;
  channel: "PHONE" | "EMAIL" | "IM" | "SMS" | "PORTAL";
  summary: string;
  by: UserRef;
  contact?: string;
  result?: "CONNECTED" | "NO_ANSWER" | "PROMISED";
  promisedAt?: string;
  subject?: string;
  sender?: string;
  body?: string;
}
export interface WorkOrder {
  id: string;
  type: WorkOrderType;
  applicationId: string;
  stage: "FORM_SUBMITTED" | "POST_APPROVAL" | "CHANNEL" | "VA_CHANNEL";
  status: Status;
  priority?: Priority;
  queue: string;
  assignee?: UserRef;
  originalAssignee?: UserRef;
  submittedBy?: UserRef;
  slaDueAt: string;
  slaPaused: boolean;
  slaRemainingMs?: number;
  enteredStatusAt: string;
  ruleVersion?: string;
  reasonCodes?: string[];
  approvalReasons?: string[];
  checkItems?: CheckItem[];
  version: number;
  createdAt: string;
  closedAt?: string;
  hasNewEvidence?: boolean;
  lateHardReject?: string;
  hardRejectDismissed?: boolean;
  missingEvidence?: string[];
  outcome?: string;
  parentId?: string;
  firstResponderAt?: string;
  approvalActorIds?: string[];
  restrictedActorIds?: string[];
  pendingDecision?: string;
  caseId?: string;
  scenario?: string;
  restrictedType?: string;
  restrictedReason?: string;
  restrictedResolved?: boolean;
  frozenAt?: string;
  requiresDual?: boolean;
  overrideAutoReject?: boolean;
  items?: SupplementItem[];
  dueAt?: string;
  extensions?: Extension[];
  contactLog?: ContactLog[];
  remindersSent?: number;
  noteToOps?: string;
  sentAt?: string;
  merchantToken?: string;
  channelSubmissionId?: string;
  opsNote?: string;
  complianceNote?: string;
  mappingRequestedAt?: string;
  triggerReceiptType?: ChannelSubmission["receiptType"];
}
export interface ApprovalConditions {
  singleLimit: number;
  monthlyLimit: number;
  reservePct: number;
  reserveDays: number;
  reviewDays: number;
}
export interface ApprovalDecision {
  id: string;
  workOrderId: string;
  decision: string;
  reason?: string;
  conditions?: ApprovalConditions;
  approvers: UserRef[];
  at: string;
}
export interface RestrictedDecision {
  id: string;
  workOrderId: string;
  decision: string;
  reason: string;
  reviewers: UserRef[];
  at: string;
}
export interface QaReview {
  id: string;
  sampledObjectId: string;
  batchId: string;
  sampledAt: string;
  snapshotId: string;
  reviewMode: "APPLICATION" | "CHECK_ITEMS";
  blindConclusions?: Record<string, string>;
  originalConclusions?: Record<string, string>;
  consistent?: boolean;
  mismatchReason?: string;
  correctiveActions?: string[];
  generatedIds?: string[];
}
export interface ChannelSubmission {
  id: string;
  applicationId: string;
  channelId: string;
  channelName: string;
  submissionNo: string;
  status: string;
  submittedAt: string;
  receiptAt?: string;
  receiptType?: "REJECTED" | "MORE_INFO" | "TIMEOUT";
  upstreamCode?: string;
  upstreamReasonRaw: string;
  requiredDocuments: string[];
  mappedReasonCode?: string;
  isRiskType?: boolean;
  documents: { name: string; value: string; file?: UploadedFile }[];
  lastReminderAt?: string;
}
export interface ChannelReasonMapping {
  id: string;
  channelId: string;
  upstreamCode: string;
  rawReason: string;
  reasonCode: string;
  isRiskType: boolean;
  createdBy: UserRef;
}
export interface RiskEvent {
  id: string;
  applicationId: string;
  reasonCode: string;
  severity: string;
  source: string;
  evidenceIds: string[];
  createdAt: string;
}
export interface Triage {
  id: string;
  applicationId: string;
  outcome: string;
  reasonCodes: string[];
  ruleVersion: string;
  at: string;
}
export interface AuditLog {
  id: string;
  objectId: string;
  actor: UserRef;
  action: string;
  before: unknown;
  after: unknown;
  snapshotId: string;
  at: string;
  note?: string;
  visibility?: "OPS" | "COMPLIANCE" | "ALL";
}
export interface EvidenceSnapshot {
  id: string;
  at: string;
  workOrderId: string;
  checkItems: CheckItem[];
  evidence: Evidence[];
}
export interface Notification {
  id: string;
  userId: string;
  title: string;
  workOrderId?: string;
  at: string;
  read: boolean;
  type: "ASSIGNMENT" | "NEW_EVIDENCE" | "EXTENSION" | "SLA";
  count?: number;
}
export interface SearchResult {
  id: string;
  kind: "order" | "application";
  path: string;
  label: string;
  status: string;
}
export interface NoticePreview {
  language: CommunicationLanguage;
  sender: string;
  subject: string;
  salutation: string;
  body: string;
  link: string;
  dueAt: string;
  recipient: string;
  channel: string;
  stateChange: string;
}
export interface OrderDetail {
  workOrder: WorkOrder;
  merchant: Merchant;
  application: Application;
  people?: Person[];
  evidence?: Evidence[];
  audit?: AuditLog[];
  supplements?: WorkOrder[];
  channel?: ChannelSubmission;
  otherChannels?: ChannelSubmission[];
  qa?: QaReview;
  approvalDecisions?: ApprovalDecision[];
  restrictedDecisions?: RestrictedDecision[];
  restrictedLocked?: boolean;
  undo?: { token: string; expiresAt: string };
}
export interface ApplicationDetail {
  application: Application;
  merchant: Merchant;
  people?: Person[];
  workOrders?: WorkOrder[];
  events?: RiskEvent[];
  triage?: Triage[];
  audit?: AuditLog[];
  supplements?: WorkOrder[];
  channels?: ChannelSubmission[];
  approvalDecisions?: ApprovalDecision[];
  contactLog?: ContactLog[];
  submittedMaterials?: UploadedFile[];
  restrictedLocked?: boolean;
}
export type QueueView =
  | "ops"
  | "team"
  | "extensions"
  | "channel"
  | "review"
  | "qa"
  | "restricted"
  | "approval";
export interface QueueRow {
  id: string;
  type: WorkOrderType;
  applicationId: string;
  status: Status;
  version: number;
  merchantName: string;
  displayName?: string;
  country: string;
  isKeyMerchant: boolean;
  createdAt: string;
  enteredStatusAt: string;
  assignee?: UserRef;
  slaDueAt: string;
  slaPaused: boolean;
  declaredMcc?: string;
  expectedMonthlyVolume?: Money;
  pendingCheckCount?: number;
  checkItems?: { id: string; title: string; status: CheckItem["status"] }[];
  reasonName?: string;
  reasonCodes?: string[];
  priority?: Priority;
  contact?: Contact;
  supplementCount?: number;
  supplementText?: string;
  supplementSource?: string;
  supplementStatus?: Status;
  dueAt?: string;
  remindersSent?: number;
  recentContact?: ContactLog;
  channelName?: string;
  channelId?: string;
  submissionNo?: string;
  receiptType?: string;
  upstreamCode?: string;
  upstreamReasonRaw?: string;
  mappedReasonName?: string;
  approvalReasonNames?: string[];
  mccRisk?: string;
  countryRisk?: string;
  submittedBy?: UserRef;
  waitingMs?: number;
  reviewProgress?: string;
  batchId?: string;
  sampledAt?: string;
  restrictedType?: string;
  frozenAt?: string;
  extension?: Extension;
  extensionCount?: number;
  hasNewEvidence?: boolean;
}
export interface QueueData {
  rows: QueueRow[];
  counts: Record<string, number>;
  total: number;
  todayCompleted: number;
  updatedAt: string;
}
export interface QueueFilters {
  view?: QueueView;
  tab?: string;
  type?: string;
  priority?: string;
  reasonCode?: string;
  country?: string;
  key?: string;
  search?: string;
  source?: string;
  due?: string;
  channel?: string;
  receiptType?: string;
  mapped?: string;
}
export interface ApplicationFilters {
  search?: string;
  country?: string;
  stage?: string;
  externalStatus?: string;
  from?: string;
  to?: string;
  key?: string;
  internalStatus?: string;
  priority?: string;
  channel?: string;
}
export interface ApplicationRow {
  application: Application;
  merchant: Merchant;
  currentOrder?: Pick<
    WorkOrder,
    "id" | "type" | "status" | "assignee" | "priority"
  >;
  internalStatus?: string;
  nextStep: string;
  dueAt?: string;
  opsTask?: string;
}
export interface MetricData {
  cards: {
    label: string;
    value: string;
    delta: string;
    good: boolean;
    definition: string;
  }[];
  reasons: { code: string; name: string; count: number }[];
  duration: { label: string; count: number }[];
  lossRate: number;
  trend: {
    label: string;
    automatic: number;
    manual: number;
    lossRate?: number;
  }[];
  total: number;
}
export type MutationAction =
  | "claim"
  | "release"
  | "assign"
  | "conclusion"
  | "supplement-needs"
  | "escalate"
  | "late-decline"
  | "finalize"
  | "approval"
  | "restricted-decision"
  | "qa"
  | "notices"
  | "contact-logs"
  | "reminders"
  | "extensions"
  | "approve-extension"
  | "supplement-check"
  | "return-to-merchant"
  | "complete-supplement"
  | "withdraw"
  | "merchant-submit"
  | "channel-supplement"
  | "channel-resubmit"
  | "channel-switch"
  | "channel-escalate"
  | "channel-terminate"
  | "channel-remind"
  | "channel-mapping"
  | "mapping-request"
  | "note"
  | "read-evidence"
  | "media"
  | "persona"
  | "reopen-item";
export interface Store {
  schema: 6;
  nextId: number;
  users: User[];
  merchants: Merchant[];
  applications: Application[];
  people: Person[];
  orders: WorkOrder[];
  evidence: Evidence[];
  events: RiskEvent[];
  triage: Triage[];
  audit: AuditLog[];
  snapshots: Record<string, EvidenceSnapshot>;
  qa: Record<string, QaReview>;
  submissions: ChannelSubmission[];
  channelMappings: ChannelReasonMapping[];
  approvalDecisions: ApprovalDecision[];
  restrictedDecisions: RestrictedDecision[];
  notifications: Notification[];
  correctiveObjects: {
    id: string;
    type: string;
    applicationId: string;
    createdAt: string;
  }[];
}
