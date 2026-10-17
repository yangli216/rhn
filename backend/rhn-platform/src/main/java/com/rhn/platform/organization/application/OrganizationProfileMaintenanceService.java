package com.rhn.platform.organization.application;

import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.organization.api.OrganizationDictionaryCodes;
import com.rhn.platform.organization.domain.*;
import com.rhn.platform.organization.infrastructure.*;
import com.rhn.shared.api.RevisionGuard;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class OrganizationProfileMaintenanceService {
    private final ResponsibilityAssignmentPolicy responsibilityPolicy;
    private final JdbcTemplate jdbc;
    private final OrganizationApplicationService organizations;
    private final DepartmentApplicationService departments;
    private final OrganizationRepository organizationRepository;
    private final DepartmentRepository departmentRepository;
    private final PersonnelAssignmentRepository assignments;
    private final EmploymentRepository employments;
    private final PractitionerRepository people;
    private final DictionaryDirectory dictionaries;
    private final ExecutionContextProvider contexts;
    private final OrganizationChangeStore changes;
    public OrganizationProfileMaintenanceService(JdbcTemplate jdbc,OrganizationApplicationService organizations,
            DepartmentApplicationService departments,OrganizationRepository organizationRepository,
            DepartmentRepository departmentRepository,PersonnelAssignmentRepository assignments,EmploymentRepository employments,
            PractitionerRepository people,DictionaryDirectory dictionaries,ExecutionContextProvider contexts,OrganizationChangeStore changes, ResponsibilityAssignmentPolicy responsibilityPolicy) {
        this.responsibilityPolicy=responsibilityPolicy;
        this.jdbc=jdbc;this.organizations=organizations;this.departments=departments;this.organizationRepository=organizationRepository;
        this.departmentRepository=departmentRepository;this.assignments=assignments;this.employments=employments;
        this.people=people;this.dictionaries=dictionaries;this.contexts=contexts;this.changes=changes;
    }
    public record ProfileItemUpdate(@jakarta.validation.constraints.Min(0) long expectedRevision,@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max=1000) String reason,@jakarta.validation.constraints.NotNull LocalDate validFrom,LocalDate validTo,@jakarta.validation.constraints.NotBlank String sdDetailStatus,
            @jakarta.validation.constraints.Size(max=300) String identifierSystem,@jakarta.validation.constraints.Size(max=128) String identifierCode,@jakarta.validation.constraints.Size(max=32) String sdIdentifierType,Long issuerOrganizationId,Boolean primaryIdentifier,
            @jakarta.validation.constraints.Size(max=32) String sdContactType,@jakarta.validation.constraints.Size(max=300) String contactValue,@jakarta.validation.constraints.Size(max=32) String sdContactUse,Boolean primaryContact,Integer sortOrder,
            @jakarta.validation.constraints.Size(max=32) String sdAddressType,@jakarta.validation.constraints.Size(max=8) String countryCode,@jakarta.validation.constraints.Size(max=32) String provinceCode,@jakarta.validation.constraints.Size(max=32) String cityCode,@jakarta.validation.constraints.Size(max=32) String districtCode,@jakarta.validation.constraints.Size(max=500) String streetAddress,@jakarta.validation.constraints.Size(max=32) String postalCode,
            Long targetOrganizationId,Long targetDepartmentId,@jakarta.validation.constraints.Size(max=32) String sdRelationType,Boolean primaryRelation,@jakarta.validation.constraints.Size(max=1000) String description,
            @jakarta.validation.constraints.Size(max=32) String sdCapabilityType,@jakarta.validation.constraints.Size(max=128) String qualificationBasisCode,@jakarta.validation.constraints.Size(max=1000) String capabilityScope,@jakarta.validation.constraints.Size(max=32) String sdVerifyStatus,
            Long assignmentId,@jakarta.validation.constraints.Size(max=128) String externalResponsibleName,@jakarta.validation.constraints.Size(max=32) String sdResponsibilityType,Boolean primaryResponsibility) {}
    @Transactional
    public Object update(Long ownerId,boolean department,String section,Long itemId,ProfileItemUpdate input) {
        return maintain(ownerId,department,section,itemId,input,input.expectedRevision(),input.reason());
    }
    @Transactional
    public Object maintain(Long ownerId,boolean department,String section,Long itemId,ProfileItemUpdate input,long expectedRevision,String reason) {
        Long tenant=contexts.requireCurrent().tenantId();
        Object before=profile(ownerId,department);
        if(input.validFrom()==null || input.validTo()!=null && input.validTo().isBefore(input.validFrom()))
            throw badRequest("VALIDITY_PERIOD_INVALID","结束日期不能早于开始日期");
        if(!"ACTIVE".equals(input.sdDetailStatus()) && !"INACTIVE".equals(input.sdDetailStatus()))
            throw badRequest("PROFILE_STATUS_INVALID","资料状态必须是启用或作废");
        if(reason==null || reason.isBlank()) throw badRequest("CHANGE_REASON_REQUIRED","请填写变更原因");
        Map<String,Object> values=new LinkedHashMap<>();
        String suffix;
        switch(section) {
            case "identifier" -> {
                if(department) throw badRequest("PROFILE_SECTION_INVALID","科室不维护机构标识");
                suffix="IDENT"; values.put("CD_IDENT_SYS",required(input.identifierSystem(),300));values.put("CD_IDENT",required(input.identifierCode(),128));
                values.put("SD_IDENT_TYPE",dictionary(OrganizationDictionaryCodes.IDENTIFIER_TYPE,input.sdIdentifierType()));
                if(input.issuerOrganizationId()!=null) organizations.requireOrganization(tenant,input.issuerOrganizationId());
                values.put("ID_ORG_ISSUER",input.issuerOrganizationId());values.put("FG_PRIMARY_IDENT",Boolean.TRUE.equals(input.primaryIdentifier()));
                values.put("SD_VERIFY_STATUS",dictionary(OrganizationDictionaryCodes.VERIFY_STATUS,input.sdVerifyStatus()));
            }
            case "contact" -> {
                suffix="CONTACT"; values.put("SD_CONTACT_TYPE",dictionary(OrganizationDictionaryCodes.CONTACT_TYPE,input.sdContactType()));
                values.put("CONTACT_VALUE",required(input.contactValue(),300));values.put("CONTACT_USE",dictionary(OrganizationDictionaryCodes.CONTACT_USE,input.sdContactUse()));
                values.put("FG_PRIMARY_CONTACT",Boolean.TRUE.equals(input.primaryContact()));if(input.sortOrder()!=null && input.sortOrder()<0) throw badRequest("SORT_ORDER_INVALID","顺序不能为负数"); values.put("SN_SORT",input.sortOrder()==null ? 0:input.sortOrder());
            }
            case "address" -> {
                if(department) throw badRequest("PROFILE_SECTION_INVALID","科室不维护机构地址");suffix="ADDR";
                values.put("SD_ADDR_TYPE",dictionary(OrganizationDictionaryCodes.ADDRESS_TYPE,input.sdAddressType()));values.put("CD_COUNTRY",required(input.countryCode(),8));
                values.put("CD_PROV",input.provinceCode());values.put("CD_CITY",input.cityCode());values.put("CD_DIST",input.districtCode());
                values.put("DES_STREET_ADDR",required(input.streetAddress(),500));values.put("CD_POSTAL",input.postalCode());
            }
            case "relation" -> {
                suffix="REL";Long target=department ? input.targetDepartmentId():input.targetOrganizationId();
                if(target==null || target.equals(ownerId)) throw badRequest("RELATION_TARGET_INVALID","请选择其他组织节点");
                if(department) departments.requireEntity(tenant,target); else organizations.requireOrganization(tenant,target);
                values.put(department ? "ID_DEPT_TARGET":"ID_ORG_TARGET",target);
                values.put("SD_REL_TYPE",dictionary(department ? OrganizationDictionaryCodes.DEPARTMENT_RELATION_TYPE:OrganizationDictionaryCodes.RELATION_TYPE,input.sdRelationType()));
                values.put("FG_PRIMARY_REL",Boolean.TRUE.equals(input.primaryRelation()));values.put(department ? "DES_DEPT_REL":"DES_ORG_REL",input.description());
            }
            case "capability" -> {
                suffix="CAP";values.put("SD_CAP_TYPE",dictionary(OrganizationDictionaryCodes.CAPABILITY_TYPE,input.sdCapabilityType()));
                values.put("CD_QUALIF_BASIS",input.qualificationBasisCode());values.put("DES_CAP_SCOPE",input.capabilityScope());
                values.put("SD_VERIFY_STATUS",dictionary(OrganizationDictionaryCodes.VERIFY_STATUS,input.sdVerifyStatus()));
            }
            case "responsibility" -> {
                suffix="RESP";String external=com.rhn.shared.text.Strings.trimToNull(input.externalResponsibleName());
                if(external!=null) external=required(external,100);
                if((input.assignmentId()==null)==(external==null || external.isBlank())) throw badRequest("RESPONSIBILITY_SUBJECT_INVALID","内部任职和外部姓名必须且只能填写一项");
                if(input.assignmentId()!=null) responsibilityPolicy.validate(input.assignmentId(),ownerId,department,input.validFrom(),input.validTo(),"ACTIVE".equals(input.sdDetailStatus()));
                values.put("ID_STAFF_ASSIGN",input.assignmentId());values.put("NA_EXT_RSPNSBL",external);
                values.put("SD_RESP_TYPE",dictionary(department ? OrganizationDictionaryCodes.DEPARTMENT_RESPONSIBILITY_TYPE:OrganizationDictionaryCodes.RESPONSIBILITY_TYPE,input.sdResponsibilityType()));
                values.put("FG_PRIMARY_RESP",Boolean.TRUE.equals(input.primaryResponsibility()));
            }
            default -> throw badRequest("PROFILE_SECTION_INVALID","不支持的资料类别");
        }
        values.put("DA_VALID_FROM",input.validFrom());values.put("DA_VALID_TO",input.validTo());values.put("SD_STATUS",input.sdDetailStatus());
        String base=department ? "DEPT":"ORG",table="RHN_SYS_"+base+"_"+suffix;
        String ownerColumn="ID_"+base+("relation".equals(section)?"_SRC":"");
        String itemColumn="ID_"+base+"_"+suffix;
        RevisionGuard.run("PROFILE_REVISION_CONFLICT","组织档案已变化，请刷新后重试",() -> {
            if(department) {
                var owner=departments.requireEntity(tenant,ownerId);owner.changeStatus(owner.status(),expectedRevision,contexts.requireCurrent().subjectId());
                departmentRepository.saveAndFlush(owner);
            } else {
                var owner=organizationRepository.findByIdAndTenantId(ownerId,tenant).orElseThrow();
                owner.changeStatus(owner.status(),expectedRevision,contexts.requireCurrent().subjectId());organizationRepository.saveAndFlush(owner);
            }
            var args=new java.util.ArrayList<>(values.values());args.add(tenant);args.add(ownerId);args.add(itemId);
            String columns=values.keySet().stream().map(k -> k+"=?").collect(java.util.stream.Collectors.joining(","));
            try {
                if(itemId==null) {
                    values.put("ID_TNT",tenant);values.put(ownerColumn,ownerId);values.put(itemColumn,com.rhn.shared.id.GlobalIds.next());
                    jdbc.update("insert into "+table+" ("+String.join(",",values.keySet())+") values ("
                        +java.util.Collections.nCopies(values.size(),"?").stream().collect(java.util.stream.Collectors.joining(","))+")",values.values().toArray());
                } else if(jdbc.update("update "+table+" set "+columns+" where ID_TNT=? and "+ownerColumn+"=? and "+itemColumn+"=?",args.toArray())!=1)
                    throw notFound("PROFILE_ITEM_NOT_FOUND","资料记录不属于当前组织或已不存在");
            } catch(org.springframework.dao.DataIntegrityViolationException exception) {
                throw conflict("PROFILE_ITEM_CONFLICT","资料编码、类型或生效日期与其他记录冲突，请核实后重试");
            }
        });
        Object after=profile(ownerId,department);changes.record(department ? "DEPARTMENT":"ORGANIZATION",ownerId,
            (itemId==null ? "CREATE_":"UPDATE_")+section.toUpperCase(java.util.Locale.ROOT),before,after,reason);return after;
    }
    private Object profile(Long id,boolean department) { return department ? departments.profile(id):organizations.getOrganizationProfile(id); }
    private String dictionary(String code,String value) {
        String normalized=required(value,128);
        if(dictionaries.resolveActiveItems(contexts.requireCurrent().tenantId(),code).stream().noneMatch(v -> normalized.equals(v.code())))
            throw badRequest("DICTIONARY_ITEM_INVALID","请选择有效字典项");return normalized;
    }
    private String required(String value,int max) { if(value==null || value.isBlank() || value.trim().length()>max) throw badRequest("PROFILE_FIELD_INVALID","请完整填写资料且不要超过字段长度");return value.trim(); }
}
