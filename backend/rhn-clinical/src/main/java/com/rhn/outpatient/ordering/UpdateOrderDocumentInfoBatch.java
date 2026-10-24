package com.rhn.outpatient.ordering;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.util.List;

/**
 * 一张申请单内的多个诊疗项目共用同一份单据信息，批量提交避免逐项请求。
 * 每项仍按自己的版本号做乐观锁校验。
 */
record UpdateOrderDocumentInfoBatch(@NotEmpty List<@NotNull @Valid Member> members,
                                    @NotNull @Valid OrderDocumentInfo documentInfo) {

    record Member(@NotNull Long id, @NotNull @PositiveOrZero Long expectedRevision) {}
}
