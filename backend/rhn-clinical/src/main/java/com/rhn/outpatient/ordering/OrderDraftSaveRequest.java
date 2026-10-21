package com.rhn.outpatient.ordering;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

record OrderDraftSaveRequest(
        @NotBlank @Size(max = 128) String commandCode,
        @NotNull List<@NotNull @Valid BatchOrderMedicationItem> medicationItems,
        @NotNull List<@NotNull @Valid CreateServiceRequest> serviceItems,
        /** 本次保存原地修改的医嘱；已签署且未进结算单的先退回未签署再修改，与新草稿在同一事务，可为空。 */
        List<@NotNull @Valid RevisedOrder> revisedOrders) {

    /** medication 与 service 按 kind 二选一；药品、项目本身不可更换。 */
    record RevisedOrder(@NotNull Kind kind, @NotNull Long id, @NotNull Long expectedRevision,
                        @Valid BatchOrderMedicationItem medication, @Valid CreateServiceRequest service) {
        enum Kind { MEDICATION, SERVICE }
    }

    List<RevisedOrder> revisions() {
        return revisedOrders == null ? List.of() : revisedOrders;
    }
}
