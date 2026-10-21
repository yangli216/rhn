package com.rhn.outpatient.ordering;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;

import java.util.List;

/** 一张拟建申请单；itemIndexes 指向提交的服务项目下标，预览与整批保存共用同一结果。 */
record ServiceDocumentPlan(@DictionaryBinding(MasterDataDictionaryCodes.SERVICE_TYPE) String serviceType, String title, Long performerOrganizationId, Long performerDepartmentId,
                           String groupingRule, String groupingValue, List<String> ruleReasons,
                           List<Integer> itemIndexes) {}
