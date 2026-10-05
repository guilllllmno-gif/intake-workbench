import { useEffect, useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import {
  CheckboxList,
  CheckboxListItem,
} from "@astryxdesign/core/CheckboxList";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import {
  CHECK_LABELS,
  CHECK_OPTIONS,
  REASONS,
  reasonName,
  SUPPLEMENT_CONCLUSIONS,
} from "../catalog";
import { Confirm } from "../ui";
import type {
  CheckItem,
  ExternalText,
  OrderDetail,
  SupplementAction,
} from "../types";
import "./evidence.css";

type Need = {
  checkItemId: string;
  reasonCode?: string;
  externalText: ExternalText;
  actionType: SupplementAction;
  field?: string;
  targetPersonId?: string;
};

export default function SupplementNeedsDialog({
  data,
  currentCheckItemId,
  open,
  busy,
  onClose,
  onSubmit,
}: {
  data: OrderDetail;
  currentCheckItemId?: string;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { items: Need[]; noteToOps: string }) => Promise<boolean>;
}) {
  const checks = data.workOrder.checkItems ?? [];
  const submitted = new Set(
    (data.supplements ?? [])
      .filter(
        (order) =>
          !["DONE", "CLOSED_NO_RESPONSE", "WITHDRAWN"].includes(order.status),
      )
      .flatMap((order) => (order.items ?? []).map((item) => item.checkItemId)),
  );
  const eligible = checks.filter(
    (item) =>
      !submitted.has(item.id) &&
      CHECK_OPTIONS[item.checkType].some(
        (option) => SUPPLEMENT_CONCLUSIONS[option.value],
      ) &&
      (item.status === "PENDING" ||
        !!SUPPLEMENT_CONCLUSIONS[item.conclusion ?? ""]),
  );
  const [needs, setNeeds] = useState<Need[]>([]);
  const [noteToOps, setNoteToOps] = useState("");
  const [error, setError] = useState("");
  const language = data.application.communicationLanguage ?? "en";
  const makeNeed = (item: CheckItem): Need => ({
    checkItemId: item.id,
    reasonCode: item.reasonCodes[0],
    externalText: { ...REASONS[item.reasonCodes[0]].externalText },
    actionType: item.checkType === "IDENTITY_MEDIA" ? "REVERIFY" : "UPLOAD",
    targetPersonId:
      item.checkType === "IDENTITY_MEDIA" && data.people?.length === 1
        ? data.people[0].id
        : undefined,
  });
  useEffect(() => {
    if (!open) return;
    setNeeds(
      eligible
        .filter(
          (item) =>
            item.id === currentCheckItemId ||
            !!SUPPLEMENT_CONCLUSIONS[item.conclusion ?? ""],
        )
        .map(makeNeed),
    );
    setNoteToOps("");
    setError("");
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
      onClose={onClose}
      onConfirm={async () => {
        if (!needs.length) {
          setError("请选择至少一个可补件的检查项。");
          return;
        }
        if (
          needs.some(
            (need) =>
              !need.externalText.zh.trim() ||
              !need.externalText.en.trim() ||
              (need.actionType === "REVERIFY" && !need.targetPersonId) ||
              (need.actionType === "CONFIRM_FIELD" && !need.field),
          )
        ) {
          setError("请补全每项的中英文对外文案、需验证人员或需确认字段。");
          return;
        }
        if (
          /筛查|制裁|可疑|洗钱|黑名单|名单命中|负面新闻|PEP/i.test(noteToOps)
        ) {
          setError("给运营的说明不得包含筛查、名单或可疑相关内容。");
          return;
        }
        setError("");
        if (await onSubmit({ items: needs, noteToOps: noteToOps.trim() }))
          onClose();
      }}
    >
      <div className="ev-supplement-needs">
        <CheckboxList
          label="可补件的检查项"
          value={needs.map((need) => need.checkItemId)}
          isDisabled={busy}
          onChange={(ids) =>
            setNeeds(
              eligible
                .filter((item) => ids.includes(item.id))
                .map(
                  (item) =>
                    needs.find((need) => need.checkItemId === item.id) ??
                    makeNeed(item),
                ),
            )
          }
        >
          {eligible.map((item) => (
            <CheckboxListItem
              key={item.id}
              value={item.id}
              label={`${CHECK_LABELS[item.checkType]} · ${item.reasonCodes.map(reasonName).join("、")}${item.id === currentCheckItemId ? "（当前项）" : ""}`}
            />
          ))}
        </CheckboxList>
        {!eligible.length && (
          <p className="ev-secondary">本单暂无可新增的补件检查项</p>
        )}
        {needs.map((need, index) => {
          const item = checks.find((check) => check.id === need.checkItemId)!;
          return (
            <Card padding={4} key={need.checkItemId}>
              <h3 className="ev-card-title">
                {item.reasonCodes.map(reasonName).join("、")}
              </h3>
              <div className="ev-form">
                <TextArea
                  label="对外文案（中文）"
                  isRequired
                  value={need.externalText.zh}
                  rows={2}
                  onChange={(zh) =>
                    patch(index, { externalText: { ...need.externalText, zh } })
                  }
                />
                <TextArea
                  label="对外文案（英文）"
                  isRequired
                  value={need.externalText.en}
                  rows={2}
                  onChange={(en) =>
                    patch(index, { externalText: { ...need.externalText, en } })
                  }
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
              <div className="ev-external-preview" aria-label="商户文案预览">
                <strong>
                  商户将看到（{language === "zh" ? "中文" : "英文"}）
                </strong>
                <p lang={language}>{need.externalText[language]}</p>
              </div>
            </Card>
          );
        })}
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
      </div>
    </Confirm>
  );
}
