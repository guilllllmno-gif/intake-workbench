import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { REASONS, reasonName, SUPPLEMENT_CONCLUSIONS } from "../catalog";
import { Confirm } from "../ui";
import type { CheckItem, OrderDetail, SupplementAction } from "../types";
import "./evidence.css";

type Need = {
  checkItemId: string;
  reasonCode?: string;
  externalText: string;
  actionType: SupplementAction;
  field?: string;
  targetPersonId?: string;
};
const templates = {
  neutral: [
    "请补充最新的公司登记文件及相关证明材料。",
    "请核对并补充申请资料，以便继续审核。",
  ],
  address: [
    "请提供最近三个月签发的公司注册地址证明。",
    "请核对注册地址，并提交显示完整地址的登记文件。",
  ],
  identity: ["请相关人员重新完成身份验证。", "请提供有效且清晰的身份证件。"],
  people: ["请补充关联人员的姓名、职务与持股信息，并完成身份验证。"],
  ownership: ["请补充完整股权结构图及逐层持股证明，直至最终自然人。"],
  website: [
    "请补充网站退款政策、客服联系方式及交易条款。",
    "请说明网站经营内容与申请业务的对应关系。",
  ],
  general: [
    "请补充最新的公司登记文件及相关证明材料。",
    "请核对并补充申请资料，以便继续审核。",
  ],
};
function optionsFor(item?: CheckItem) {
  if (
    !item ||
    item.reasonCodes.some(
      (code) => REASONS[code]?.externalCategory === "不披露",
    )
  )
    return templates.neutral;
  if (item.reasonCodes.includes("KYB-REG-ADDR")) return templates.address;
  if (item.checkType === "IDENTITY_MEDIA") return templates.identity;
  if (item.checkType === "ASSOCIATED_PERSONS") return templates.people;
  if (item.checkType === "OWNERSHIP") return templates.ownership;
  if (item.checkType === "WEBSITE") return templates.website;
  return templates.general;
}
export default function SupplementNeedsDialog({
  data,
  open,
  busy,
  onClose,
  onSubmit,
}: {
  data: OrderDetail;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { items: Need[]; noteToOps: string }) => Promise<boolean>;
}) {
  const checks = data.workOrder.checkItems ?? [];
  const [needs, setNeeds] = useState<Need[]>([]);
  const [noteToOps, setNoteToOps] = useState("");
  const [error, setError] = useState("");
  const [manualId, setManualId] = useState<string>();
  useEffect(() => {
    if (!open) return;
    setNeeds(
      checks
        .filter(
          (item) => item.conclusion && SUPPLEMENT_CONCLUSIONS[item.conclusion],
        )
        .map((item) => ({
          checkItemId: item.id,
          reasonCode: item.reasonCodes[0],
          externalText: optionsFor(item)[0],
          actionType: item.conclusion === "REVERIFY" ? "REVERIFY" : "UPLOAD",
          targetPersonId:
            item.conclusion === "REVERIFY" && data.people?.length === 1
              ? data.people[0].id
              : undefined,
        })),
    );
    setNoteToOps("");
    setError("");
    setManualId(undefined);
  }, [open]);
  const patch = (index: number, value: Partial<Need>) =>
    setNeeds((current) =>
      current.map((need, at) => (at === index ? { ...need, ...value } : need)),
    );
  return (
    <Confirm
      open={open}
      title="提补件需求"
      description="生成或合并补件工单并交给运营，审核工单进入补件中，合规 SLA 暂停。"
      merchant="运营发送通知后看到补件要求；本次操作不直接通知商户。"
      sales="资料待补充，不展示内部审核原因。"
      reversible="通知发送前可由运营核对文案；已提交的需求及处理记录保留。"
      confirmLabel="确认提补件需求"
      busy={busy}
      confirmDisabled={!needs.length}
      onClose={onClose}
      onConfirm={async () => {
        if (
          needs.some(
            (need) =>
              !need.externalText ||
              (need.actionType === "REVERIFY" && !need.targetPersonId) ||
              (need.actionType === "CONFIRM_FIELD" && !need.field),
          )
        ) {
          setError("请补全每项的对外模板、需验证人员或需确认字段。");
          return;
        }
        if (
          /筛查|制裁|可疑|洗钱|黑名单|名单命中|负面新闻|PEP/i.test(noteToOps)
        ) {
          setError("给运营的说明不得包含筛查、名单或可疑相关内容。");
          return;
        }
        if (await onSubmit({ items: needs, noteToOps: noteToOps.trim() }))
          onClose();
      }}
    >
      <div className="ev-supplement-needs">
        {needs.map((need, index) => {
          const item = checks.find((check) => check.id === need.checkItemId);
          return (
            <Card padding={4} key={need.checkItemId}>
              <h3 className="ev-card-title">
                {item?.reasonCodes.map(reasonName).join("、") || "补充材料"}
              </h3>
              <div className="ev-form">
                <Selector
                  label="对外文案模板"
                  isRequired
                  value={need.externalText}
                  options={optionsFor(item).map((value) => ({
                    value,
                    label: value,
                  }))}
                  onChange={(externalText) => patch(index, { externalText })}
                />
                <Selector
                  label="商户操作"
                  isRequired
                  value={need.actionType}
                  options={[
                    { value: "UPLOAD", label: "上传材料" },
                    { value: "REVERIFY", label: "重新验证" },
                    { value: "CONFIRM_FIELD", label: "确认或修改字段" },
                  ]}
                  onChange={(actionType) =>
                    patch(index, { actionType: actionType as SupplementAction })
                  }
                />
                {need.actionType === "REVERIFY" && (
                  <Selector
                    label="验证人员"
                    isRequired
                    value={need.targetPersonId}
                    placeholder="选择人员"
                    options={(data.people ?? []).map((person) => ({
                      value: person.id,
                      label: `${person.name} · ${person.role}`,
                    }))}
                    onChange={(targetPersonId) =>
                      patch(index, { targetPersonId })
                    }
                  />
                )}
                {need.actionType === "CONFIRM_FIELD" && (
                  <Selector
                    label="确认字段"
                    isRequired
                    value={need.field}
                    placeholder="选择字段"
                    options={[
                      { value: "registrationNo", label: "注册号" },
                      { value: "legalName", label: "法定名称" },
                      { value: "registeredAddress", label: "注册地址" },
                      { value: "website", label: "网站" },
                    ]}
                    onChange={(field) => patch(index, { field })}
                  />
                )}
              </div>
            </Card>
          );
        })}
        <div className="ev-add-need">
          <Selector
            label="添加检查项的补件需求"
            value={manualId}
            placeholder="选择检查项"
            options={checks
              .filter(
                (item) => !needs.some((need) => need.checkItemId === item.id),
              )
              .map((item) => ({
                value: item.id,
                label: item.reasonCodes.map(reasonName).join("、"),
              }))}
            onChange={setManualId}
          />
          <Button
            label="添加"
            variant="secondary"
            isDisabled={!manualId}
            onClick={() => {
              const item = checks.find((check) => check.id === manualId);
              if (!item) return;
              setNeeds((current) => [
                ...current,
                {
                  checkItemId: item.id,
                  reasonCode: item.reasonCodes[0],
                  externalText: optionsFor(item)[0],
                  actionType: "UPLOAD",
                },
              ]);
              setManualId(undefined);
            }}
          />
        </div>
        <TextArea
          label="给运营的说明"
          description="不得写入筛查、名单或可疑相关内容。"
          value={noteToOps}
          onChange={setNoteToOps}
          rows={3}
          maxLength={1000}
        />
        {error && (
          <p role="alert" className="ev-error">
            {error}
          </p>
        )}
        {!needs.length && (
          <p className="ev-secondary">请选择需补充材料的检查项。</p>
        )}
      </div>
    </Confirm>
  );
}
