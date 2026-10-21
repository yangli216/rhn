package com.rhn.outpatient.ordering;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** 取消签署：按当前版本把已签署且未进结算单的医嘱退回未签署。 */
record WithdrawSignatureRequest(@NotNull @Min(0) Long expectedRevision) {}
