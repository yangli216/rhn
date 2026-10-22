package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

import static com.rhn.shared.api.BusinessErrors.badRequest;

/** 开单读取检查项目已维护的部位规则：可选部位只来自已启用的检查部位方式，主项目数量按部位计价方式换算。 */
public interface ExaminationSiteDirectory {

    /** 当前租户下检查项目的部位规则；未维护检查配置时为空。 */
    Optional<ExaminationSiteRule> siteRule(Long serviceId);

    record ExaminationSiteRule(Long serviceId, boolean bodySiteRequired, boolean multiBodySite,
                               Integer maxBodySiteCount, String sitePricingMode, int includedSiteCount,
                               Integer maxChargeableSiteCount, List<ExaminationSiteOption> sites) {

        /** 按编码选取部位：去重保序，校验必选、上限及是否属于本项目已启用部位。 */
        public List<ExaminationSiteOption> select(List<String> codes) {
            LinkedHashSet<String> distinct = new LinkedHashSet<>();
            if (codes != null) codes.stream().filter(code -> code != null && !code.isBlank())
                    .map(String::trim).forEach(distinct::add);
            if (bodySiteRequired && distinct.isEmpty()) {
                throw badRequest("EXAM_BODY_SITE_REQUIRED", "该检查项目必须选择检查部位");
            }
            int limit = maxBodySiteCount == null ? (multiBodySite ? Integer.MAX_VALUE : 1) : maxBodySiteCount;
            if (distinct.size() > limit) {
                throw badRequest("EXAM_BODY_SITE_LIMIT_EXCEEDED", "所选检查部位数超过项目允许上限");
            }
            List<ExaminationSiteOption> selected = new ArrayList<>();
            for (String code : distinct) {
                selected.add(sites.stream().filter(site -> site.code().equals(code)).findFirst()
                        .orElseThrow(() -> badRequest("EXAM_BODY_SITE_INVALID", "所选检查部位不存在、已停用或不属于当前检查项目")));
            }
            return List.copyOf(selected);
        }

        /** 主项目收费数量：按部位计价时为计费部位数（至少 1，受最大计费部位数限制），其余方式为 1。 */
        public BigDecimal baseQuantity(int siteCount) {
            if (!"PER_SITE".equals(sitePricingMode)) return BigDecimal.ONE;
            int effective = Math.max(1, siteCount);
            if (maxChargeableSiteCount != null) effective = Math.min(effective, maxChargeableSiteCount);
            return BigDecimal.valueOf(effective);
        }
    }

    record ExaminationSiteOption(Long variantId, String code, String name, Long bodySiteConceptId,
                                 String methodType, String mutualRecognitionCode) {}
}
