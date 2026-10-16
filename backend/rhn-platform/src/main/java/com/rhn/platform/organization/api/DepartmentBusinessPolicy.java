package com.rhn.platform.organization.api;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** Classification describes the department; capability records never grant account permissions. */
public final class DepartmentBusinessPolicy {
    public record RuntimeUse(String code,String name,boolean classificationMatches,String requirement) {}
    public record DepartmentBusinessConfiguration(List<RuntimeUse> runtimeUses,List<String> suggestedCapabilityTypes,List<String> warnings) {}
    public static DepartmentBusinessConfiguration describe(DepartmentView department) {
        String type=department.sdDepartmentType()==null ? "":department.sdDepartmentType();
        String property=department.sdDepartmentProperty()==null ? "":department.sdDepartmentProperty();
        boolean pharmacy=java.util.Set.of("MED_PHARMACY_WAREHOUSE", "MED_PHARMACY_OUTPATIENT", "MED_PHARMACY_INPATIENT", "MED_PHARMACY_EMERGENCY", "MED_PHARMACY_TCM", "MED_PHARMACY_PREPARATION").contains(type);
        boolean laboratory=type.equals("30") || type.startsWith("30.");
        boolean imaging=type.equals("32") || type.startsWith("32.");
        boolean imagingDefault=java.util.Set.of("32", "32.01", "32.02", "32.03", "32.04", "32.05", "32.06", "32.07", "32.08").contains(type);
        List<RuntimeUse> uses=List.of(
            new RuntimeUse("OUTPATIENT","门诊排班与院内转科",property.equals("CLINICAL"),"临床业务属性；还须有效科室、已发布排班、有效任职和业务权限"),
            new RuntimeUse("NURSING","住院护理单元",property.equals("NURSING"),"护理业务属性；还须有效科室、病区配置和护理权限"),
            new RuntimeUse("PHARMACY","药品库存场所同步",pharmacy,"明确的药库或药房类型；新增科室会同步库存场所，实际业务仍校验库存场所和权限"),
            new RuntimeUse("LABORATORY","检验默认执行科室",laboratory,"检验类型及有效非虚拟科室；项目明确指定优先，候选多个时必须人工指定"),
            new RuntimeUse("IMAGING","检查默认执行科室",imagingDefault,"通用类型 32 或已支持的专业类型 32.01～32.08；项目明确指定优先，还须有效非虚拟科室、执行工作台与业务权限")
        );
        var capabilities=new ArrayList<String>();
        if(property.equals("CLINICAL")) capabilities.add("OUTPATIENT");
        if(property.equals("NURSING")) capabilities.add("NURSING");
        if(pharmacy || property.equals("PHARMACY")) capabilities.add("PHARMACY");
        if(laboratory) capabilities.add("LABORATORY");
        if(imaging) capabilities.add("IMAGING");
        if(property.equals("RESEARCH_EDUCATION")) { capabilities.add("TEACHING");capabilities.add("RESEARCH"); }
        var warnings=new ArrayList<String>();
        if(imaging && !imagingDefault) warnings.add("此检查专业类型尚未接入默认执行科室匹配，请为服务项目明确配置执行科室；能力登记不会自动建立路由");
        if(pharmacy && !property.equals("PHARMACY")) warnings.add("药库/药房类型建议使用药学业务属性；兼容旧的医技属性，库存场所仍由具体类型识别");
        if((laboratory || imaging) && !property.equals("MEDICAL_TECHNOLOGY")) warnings.add("检验/检查类型与业务属性不一致，建议维护为医技科室，避免被当作临床排班科室");
        if(property.isBlank()) warnings.add("尚未维护业务属性，部分业务入口无法识别此科室");
        if(!active(department,LocalDate.now())) warnings.add("当前科室未生效、已结束或已停用；分类符合不代表当前可开展业务");
        if(department.virtual()) warnings.add("虚拟科室不参与检验检查默认执行科室选择");
        return new DepartmentBusinessConfiguration(uses,capabilities,warnings);
    }
    public static boolean active(DepartmentView value,LocalDate at) {
        return "ACTIVE".equals(value.sdOrgStatus()) && value.validFrom()!=null && !value.validFrom().isAfter(at)
            && (value.validTo()==null || !value.validTo().isBefore(at));
    }
    private DepartmentBusinessPolicy() {}
}
