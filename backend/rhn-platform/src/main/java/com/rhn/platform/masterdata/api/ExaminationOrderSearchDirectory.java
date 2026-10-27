package com.rhn.platform.masterdata.api;

import java.time.LocalDate;
import java.util.List;

/** 医嘱录入的项目＋单部位候选；只定位与预填，开立校验、数量与计价仍走原流程。 */
public interface ExaminationOrderSearchDirectory {
    ExaminationOrderSearchResult search(Long organizationId, LocalDate businessDate, String query);

    /** 同一项目只返回一次，多个部位候选共享项目详情与价格事实。 */
    record ExaminationOrderSearchResult(List<MasterDataViews.ServiceView> services, List<ExaminationOrderCandidate> candidates) {}
    record ExaminationOrderCandidate(Long catalogItemId, ExaminationSite site) {}
    record ExaminationSite(Long variantId, String code, String name) {}
}
