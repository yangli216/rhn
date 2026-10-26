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

    /**
     * 按所选部位计算检查收费方案：主收费行（主项目、主收费物价项或阶梯档位）、多部位加收与附加项目（只含必收与多部位触发的附加项目）。
     * 未维护检查配置时为空；部位不合规时抛出与开单相同的部位错误。
     */
    Optional<MedicalOperationsViews.ExaminationChargePlan> chargePlan(Long serviceId, List<String> bodySiteCodes);

    /** 当前租户下检查方式为 examinationType 的检查配置；不判断机构可开立，调用方另行按机构过滤。 */
    List<ExaminationOrderingProfile> orderingProfiles(String examinationType);

    /** 定位开立项目用的检查方式属性：超声方式（B_MODE / COLOR_DOPPLER）、增强方式（PLAIN / ENHANCED / PLAIN_ENHANCED）。 */
    record ExaminationOrderingProfile(Long serviceId, String examinationType, String examinationTechnique,
                                      String contrastPhase) {}

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

        /**
         * 计费部位数：所选部位方式的计费部位数之和，至少为 1，并受最大计费部位数封顶。不按标准部位概念去重：
         * 左右侧由不同部位方式表达且映射同一概念，“左膝 + 右膝”应计 2 个部位。
         * 部位数上限按所选部位方式个数校验，与计费部位数无关。
         */
        public int chargeableSiteCount(List<ExaminationSiteOption> selected) {
            int units = selected.stream().mapToInt(ExaminationSiteOption::chargeableSiteUnits).sum();
            int effective = Math.max(1, units);
            return maxChargeableSiteCount == null ? effective : Math.min(effective, maxChargeableSiteCount);
        }

        /** 主项目收费数量：按部位计价时为计费部位数，其余方式为 1。 */
        public BigDecimal baseQuantity(int chargeableSiteCount) {
            return "PER_SITE".equals(sitePricingMode) ? BigDecimal.valueOf(chargeableSiteCount) : BigDecimal.ONE;
        }
    }

    record ExaminationSiteOption(Long variantId, String code, String name, Long bodySiteConceptId,
                                 String methodType, String mutualRecognitionCode, int chargeableSiteUnits) {}
}
