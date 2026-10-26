package com.rhn.platform.terminology.api;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * 检查部位词典：部位是编码体系 {@value #CODE_SYSTEM} 中的概念，别名用于检索与 AI 匹配，
 * 上级部位来自 PART_OF 概念关系。平台体系与租户扩展体系合并可见。
 */
public interface BodySiteDirectory {
    String CODE_SYSTEM = "RHN.BD.CS.BODY_SITE";

    /** 业务日期有效的全部部位，按编码排序。 */
    List<BodySite> listBodySites(Long tenantId, LocalDate atDate);

    /** 业务日期有效的部位；不在部位体系内、已停用或未生效时为空。 */
    Optional<BodySite> findBodySite(Long tenantId, Long conceptId, LocalDate atDate);

    record BodySite(Long conceptId, String code, String name, String searchCode, List<String> aliases,
                    List<Long> parentConceptIds) {}
}
