package com.rhn.outpatient.ordering;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 一次开立命令：列出医生核对过的全部处方草稿与检验检查申请草稿（须分别与当前草稿集合一致），
 * 以及需更新单据信息的已生效申请。草稿 documentInfo 为空且尚无关联诊断时默认关联本次主诊断；
 * 已生效申请必须携带 documentInfo。acknowledgedReviewKey 为上次返回的合理用药审查键。
 * dryRun 只核对草稿集合并返回合理用药审查结果，不写任何单据，供核查窗打开时预先展示。
 */
record OrderSubmissionRequest(
        @NotNull @Size(max = 200) List<@NotNull @Valid PrescriptionEntry> prescriptions,
        @NotNull @Size(max = 200) List<@NotNull @Valid ServiceDocumentEntry> serviceDocuments,
        @Size(max = 128) String acknowledgedReviewKey,
        Boolean dryRun) {
    record PrescriptionEntry(@NotNull Long id, @NotNull @PositiveOrZero Long expectedRevision,
                             @Valid OrderDocumentInfo documentInfo, @Size(max = 1000) String safetyReason) {}
    record ServiceDocumentEntry(@NotNull Long id, @NotNull @PositiveOrZero Long expectedRevision,
                                @Valid OrderDocumentInfo documentInfo) {}
}
