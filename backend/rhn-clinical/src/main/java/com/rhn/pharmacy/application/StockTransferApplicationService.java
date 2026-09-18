package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.InventoryOperationViews.TransferAllocationView;
import com.rhn.pharmacy.api.InventoryOperationViews.TransferLineView;
import com.rhn.pharmacy.api.InventoryOperationViews.TransferView;
import com.rhn.pharmacy.application.InventoryApplicationService.DocumentPostingCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.DocumentPostingLineCommand;
import com.rhn.pharmacy.application.InventoryTraceApplicationService.TraceMovementLine;
import com.rhn.pharmacy.application.InventoryTraceApplicationService.TraceTransferReceiptLine;
import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.domain.InventoryDocumentEvent;
import com.rhn.pharmacy.domain.StockBin;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockTransfer;
import com.rhn.pharmacy.domain.StockTransferAllocation;
import com.rhn.pharmacy.domain.StockTransferLine;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.InventoryDocumentEventRepository;
import com.rhn.pharmacy.infrastructure.StockBinRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.pharmacy.infrastructure.StockTransferAllocationRepository;
import com.rhn.pharmacy.infrastructure.StockTransferLineRepository;
import com.rhn.pharmacy.infrastructure.StockTransferRepository;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class StockTransferApplicationService {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss").withZone(ZoneOffset.UTC);
    private final StockTransferRepository repository; private final StockTransferLineRepository lineRepository;
    private final StockTransferAllocationRepository allocationRepository; private final StockSiteRepository siteRepository;
    private final StockItemRepository itemRepository; private final StockBinRepository binRepository;
    private final InventoryAvailabilityService availabilityService; private final InventoryDocumentEventRepository eventRepository;
    private final InventoryLedgerPostingService inventoryService; private final InventoryTraceApplicationService traceService;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final ExecutionContextProvider contextProvider;
    public StockTransferApplicationService(StockTransferRepository repository, StockTransferLineRepository lineRepository,
            StockTransferAllocationRepository allocationRepository, StockSiteRepository siteRepository,
            StockItemRepository itemRepository, StockBinRepository binRepository,
            InventoryAvailabilityService availabilityService, InventoryDocumentEventRepository eventRepository,
            InventoryLedgerPostingService inventoryService, InventoryTraceApplicationService traceService,
            CatalogLifecycleDirectory catalogDirectory, ExecutionContextProvider contextProvider) {
        this.repository=repository; this.lineRepository=lineRepository; this.allocationRepository=allocationRepository;
        this.siteRepository=siteRepository; this.itemRepository=itemRepository; this.binRepository=binRepository;
        this.availabilityService=availabilityService; this.eventRepository=eventRepository;
        this.inventoryService=inventoryService; this.traceService=traceService;
        this.catalogDirectory=catalogDirectory; this.contextProvider=contextProvider;
    }

    @Transactional
    public TransferView create(CreateTransferCommand input) {
        ExecutionContext context=requireContext(); String requestCode=required(input.requestCode(),"TRANSFER_REQUEST_REQUIRED","调拨请求编码不能为空");
        StockTransfer existing=repository.findByTenantIdAndRequestCode(context.tenantId(),requestCode).orElse(null);
        if(existing!=null) return view(context,existing);
        StockSite source=requireSite(context,input.sourceSiteId(),true); StockSite destination=requireSite(context,input.destinationSiteId(),false);
        if(source.id().equals(destination.id())) throw badRequest("TRANSFER_SITE_SAME","调出和调入站点不能相同");
        if(!source.organizationId().equals(destination.organizationId())) throw badRequest("TRANSFER_ORGANIZATION_MISMATCH","当前仅支持同一机构内库间调拨");
        if(input.lines()==null||input.lines().isEmpty()) throw badRequest("TRANSFER_LINES_REQUIRED","调拨单至少需要一条明细");
        if(input.lines().size()>500) throw badRequest("TRANSFER_LINES_TOO_MANY","单张调拨单不能超过500条明细");
        String no=clean(input.transferNo()); if(no==null) no=nextNo("TR");
        Long srcDeptId=source.departmentId()!=null?source.departmentId():(context.departmentId()!=null?context.departmentId():1L);
        Long destDeptId=destination.departmentId()!=null?destination.departmentId():(context.departmentId()!=null?context.departmentId():1L);
        StockTransfer value=new StockTransfer(context.tenantId(),source.organizationId(),srcDeptId,destDeptId,source.id(),destination.id(),no,
                requestCode,input.requestedAt()==null?Instant.now():input.requestedAt(),clean(input.reason()),clean(input.description()),context.subjectId());
        Set<Long> sourceItems=new HashSet<>(); int sort=0; repository.save(value);
        for(TransferLineCommand command:input.lines()){
            if(!sourceItems.add(command.sourceStockItemId())) throw badRequest("TRANSFER_ITEM_DUPLICATE","调拨单不能包含重复经营项目");
            StockItem sourceItem=requireItem(context,command.sourceStockItemId(),source.id());
            StockItem destinationItem=requireItem(context,command.destinationStockItemId(),destination.id());
            if(!sourceItem.catalogItemId().equals(destinationItem.catalogItemId())||!sourceItem.basePackageId().equals(destinationItem.basePackageId())
                    ||!sourceItem.baseUnitCode().equals(destinationItem.baseUnitCode())) throw badRequest("TRANSFER_ITEM_MAPPING_INVALID","调出与调入经营项目不是同一产品包装");
            if(sourceItem.traceRequired()!=destinationItem.traceRequired()) throw badRequest("TRANSFER_TRACE_POLICY_MISMATCH","调出与调入经营项目的追溯策略必须一致");
            positive(command.requestedQuantity(),"TRANSFER_QUANTITY_INVALID","调拨数量必须大于零");
            TransferQuantity quantity=transferQuantity(context,source,sourceItem,command);
            lineRepository.save(new StockTransferLine(context.tenantId(),value.id(),++sort,sourceItem.id(),destinationItem.id(),
                    command.requestedQuantity(),quantity.operationUnitCode(),quantity.baseQuantityFactor(),
                    quantity.baseQuantity(),sourceItem.baseUnitCode()));
        }
        append(context,value,"CREATED",null,value.status(),null); lineRepository.flush(); repository.flush(); return view(context,value);
    }
    @Transactional public TransferView submit(Long id){ExecutionContext c=requireContext();StockTransfer v=lock(c,id,"SOURCE");String from=v.status();transition(()->v.submit(c.subjectId()));append(c,v,"SUBMITTED",from,v.status(),null);return view(c,v);}
    @Transactional public TransferView reject(Long id,DecisionCommand input){ExecutionContext c=requireContext();StockTransfer v=lock(c,id,"SOURCE");String reason=required(input.reason(),"TRANSFER_REJECTION_REASON_REQUIRED","驳回调拨单必须填写原因");String from=v.status();transition(()->v.reject(c.subjectId(),reason));append(c,v,"REJECTED",from,v.status(),reason);return view(c,v);}

    @Transactional
    public TransferView approve(Long id, ApproveTransferCommand input){
        ExecutionContext c=requireContext(); StockTransfer v=lock(c,id,"SOURCE"); List<StockTransferLine> lines=lineRepository.lockByTransfer(c.tenantId(),id);
        if(input.lines()==null||input.lines().size()!=lines.size()) throw badRequest("TRANSFER_APPROVAL_INCOMPLETE","必须逐条审批全部调拨明细");
        Map<Long,BigDecimal> decisions=new HashMap<>(); for(ApproveLineCommand d:input.lines()) if(decisions.put(d.transferLineId(),d.approvedQuantity())!=null) throw badRequest("TRANSFER_APPROVAL_DUPLICATE","调拨审批明细不能重复");
        boolean any=false; for(StockTransferLine line:lines){BigDecimal q=decisions.get(line.id());if(q==null)throw badRequest("TRANSFER_APPROVAL_INCOMPLETE","存在未审批明细");try{line.approve(q);}catch(IllegalStateException e){throw badRequest("TRANSFER_APPROVAL_INVALID",e.getMessage());}any|=q.signum()>0;}
        if(!any)throw badRequest("TRANSFER_APPROVAL_EMPTY","至少需要批准一条调拨明细；全部不批请使用驳回");
        String from=v.status();transition(()->v.approve(c.subjectId(),clean(input.reason())));append(c,v,"APPROVED",from,v.status(),clean(input.reason()));lineRepository.flush();return view(c,v);
    }

    @Transactional
    public TransferView pick(Long id){
        ExecutionContext c=requireContext();StockTransfer v=lock(c,id,"SOURCE");if(!"APPROVED".equals(v.status()))throw conflict("TRANSFER_STATE_INVALID","只有已审核调拨单可以拣货");
        List<StockTransferLine> lines=lineRepository.lockByTransfer(c.tenantId(),id).stream().sorted(Comparator.comparing(StockTransferLine::sourceStockItemId).thenComparing(StockTransferLine::id)).toList();LocalDate date=LocalDate.now();
        for(StockTransferLine line:lines){if(!"APPROVED".equals(line.lineStatus()))continue;StockItem item=requireItem(c,line.sourceStockItemId(),v.sourceSiteId());
            List<InventoryBalance> balances=availabilityService.lockIssuable(c.tenantId(),v.sourceSiteId(),item.id(),date,item.issuePolicy());
            BigDecimal remaining=line.approvedQuantity();for(InventoryBalance balance:balances){if(remaining.signum()==0)break;BigDecimal q=remaining.min(balance.quantityAvailable());if(q.signum()<=0)continue;balance.reserve(q);availabilityService.save(balance);allocationRepository.save(new StockTransferAllocation(c.tenantId(),line.id(),balance.stockBinId(),balance.stockLotId(),balance.stockStatus(),q,c.subjectId()));remaining=remaining.subtract(q);}if(remaining.signum()>0)throw conflict("TRANSFER_STOCK_INSUFFICIENT","可用库存不足，无法完成调拨拣货");line.markPicking();}
        String from=v.status();transition(()->v.markPicking(c.subjectId()));append(c,v,"PICKED",from,v.status(),null);availabilityService.flush();allocationRepository.flush();lineRepository.flush();return view(c,v);
    }

    @Transactional
    public TransferView dispatch(Long id){
        ExecutionContext c=requireContext();StockTransfer v=lock(c,id,"SOURCE");if("IN_TRANSIT".equals(v.status()))return view(c,v);if(!"PICKING".equals(v.status()))throw conflict("TRANSFER_STATE_INVALID","只有完成拣货的调拨单可以调出");
        List<StockTransferLine> lines=lineRepository.lockByTransfer(c.tenantId(),id);List<DocumentPostingLineCommand> posting=new ArrayList<>();
        for(StockTransferLine line:lines){if(!"PICKING".equals(line.lineStatus()))continue;List<StockTransferAllocation> allocations=allocationRepository.findByTenantIdAndStockTransferLineIdOrderById(c.tenantId(),line.id());BigDecimal total=allocations.stream().map(StockTransferAllocation::dispatchedQuantity).reduce(BigDecimal.ZERO,BigDecimal::add);if(total.compareTo(line.approvedQuantity())!=0)throw conflict("TRANSFER_ALLOCATION_INCOMPLETE","调拨分配数量与批准数量不一致");for(StockTransferAllocation a:allocations){posting.add(new DocumentPostingLineCommand(a.sourceBinId(),line.sourceStockItemId(),a.stockLotId(),a.stockStatus(),a.dispatchedQuantity().negate(),null,true));}}
        var txn=inventoryService.postDocument(new DocumentPostingCommand(v.requestCode()+":OUT","TRANSFER","STOCK_TRANSFER_OUT",v.transferNo(),v.sourceSiteId(),Instant.now(),"库间调拨调出",posting));
        List<TraceMovementLine> traceLines=new ArrayList<>();
        for(StockTransferLine line:lines){if(!"PICKING".equals(line.lineStatus()))continue;
            allocationRepository.findByTenantIdAndStockTransferLineIdOrderById(c.tenantId(),line.id())
                    .forEach(a->traceLines.add(new TraceMovementLine(line.sourceStockItemId(),a.stockLotId(),a.dispatchedQuantity())));}
        traceService.dispatchTransfer(c,v.sourceSiteId(),v.id(),v.transferNo(),traceLines);
        for(StockTransferLine line:lines){if(!"PICKING".equals(line.lineStatus()))continue;allocationRepository.findByTenantIdAndStockTransferLineIdOrderById(c.tenantId(),line.id()).forEach(StockTransferAllocation::markInTransit);line.markDispatched();}
        String from=v.status();transition(()->v.dispatch(c.subjectId(),txn.id()));append(c,v,"DISPATCHED",from,v.status(),null);allocationRepository.flush();lineRepository.flush();repository.flush();return view(c,v);
    }

    @Transactional
    public TransferView receive(Long id, ReceiveTransferCommand input){
        ExecutionContext c=requireContext();StockTransfer v=lock(c,id,"DESTINATION");if("COMPLETED".equals(v.status()))return view(c,v);if(!"IN_TRANSIT".equals(v.status()))throw conflict("TRANSFER_STATE_INVALID","只有在途调拨单可以确认调入");
        List<StockTransferLine> lines=lineRepository.lockByTransfer(c.tenantId(),id);Map<Long,ReceiveAllocationCommand> decisions=new HashMap<>();if(input.allocations()==null)throw badRequest("TRANSFER_RECEIPT_INCOMPLETE","必须逐批确认调入数量");for(ReceiveAllocationCommand d:input.allocations())if(decisions.put(d.transferAllocationId(),d)!=null)throw badRequest("TRANSFER_RECEIPT_DUPLICATE","调入确认明细不能重复");
        List<DocumentPostingLineCommand> posting=new ArrayList<>(); List<TraceTransferReceiptLine> traceReceipts=new ArrayList<>();
        for(StockTransferLine line:lines){if(!"IN_TRANSIT".equals(line.lineStatus()))continue;BigDecimal received=BigDecimal.ZERO,damaged=BigDecimal.ZERO;List<StockTransferAllocation> allocations=allocationRepository.findByTenantIdAndStockTransferLineIdOrderById(c.tenantId(),line.id());for(StockTransferAllocation a:allocations){ReceiveAllocationCommand d=decisions.get(a.id());if(d==null)throw badRequest("TRANSFER_RECEIPT_INCOMPLETE","存在未确认的在途批次");StockBin bin=requireBin(c,d.destinationBinId(),v.destinationSiteId());if(!bin.active()||!bin.receiveAllowed())throw conflict("STOCK_BIN_NOT_RECEIVABLE","调入货位未开放收货");BigDecimal r=nonNegative(d.receivedQuantity()),dm=nonNegative(d.damagedQuantity());if(r.add(dm).compareTo(a.dispatchedQuantity())!=0)throw badRequest("TRANSFER_RECEIPT_QUANTITY_INVALID","调入与破损数量之和必须等于调出数量");if(dm.signum()>0&&clean(d.discrepancyReason())==null)throw badRequest("TRANSFER_DISCREPANCY_REASON_REQUIRED","存在破损差异时必须填写原因");if(r.signum()>0)posting.add(new DocumentPostingLineCommand(bin.id(),line.destinationStockItemId(),a.stockLotId(),"AVAILABLE",r,null,false));if(dm.signum()>0)posting.add(new DocumentPostingLineCommand(bin.id(),line.destinationStockItemId(),a.stockLotId(),"DAMAGED",dm,null,false));traceReceipts.add(new TraceTransferReceiptLine(line.destinationStockItemId(),a.stockLotId(),bin.id(),r,dm));a.receive(bin.id(),r,dm);received=received.add(r);damaged=damaged.add(dm);}try{line.complete(received,damaged,clean(input.reason()));}catch(IllegalStateException e){throw badRequest("TRANSFER_RECEIPT_INVALID",e.getMessage());}}
        if(posting.isEmpty())throw badRequest("TRANSFER_RECEIPT_EMPTY","调入记账明细不能为空");var txn=inventoryService.postDocument(new DocumentPostingCommand(v.requestCode()+":IN","TRANSFER","STOCK_TRANSFER_IN",v.transferNo(),v.destinationSiteId(),Instant.now(),"库间调拨调入确认",posting));
        traceService.receiveTransfer(c,v.sourceSiteId(),v.destinationSiteId(),v.id(),v.transferNo(),traceReceipts);
        String from=v.status();transition(()->v.complete(c.subjectId(),txn.id()));append(c,v,"RECEIVED",from,v.status(),clean(input.reason()));allocationRepository.flush();lineRepository.flush();repository.flush();return view(c,v);
    }

    @Transactional(readOnly=true) public List<TransferView> list(Long siteId,String role){ExecutionContext c=requireContext();String r=role==null?"SOURCE":role.toUpperCase();requireSite(c,siteId,true);List<StockTransfer> values="DESTINATION".equals(r)?repository.findByTenantIdAndDestinationSiteIdOrderByRequestedAtDesc(c.tenantId(),siteId):repository.findByTenantIdAndSourceSiteIdOrderByRequestedAtDesc(c.tenantId(),siteId);return values.stream().map(v->view(c,v)).toList();}
    private StockTransfer lock(ExecutionContext c,Long id,String role){StockTransfer v=repository.lockByIdAndTenantId(id,c.tenantId()).orElseThrow(()->notFound("TRANSFER_NOT_FOUND","未找到调拨单"));requireSite(c,"DESTINATION".equals(role)?v.destinationSiteId():v.sourceSiteId(),true);return v;}
    private StockSite requireSite(ExecutionContext c,Long id,boolean current){StockSite v=siteRepository.findByIdAndTenantId(id,c.tenantId()).orElseThrow(()->notFound("STOCK_SITE_NOT_FOUND","未找到库存站点"));if(!c.canAccessOrganization(v.organizationId()))throw badRequest("PHARMACY_ORGANIZATION_SCOPE_INVALID","当前上下文不能访问该机构库存");if(current&&v.departmentId()!=null&&!v.departmentId().equals(c.departmentId()))throw badRequest("PHARMACY_SITE_CONTEXT_MISMATCH","当前工作科室与调拨作业站点不一致");return v;}
    private StockItem requireItem(ExecutionContext c,Long id,Long siteId){StockItem v=itemRepository.findByIdAndTenantId(id,c.tenantId()).orElseThrow(()->notFound("STOCK_ITEM_NOT_FOUND","未找到库房经营项目"));if(!siteId.equals(v.stockSiteId()))throw badRequest("STOCK_ITEM_SITE_MISMATCH","调拨经营项目不属于对应站点");return v;}
    private StockBin requireBin(ExecutionContext c,Long id,Long siteId){StockBin v=binRepository.findByIdAndTenantId(id,c.tenantId()).orElseThrow(()->notFound("STOCK_BIN_NOT_FOUND","未找到库存货位"));if(!siteId.equals(v.stockSiteId()))throw badRequest("STOCK_BIN_SITE_MISMATCH","调入货位不属于目标站点");return v;}
    private void append(ExecutionContext c,StockTransfer v,String event,String from,String to,String reason){eventRepository.save(new InventoryDocumentEvent(c.tenantId(),v.organizationId(),"TRANSFER",v.id(),v.transferNo(),event,from,to,c.subjectId(),reason,v.requestCode()));}
    private TransferView view(ExecutionContext c,StockTransfer v){List<TransferLineView> lines=lineRepository.findByTenantIdAndStockTransferIdOrderBySortOrder(c.tenantId(),v.id()).stream().map(line->new TransferLineView(line.id(),line.revision(),line.sortOrder(),line.sourceStockItemId(),line.destinationStockItemId(),line.requestedQuantity(),line.requestedOperationQuantity(),line.operationUnitCode(),line.baseQuantityFactor(),line.approvedQuantity(),line.dispatchedQuantity(),line.receivedQuantity(),line.damagedQuantity(),line.baseUnitCode(),line.lineStatus(),line.discrepancyReason(),allocationRepository.findByTenantIdAndStockTransferLineIdOrderById(c.tenantId(),line.id()).stream().map(a->new TransferAllocationView(a.id(),a.stockTransferLineId(),a.sourceBinId(),a.destinationBinId(),a.stockLotId(),a.stockStatus(),a.dispatchedQuantity(),a.receivedQuantity(),a.damagedQuantity(),a.status())).toList())).toList();return new TransferView(v.id(),v.revision(),v.organizationId(),v.sourceSiteId(),v.destinationSiteId(),v.transferNo(),v.requestCode(),v.status(),v.requestedAt(),v.requestedBy(),v.approvedAt(),v.approvedBy(),v.dispatchedAt(),v.dispatchedBy(),v.receivedAt(),v.receivedBy(),v.reason(),v.description(),v.outboundTransactionId(),v.inboundTransactionId(),lines);}
    private TransferQuantity transferQuantity(ExecutionContext c,StockSite site,StockItem item,TransferLineCommand input){
        String requestedUnit=clean(input.operationUnitCode()); BigDecimal requestedFactor=input.baseQuantityFactor();
        if(requestedUnit==null&&requestedFactor==null)return new TransferQuantity(item.baseUnitCode(),BigDecimal.ONE,input.requestedQuantity());
        if(requestedUnit==null||requestedFactor==null)throw badRequest("TRANSFER_OPERATION_UNIT_INCOMPLETE","调拨包装单位与换算系数必须同时提供");
        var catalog=catalogDirectory.resolve(c.tenantId(),item.catalogItemId(),site.organizationId(),item.basePackageId(),"SALE",LocalDate.now());
        String operationUnit; BigDecimal factor;
        if(item.baseUnitCode().equalsIgnoreCase(requestedUnit)){operationUnit=item.baseUnitCode();factor=BigDecimal.ONE;}
        else if(catalog.itemPackage()!=null&&catalog.itemPackage().unitCode().equalsIgnoreCase(requestedUnit)){
            operationUnit=catalog.itemPackage().unitCode();factor=catalog.itemPackage().quantityFactor();
        }else throw badRequest("TRANSFER_OPERATION_UNIT_INVALID","调拨单位必须是经营包装单位或库存最小单位");
        if(requestedFactor.compareTo(factor)!=0)throw badRequest("TRANSFER_PACKAGE_FACTOR_MISMATCH","调拨包装换算系数与当前产品包装配置不一致");
        BigDecimal baseQuantity;
        try{baseQuantity=input.requestedQuantity().multiply(factor).setScale(8,RoundingMode.UNNECESSARY).stripTrailingZeros();}
        catch(ArithmeticException error){throw badRequest("TRANSFER_BASE_QUANTITY_PRECISION_INVALID","调拨换算后的最小单位数量精度超过 8 位小数");}
        positive(baseQuantity,"TRANSFER_QUANTITY_INVALID","调拨换算后的最小单位数量必须大于零");
        return new TransferQuantity(operationUnit,factor,baseQuantity);
    }
    private ExecutionContext requireContext(){ExecutionContext c=contextProvider.requireCurrent();if(!c.hasWorkContext())throw badRequest("PHARMACY_WORK_CONTEXT_REQUIRED","库存操作必须选择工作机构和科室");return c;}
    private void transition(Runnable r){try{r.run();}catch(IllegalStateException e){throw conflict("TRANSFER_STATE_INVALID",e.getMessage());}}
    private BigDecimal nonNegative(BigDecimal v){if(v==null||v.signum()<0)throw badRequest("TRANSFER_RECEIPT_QUANTITY_INVALID","调入数量不能小于零");return v;}
    private void positive(BigDecimal v,String code,String msg){if(v==null||v.signum()<=0)throw badRequest(code,msg);} private String required(String v,String code,String msg){String r=clean(v);if(r==null)throw badRequest(code,msg);return r;}private String clean(String v){return v==null||v.isBlank()?null:v.trim();}private String nextNo(String p){return p+NUMBER_TIME.format(Instant.now())+com.rhn.shared.id.GlobalIds.randomSuffix(6);}
    private record TransferQuantity(String operationUnitCode,BigDecimal baseQuantityFactor,BigDecimal baseQuantity){}
    public record TransferLineCommand(Long sourceStockItemId,Long destinationStockItemId,BigDecimal requestedQuantity,
                                      String operationUnitCode,BigDecimal baseQuantityFactor){}
    public record CreateTransferCommand(Long sourceSiteId,Long destinationSiteId,String transferNo,String requestCode,Instant requestedAt,String reason,String description,List<TransferLineCommand> lines){}
    public record ApproveLineCommand(Long transferLineId,BigDecimal approvedQuantity){}
    public record ApproveTransferCommand(String reason,List<ApproveLineCommand> lines){}
    public record DecisionCommand(String reason){}
    public record ReceiveAllocationCommand(Long transferAllocationId,Long destinationBinId,BigDecimal receivedQuantity,BigDecimal damagedQuantity,String discrepancyReason){}
    public record ReceiveTransferCommand(String reason,List<ReceiveAllocationCommand> allocations){}
}
