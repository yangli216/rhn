package com.rhn.outpatient.ordering;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;

import java.util.List;

/**
 * 医生站开检查时可选的部位与数量换算规则；configured=false 表示项目未维护检查部位配置，不显示部位选择。
 * 数量按 sitePricingMode 换算，正式数量以服务端保存回执为准。
 */
record ExaminationSiteOptionsResponse(Long catalogItemId, boolean configured, boolean bodySiteRequired,
                                      boolean multiBodySite, Integer maxBodySiteCount, String sitePricingMode,
                                      Integer maxChargeableSiteCount, List<ExaminationSiteChoice> sites) {
    record ExaminationSiteChoice(String code, String name,
            @DictionaryBinding(MasterDataDictionaryCodes.SERVICE_VARIANT_METHOD) String methodType) {}
}
