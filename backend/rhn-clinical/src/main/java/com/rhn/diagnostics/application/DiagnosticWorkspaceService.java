package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.diagnostics.application.DiagnosticExchangeService.*;
import com.rhn.diagnostics.domain.*;
import com.rhn.diagnostics.infrastructure.DiagnosticReportDraftRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticLocalCommandRepository;
import com.rhn.outpatient.api.ServiceRequestDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class DiagnosticWorkspaceService {
    private static final String LOCAL_ENDPOINT = "RHN-LOCAL";
    private final DiagnosticExecutionService execution;
    private final DiagnosticExchangeService exchange;
    private final DiagnosticReportRepository reports;
    private final DiagnosticReportDraftRepository drafts;
    private final ServiceRequestDirectory requests;
    private final ExecutionContextProvider contextProvider;
    private final DiagnosticSigningPolicy signing;
    private final JsonCodec json;
    private final DiagnosticLocalCommandRepository commands;
    private final DiagnosticImageService images;
    private final DiagnosticTemplateResolver templates;
    public DiagnosticWorkspaceService(DiagnosticExecutionService execution, DiagnosticExchangeService exchange,
            DiagnosticReportRepository reports, DiagnosticReportDraftRepository drafts,
            ServiceRequestDirectory requests, ExecutionContextProvider contextProvider,
            DiagnosticSigningPolicy signing, JsonCodec json, DiagnosticLocalCommandRepository commands,
            DiagnosticImageService images, DiagnosticTemplateResolver templates) {
        this.execution=execution; this.exchange=exchange; this.reports=reports; this.drafts=drafts;
        this.requests=requests; this.contextProvider=contextProvider; this.signing=signing; this.json=json;
        this.commands=commands;
        this.images=images; this.templates=templates;
    }
    @Transactional
    public com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory.TemplateView template(Long taskId) {
        var task = execution.requireLocalTask(taskId);
        return templates.current(requests.requireForDiagnosticExchange(task.requestId()));
    }
    @Transactional
    public DraftView draft(Long taskId) {
        var task=execution.requireLocalTask(taskId);
        return view(task, drafts.findByTenantIdAndTaskId(task.tenantId(), taskId).orElse(null));
    }
    @Transactional
    public DraftView saveDraft(Long taskId, LocalReportCommand input) {
        var task=execution.requireLocalReportable(taskId,input.expectedRevision(),correction(input));
        com.rhn.diagnostics.api.DiagnosticPermissions.require(contextProvider.requireCurrent(),task.requestType(),"EDIT");
        var draft=save(task,input); drafts.flush(); return view(task,draft);
    }
    private DiagnosticReportDraft save(DiagnosticExecutionTask task, LocalReportCommand input) {
        var context=contextProvider.requireCurrent();
        var draft=drafts.lockByTenantIdAndTaskId(task.tenantId(),task.id()).orElse(null);
        long expected=input.expectedDraftRevision()==null?0:input.expectedDraftRevision();
        if ((draft==null?0:draft.revision())!=expected) throw conflict("DIAGNOSTIC_DRAFT_REVISION_CONFLICT","草稿已被更新，请重新读取");
        if (draft!=null && draft.issuedReportId()!=null && !correction(input)) throw conflict("DIAGNOSTIC_REPORT_ALREADY_ISSUED","报告已签发，请通过更正继续修改");
        Long savedVersion = draft == null ? null : json.read(draft.content(), LocalReportCommand.class).templateVersionId();
        input = templates.resolve(requests.requireForDiagnosticExchange(task.requestId()), input, savedVersion);
        if (draft==null) draft=drafts.save(new DiagnosticReportDraft(task.tenantId(),task.id(),json.write(input),context.subjectId(),context.actor()));
        else draft.update(json.write(input),context.subjectId(),context.actor());
        return draft;
    }
    @Transactional
    public DiagnosticReportResponse issueDraft(Long taskId, IssueDraftCommand input) {
        // Every local writer locks the task before its draft.
        var task=execution.requireLocalTask(taskId);
        com.rhn.diagnostics.api.DiagnosticPermissions.require(contextProvider.requireCurrent(),task.requestType(),"SIGN");
        var replay=replay(task,input.commandId(),"DRAFT:"+json.write(input));
        if(replay!=null) return replay;
        var draft=drafts.lockByTenantIdAndTaskId(task.tenantId(),taskId).orElseThrow(()->conflict("DIAGNOSTIC_DRAFT_REQUIRED","请先保存草稿"));
        if (draft.issuedReportId()!=null && Objects.equals(draft.issueCommandId(),input.commandId())) return issued(task,draft);
        if (draft.issuedReportId()!=null) throw conflict("DIAGNOSTIC_REPORT_ALREADY_ISSUED","草稿已签发，请刷新报告");
        if (draft.revision()!=input.expectedDraftRevision()) throw conflict("DIAGNOSTIC_DRAFT_REVISION_CONFLICT","草稿已被更新，请重新读取");
        var content=json.read(draft.content(),LocalReportCommand.class);
        execution.requireLocalReportable(taskId,input.expectedRevision(),correction(content));
        var report=issue(task,draft,content,input.commandId());
        remember(task,input.commandId(),"DRAFT:"+json.write(input),report.id());
        return report;
    }
    @Transactional
    public DiagnosticReportResponse recordLocalReport(Long taskId, LocalReportCommand input) {
        var task=execution.requireLocalTask(taskId);
        com.rhn.diagnostics.api.DiagnosticPermissions.require(contextProvider.requireCurrent(),task.requestType(),"SIGN");
        String command=Strings.trimToNull(input.commandId());
        if(command==null) command="LOCAL-RPT-"+taskId+"-R"+input.expectedRevision();
        var replay=replay(task,command,"DIRECT:"+json.write(input));
        if(replay!=null) return replay;
        com.rhn.diagnostics.api.DiagnosticPermissions.require(contextProvider.requireCurrent(),task.requestType(),"EDIT");
        var existing=drafts.lockByTenantIdAndTaskId(task.tenantId(),taskId).orElse(null);
        if(existing!=null && Objects.equals(existing.issueCommandId(),command)) {
            if(!existing.content().equals(json.write(input))) throw conflict("DIAGNOSTIC_COMMAND_CONTENT_CONFLICT","同一请求不能签发不同内容");
            return issued(task,existing);
        }
        if(doubleSign(task)) throw conflict("DIAGNOSTIC_SECOND_SIGNER_REQUIRED","机构启用双签，请保存草稿后由另一人审核并签发");
        execution.requireLocalReportable(taskId,input.expectedRevision(),correction(input));
        var saved = save(task,input);
        var report=issue(task,saved,json.read(saved.content(),LocalReportCommand.class),command);
        remember(task,command,"DIRECT:"+json.write(input),report.id());
        return report;
    }
    private DiagnosticReportResponse issue(DiagnosticExecutionTask task, DiagnosticReportDraft draft, LocalReportCommand input, String command) {
        var context=contextProvider.requireCurrent();
        boolean secondSignerRequired = doubleSign(task);
        if(secondSignerRequired && draft.authorId().equals(context.subjectId())) throw conflict("DIAGNOSTIC_SECOND_SIGNER_REQUIRED","双签必须由另一人审核并签发");
        var request=requests.requireForDiagnosticExchange(task.requestId());
        var draftImages = images.draftImages(task.id());
        templates.requireComplete(input, draftImages.size());
        if ("EXAMINATION".equals(task.requestType()) && (DiagnosticTemplateResolver.hasPlaceholder(input.findings())
                || DiagnosticTemplateResolver.hasPlaceholder(input.conclusion())))
            throw conflict("EXAMINATION_PLACEHOLDER_REQUIRED", "报告含未填写的词条占位项，请补全后签发");
        String externalId="LOCAL-"+request.requestNo();
        var previous=reports.findTopByTenantIdAndEndpointCodeAndExternalReportIdOrderByReportVersionDesc(request.tenantId(),LOCAL_ENDPOINT,externalId).orElse(null);
        if(previous!=null && !correction(input)) throw conflict("DIAGNOSTIC_CORRECTION_REASON_REQUIRED","更正报告必须填写原因");
        var observations="LABORATORY".equals(request.serviceType())?observations(request,input,draft):List.<ObservationCommand>of();
        var report=exchange.ingestLocalReport(new ReportCommand(LOCAL_ENDPOINT,command,context.correlationId(),request.requestNo(),externalId,
            previous==null?1:previous.reportVersion()+1,"EXAMINATION".equals(request.serviceType())?"IMAGING":"LABORATORY",
            previous==null?"FINAL":"CORRECTED",request.itemCode(),request.itemName()+"报告",Instant.now(),Strings.trimToNull(input.conclusion()),
            draft.authorId().toString(),draft.authorName(),observations),
            new LocalSignature(Strings.trimToNull(input.findings()),draft.authorId(),Strings.trimToNull(input.correctionReason()),
                secondSignerRequired, draftImages, input.templateVersionId(), input.templateSnapshot()));
        images.freeze(task, report.id());
        draft.issued(report.id(),command); drafts.flush();
        return issued(task, draft);
    }
    private List<ObservationCommand> observations(ServiceRequestDirectory.ServiceRequestSnapshot request, LocalReportCommand input, DiagnosticReportDraft draft) {
        var items=input.observations();
        if(items==null || items.isEmpty()) items=List.of(new LocalObservation(request.itemCode(),request.itemName(),input.valueType(),input.observationValue(),
            input.unitCode(),input.referenceRangeLow(),input.referenceRangeHigh(),input.interpretationCode()));
        if(items.size()>200) throw badRequest("LABORATORY_RESULTS_LIMIT","单份报告最多200个指标");
        var codes=new HashSet<String>();
        for(var item:items) if(!codes.add(required(item.observationCode(),"LABORATORY_RESULT_CODE_REQUIRED","指标代码不能为空")))
            throw badRequest("LABORATORY_RESULT_DUPLICATE","不能重复录入相同指标");
        return items.stream().filter(item -> input.templateVersionId() == null || Strings.trimToNull(item.observationValue()) != null)
            .map(item->observation(item,draft)).toList();
    }
    private ObservationCommand observation(LocalObservation item, DiagnosticReportDraft draft) {
        String code=required(item.observationCode(),"LABORATORY_RESULT_CODE_REQUIRED","指标代码不能为空");
        String name=required(item.observationName(),"LABORATORY_RESULT_NAME_REQUIRED","指标名称不能为空");
        String value=required(item.observationValue(),"LABORATORY_RESULT_VALUE_REQUIRED","检验结果值不能为空");
        String type=Strings.trimToNull(item.valueType()); if(type==null) type="STRING";
        BigDecimal number=null; String text=null; String coded=null;
        if("NUMBER".equals(type)) { try { number=new BigDecimal(value); } catch(NumberFormatException error) { throw badRequest("LABORATORY_RESULT_NUMBER_INVALID","数值型结果格式不正确"); } }
        else if("STRING".equals(type)) text=value; else if("CODE".equals(type)) coded=value;
        else throw badRequest("LABORATORY_RESULT_TYPE_INVALID","检验结果类型不受支持");
        String comparator = Strings.trimToNull(item.valueComparator());
        if (comparator != null && !java.util.Set.of("EQ", "LT", "LE", "GT", "GE").contains(comparator)
                || comparator != null && !"EQ".equals(comparator) && number == null)
            throw badRequest("LABORATORY_COMPARATOR_INVALID", "只有数值结果可使用有效比较符");
        String flag=Strings.trimToNull(item.interpretationCode());
        // An absent interval or interpretation must not imply normality.
        if(number!=null && item.ruleSnapshot()==null && comparator!=null && !"EQ".equals(comparator)) {
            if ("N".equals(flag) || "NORMAL".equals(flag)) throw badRequest("LABORATORY_CENSORED_NORMAL_INVALID", "比较符结果不能人工默认为正常");
            if (flag == null) {
                var rule = new com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory.ReferenceRule("MANUAL", null,null,null,null,null,
                    item.referenceRangeLow(),item.referenceRangeHigh(),null,null,List.of());
                var definition = new com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory.Indicator(code,name,"NUMBER",item.unitCode(),null,
                    true,null,null,List.of(),List.of(rule));
                flag = LaboratoryRuleEvaluator.evaluate(definition,value,comparator,item.unitCode(),
                    new LaboratoryRuleEvaluator.PatientConditions(null,null,null,null)).interpretationCode();
            }
        } else if(number!=null && flag==null && item.ruleSnapshot()==null) {
            if(item.referenceRangeLow()!=null && number.compareTo(item.referenceRangeLow())<0) flag="L";
            else if(item.referenceRangeHigh()!=null && number.compareTo(item.referenceRangeHigh())>0) flag="H";
        }
        return new ObservationCommand("urn:rhn:local:diagnostics",null,code,name,type,Instant.now(),text,number,null,coded,null,
            Strings.trimToNull(item.unitCode()),item.referenceRangeLow(),item.referenceRangeHigh(),flag,draft.authorId().toString(),draft.authorName(), comparator, item.ruleStatus(), item.ruleSnapshot());
    }
    private DraftView view(DiagnosticExecutionTask task, DiagnosticReportDraft draft) {
        boolean active=draft!=null && draft.issuedReportId()==null;
        return new DraftView(draft==null?0:draft.revision(),active?json.read(draft.content(),LocalReportCommand.class):null,
            active?draft.authorId():null,active?draft.authorName():null,draft==null?null:draft.updatedAt(),doubleSign(task));
    }
    private DiagnosticReportResponse issued(DiagnosticExecutionTask task, DiagnosticReportDraft draft) {
        return exchange.listByRequest(task.requestId()).stream().filter(report->report.id().equals(draft.issuedReportId())).findFirst()
            .orElseThrow(()->conflict("DIAGNOSTIC_REPORT_EVIDENCE_REQUIRED","签发记录对应的报告不存在"));
    }
    private boolean doubleSign(DiagnosticExecutionTask task) { return signing.requiresSecondSigner(contextProvider.requireCurrent(),task.requestType(),task.organizationId()); }
    private DiagnosticReportResponse replay(DiagnosticExecutionTask task,String command,String content) {
        var receipt=commands.findByTenantIdAndTaskIdAndCommandId(task.tenantId(),task.id(),command).orElse(null);
        if(receipt==null) return null;
        if(!receipt.contentHash().equals(DiagnosticContentHash.sha256(content)))
            throw conflict("DIAGNOSTIC_COMMAND_CONTENT_CONFLICT","同一签发请求不能用于不同内容");
        return exchange.listByRequest(task.requestId()).stream().filter(report->receipt.reportId().equals(report.id())).findFirst()
            .orElseThrow(()->conflict("DIAGNOSTIC_REPORT_EVIDENCE_REQUIRED","签发回执对应的报告不存在"));
    }
    private void remember(DiagnosticExecutionTask task,String command,String content,Long reportId) {
        commands.saveAndFlush(new DiagnosticLocalCommand(task.tenantId(),task.id(),command,DiagnosticContentHash.sha256(content),reportId));
    }
    private boolean correction(LocalReportCommand input) { return Strings.trimToNull(input.correctionReason())!=null; }
    private String required(String value,String code,String message) { var result=Strings.trimToNull(value); if(result==null) throw badRequest(code,message); return result; }
    public record LocalObservation(String observationCode,String observationName,String valueType,String observationValue,
        String unitCode,BigDecimal referenceRangeLow,BigDecimal referenceRangeHigh,String interpretationCode,
        String valueComparator,String instrumentCode,String populationCode,String ruleStatus,String ruleSnapshot) {
        public LocalObservation(String observationCode,String observationName,String valueType,String observationValue,
                String unitCode,BigDecimal referenceRangeLow,BigDecimal referenceRangeHigh,String interpretationCode) {
            this(observationCode,observationName,valueType,observationValue,unitCode,referenceRangeLow,referenceRangeHigh,
                interpretationCode,null,null,null,null,null);
        }
    }
    public record LocalReportCommand(long expectedRevision,String valueType,String observationValue,String unitCode,
        BigDecimal referenceRangeLow,BigDecimal referenceRangeHigh,String interpretationCode,String conclusion,
        List<LocalObservation> observations,String findings,Long expectedDraftRevision,String correctionReason,String commandId,
        Long templateVersionId,String templateSnapshot) {
        public LocalReportCommand(long expectedRevision,String valueType,String observationValue,String unitCode,
                BigDecimal referenceRangeLow,BigDecimal referenceRangeHigh,String interpretationCode,String conclusion,
                List<LocalObservation> observations,String findings,Long expectedDraftRevision,String correctionReason,String commandId) {
            this(expectedRevision,valueType,observationValue,unitCode,referenceRangeLow,referenceRangeHigh,interpretationCode,
                conclusion,observations,findings,expectedDraftRevision,correctionReason,commandId,null,null);
        }
    }
    public record DraftView(long revision,LocalReportCommand content,Long authorId,String authorName,Instant updatedAt,boolean doubleSignatureRequired) {}
    public record IssueDraftCommand(long expectedRevision,long expectedDraftRevision,String commandId) {}
}
