package com.rhn.diagnostics.application;

import com.rhn.diagnostics.domain.DiagnosticExecutionTask;
import com.rhn.diagnostics.domain.DiagnosticExecutionTaskStatus;
import com.rhn.diagnostics.domain.DiagnosticSpecimen;
import com.rhn.diagnostics.domain.DiagnosticSpecimenTask;
import com.rhn.diagnostics.domain.DiagnosticSpecimenBatch;
import com.rhn.diagnostics.infrastructure.DiagnosticSpecimenBatchRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticExecutionTaskRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticSpecimenRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticSpecimenTaskRepository;
import com.rhn.outpatient.api.ServiceRequestDirectory;
import com.rhn.platform.masterdata.api.LaboratorySpecimenDirectory;
import com.rhn.platform.masterdata.api.MedicalOperationsCommands.LaboratoryOrderItemCommand;
import com.rhn.platform.numbering.api.BusinessNumberContext;
import com.rhn.platform.numbering.api.BusinessNumberGenerator;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.text.Strings;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Objects;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
@Transactional
public class DiagnosticSpecimenService {
    private final DiagnosticExecutionService execution;
    private final DiagnosticExecutionTaskRepository tasks;
    private final DiagnosticSpecimenRepository specimens;
    private final DiagnosticSpecimenTaskRepository links;
    private final ServiceRequestDirectory requests;
    private final LaboratorySpecimenDirectory catalog;
    private final BusinessNumberGenerator numbers;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;
    private final DiagnosticSpecimenBatchRepository batches;
    public DiagnosticSpecimenService(DiagnosticExecutionService execution, DiagnosticExecutionTaskRepository tasks,
            DiagnosticSpecimenRepository specimens, DiagnosticSpecimenTaskRepository links,
            ServiceRequestDirectory requests, LaboratorySpecimenDirectory catalog,
            BusinessNumberGenerator numbers, ExecutionContextProvider contexts, JsonCodec json, DiagnosticSpecimenBatchRepository batches) {
        this.execution=execution;this.tasks=tasks;this.specimens=specimens;this.links=links;
        this.requests=requests;this.catalog=catalog;this.numbers=numbers;this.contexts=contexts;
        this.json=json;
        this.batches=batches;
    }
    public List<SpecimenView> forTask(Long taskId) {
        var task=execution.requireLocalTask(taskId);
        return specimens.findForTask(task.tenantId(),taskId).stream().map(this::view).toList();
    }
    public SpecimenView scan(String number) {
        var context=contexts.requireCurrent();
        var specimen=specimens.findByTenantIdAndOrganizationIdAndSpecimenNo(context.tenantId(),context.organizationId(),number)
            .orElseThrow(()->notFound("DIAGNOSTIC_SPECIMEN_NOT_FOUND","未找到当前机构标本"));
        associated(specimen); return view(specimen);
    }
    public List<SpecimenView> generate(GenerateCommand input) {
        if(input.tasks()==null || input.tasks().isEmpty() || input.tasks().size()>50) throw badRequest("DIAGNOSTIC_SPECIMEN_TASKS_REQUIRED","请选1至50项申请");
        var context=contexts.requireCurrent();
        var selected=input.tasks().stream().sorted(java.util.Comparator.comparing(TaskSelection::taskId)).toList();
        com.rhn.diagnostics.api.DiagnosticPermissions.require(context,"LABORATORY","EXECUTE");
        String commandHash=hash(json.write(selected));
        if(selected.stream().map(TaskSelection::taskId).distinct().count()!=selected.size()) throw badRequest("DIAGNOSTIC_SPECIMEN_DUPLICATE_TASK","不能重复选择相同申请");
        var locked=new ArrayList<DiagnosticExecutionTask>();
        for(var item:selected) locked.add(execution.requireLocalTask(item.taskId()));
        var existing=specimens.findByTenantIdAndOrganizationIdAndCreationCommandOrderByCreatedAtAsc(context.tenantId(),context.organizationId(),input.commandId());
        if(!existing.isEmpty()) {
            var ids=existing.stream().flatMap(s->links.findByTenantIdAndSpecimenId(s.tenantId(),s.id()).stream()).map(DiagnosticSpecimenTask::taskId).distinct().sorted().toList();
            if(!ids.equals(selected.stream().map(TaskSelection::taskId).toList()) || existing.stream().anyMatch(s->!commandHash.equals(s.commandHash()))) throw conflict("DIAGNOSTIC_COMMAND_CONTENT_CONFLICT","同一标本请求不能用于不同内容");
            return existing.stream().map(this::view).toList();
        }
        var owner=locked.getFirst(); var orders=new ArrayList<LaboratoryOrderItemCommand>();
        var byService=new HashMap<Long,DiagnosticExecutionTask>();
        for(int i=0;i<locked.size();i++) {
            var task=locked.get(i); task.requireReadySpecimen();
            if(task.revision()!=selected.get(i).expectedRevision()) throw conflict("DIAGNOSTIC_TASK_REVISION_CONFLICT","申请已被更新，请刷新");
            if(!Objects.equals(owner.residentId(),task.residentId()) || !Objects.equals(owner.encounterId(),task.encounterId()))
                throw conflict("DIAGNOSTIC_SPECIMEN_PATIENT_MISMATCH","只能为同一患者同次就诊共同分管");
            if(!specimens.findForTask(task.tenantId(),task.id()).isEmpty())
                throw conflict("DIAGNOSTIC_SPECIMEN_ALREADY_PLANNED","申请已有标本，请继续采集或重采");
            var request=requests.requireForDiagnosticExchange(task.requestId());
            if(byService.put(request.catalogItemId(),task)!=null) throw badRequest("DIAGNOSTIC_SPECIMEN_AMBIGUOUS_REQUEST","同一项目的多张申请请分批采集");
            int quantity;try { quantity=request.quantity().intValueExact(); } catch(ArithmeticException error) { throw badRequest("DIAGNOSTIC_SPECIMEN_QUANTITY_INVALID","检验次数必须为整数"); }
            orders.add(new LaboratoryOrderItemCommand(request.catalogItemId(),selected.get(i).specimenConfigurationId(),quantity));
        }
        var plan=catalog.laboratoryTubePlan(orders); var result=new ArrayList<DiagnosticSpecimen>();
        if(plan.groups().isEmpty() || plan.groups().stream().mapToLong(group->group.tubeCount()).sum()>100)
            throw badRequest("DIAGNOSTIC_SPECIMEN_TUBE_LIMIT","单批标本必须为1至100管");
        batches.saveAndFlush(new DiagnosticSpecimenBatch(context.tenantId(),context.organizationId(),input.commandId(),commandHash));
        for(var group:plan.groups()) for(int i=0;i<group.tubeCount();i++) {
            var specimen=specimens.save(new DiagnosticSpecimen(owner,numbers.next("diagnostic-specimen",new BusinessNumberContext(owner.tenantId(),owner.organizationId(),owner.departmentId())),
                group.specimenCode(),group.specimenName(),group.containerCode(),group.containerName(),input.commandId(),commandHash,null));
            for(Long serviceId:group.serviceIds()) links.save(new DiagnosticSpecimenTask(owner.tenantId(),specimen.id(),byService.get(serviceId).id()));
            result.add(specimen);
        }
        specimens.flush(); return result.stream().map(this::view).toList();
    }
    public SpecimenView collect(Long id,long expectedRevision) {
        requireExecute();
        var context = contexts.requireCurrent();
        Long actorId = context.subjectId();
        var loaded = require(id);
        var associated = associated(loaded);
        var specimen = specimens.lockByIdAndTenantId(id, loaded.tenantId()).orElseThrow();
        for (var task : associated) {
            if (task.status() != DiagnosticExecutionTaskStatus.READY && task.status() != DiagnosticExecutionTaskStatus.COLLECTED) {
                throw conflict("DIAGNOSTIC_SPECIMEN_TASK_STATE_INVALID", "申请状态不允许采集");
            }
        }
        specimen.collect(expectedRevision, actorId);
        specimens.flush();
        Instant now = Instant.now();
        for (var task : associated) {
            task.recordSpecimenCollection(specimen.specimenNo(), actorId, specimen.collectedAt());
            var active = active(task);
            if (task.status() == DiagnosticExecutionTaskStatus.READY
                    && active.stream().allMatch(s -> "COLLECTED".equals(s.status()) || "RECEIVED".equals(s.status()))) {
                task.markCollectedFromSpecimens(active.getFirst().specimenNo(), "实际标本共" + active.size() + "管", actorId, now);
            }
        }
        tasks.flush();
        return view(specimen);
    }
    public SpecimenView receive(Long id,long revision) {
        requireExecute();
        var loaded=require(id); associated(loaded);
        var specimen=specimens.lockByIdAndTenantId(id,loaded.tenantId()).orElseThrow();
        specimen.receive(revision,contexts.requireCurrent().subjectId());specimens.flush();return view(specimen);
    }
    public SpecimenView reject(Long id,long revision,String reason) {
        requireExecute();
        String cleaned=Strings.trimToNull(reason);if(cleaned==null) throw badRequest("DIAGNOSTIC_SPECIMEN_REJECTION_REASON_REQUIRED","请填写拒收原因");
        var loaded=require(id);var associated=associated(loaded);var specimen=specimens.lockByIdAndTenantId(id,loaded.tenantId()).orElseThrow();
        for(var task:associated) task.rejectSpecimen(cleaned);
        specimen.reject(revision,contexts.requireCurrent().subjectId(),cleaned);specimens.flush();tasks.flush();return view(specimen);
    }
    public SpecimenView recollect(Long id,long revision,String commandId) {
        requireExecute();
        var loaded=require(id);var associated=associated(loaded);var previous=specimens.lockByIdAndTenantId(id,loaded.tenantId()).orElseThrow();
        var existing=specimens.findByTenantIdAndPreviousSpecimenId(previous.tenantId(),id).orElse(null);
        String commandHash=hash(json.write(List.of(id,revision)));
        if(existing!=null) {
            if(!commandId.equals(existing.creationCommand()) || !commandHash.equals(existing.commandHash()))
                throw conflict("DIAGNOSTIC_SPECIMEN_ALREADY_REPLACED","此拒收标本已安排重采，请使用新条码");
            return view(existing);
        }
        if(previous.revision()!=revision || !"REJECTED".equals(previous.status())) throw conflict("DIAGNOSTIC_SPECIMEN_STATE_INVALID","仅拒收标本可安排重采");
        for(var task:associated) task.requireReadySpecimen();
        var replacement=specimens.save(new DiagnosticSpecimen(associated.getFirst(),numbers.next("diagnostic-specimen",new BusinessNumberContext(previous.tenantId(),previous.organizationId(),previous.departmentId())),
            previous.specimenType(),previous.specimenName(),previous.containerCode(),previous.containerName(),commandId,commandHash,id));
        for(var task:associated) links.save(new DiagnosticSpecimenTask(task.tenantId(),replacement.id(),task.id()));
        specimens.flush();return view(replacement);
    }
    private DiagnosticSpecimen require(Long id) {
        return specimens.findByIdAndTenantId(id,contexts.requireCurrent().tenantId()).orElseThrow(()->notFound("DIAGNOSTIC_SPECIMEN_NOT_FOUND","未找到标本"));
    }
    private void requireExecute() { com.rhn.diagnostics.api.DiagnosticPermissions.require(contexts.requireCurrent(),"LABORATORY","EXECUTE"); }
    private String hash(String value) {
        return DiagnosticContentHash.sha256(value);
    }
    private List<DiagnosticExecutionTask> associated(DiagnosticSpecimen specimen) {
        var result=links.findByTenantIdAndSpecimenId(specimen.tenantId(),specimen.id()).stream()
            .map(DiagnosticSpecimenTask::taskId).distinct().sorted().map(execution::requireLocalTask).toList();
        if(result.isEmpty()) throw conflict("DIAGNOSTIC_SPECIMEN_TASK_REQUIRED","标本缺少申请关联，请核对");
        return result;
    }
    private List<DiagnosticSpecimen> active(DiagnosticExecutionTask task) { return specimens.findForTask(task.tenantId(),task.id()).stream().filter(s->!"REJECTED".equals(s.status())).toList(); }
    private SpecimenView view(DiagnosticSpecimen specimen) {
        return new SpecimenView(specimen.id(),specimen.revision(),specimen.specimenNo(),specimen.specimenType(),specimen.specimenName(),
            specimen.containerCode(),specimen.containerName(),specimen.status(),specimen.collectedAt(),specimen.receivedAt(),specimen.rejectionReason(),
            specimen.previousSpecimenId(),links.findByTenantIdAndSpecimenId(specimen.tenantId(),specimen.id()).stream().map(DiagnosticSpecimenTask::taskId).toList());
    }
    public record TaskSelection(Long taskId,long expectedRevision,Long specimenConfigurationId) {}
    public record GenerateCommand(List<TaskSelection> tasks,String commandId) {}
    public record SpecimenView(Long id,long revision,String specimenNo,String specimenType,String specimenName,String containerCode,String containerName,
        String status,Instant collectedAt,Instant receivedAt,String rejectionReason,Long previousSpecimenId,List<Long> taskIds) {}
}
