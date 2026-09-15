package com.rhn.analytics.application;

import com.rhn.analytics.api.PilotAnalysis.*;
import com.rhn.analytics.domain.*;
import com.rhn.analytics.infrastructure.*;
import com.rhn.outpatient.api.OutpatientAnalyticsDirectory;
import com.rhn.outpatient.api.OutpatientAnalyticsDirectory.DailyCount;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.*;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class PilotAnalysisService {
    private final ExecutionContextProvider contexts;
    private final WorkContextDirectory work;
    private final OrganizationDirectory organizations;
    private final OutpatientAnalyticsDirectory outpatient;
    private final AnalysisDraftVersionRepository drafts;
    private final AnalyticsCatalogVersionRepository catalogs;
    private final JsonCodec json;
    private final boolean enabled;
    public PilotAnalysisService(ExecutionContextProvider contexts, WorkContextDirectory work,
            OrganizationDirectory organizations, OutpatientAnalyticsDirectory outpatient,
            AnalysisDraftVersionRepository drafts, AnalyticsCatalogVersionRepository catalogs,
            JsonCodec json, @Value("${rhn.analytics.pilot-enabled:false}") boolean enabled) {
        this.contexts=contexts; this.work=work; this.organizations=organizations; this.outpatient=outpatient;
        this.drafts=drafts; this.catalogs=catalogs; this.json=json; this.enabled=enabled;
    }
    private ExecutionContext context() {
        if (!enabled) throw forbidden("ANALYTICS_PILOT_DISABLED", "统计体验版尚未开放");
        var c=contexts.requireCurrent();
        if (c.subjectId()==null || c.organizationId()==null || c.departmentId()==null)
            throw forbidden("WORK_CONTEXT_REQUIRED", "请先选择工作科室");
        return c;
    }
    public static void validate(Query q) {
        if (q==null || q.metric()==null || q.dimension()==null || q.scope()==null || q.startDate()==null || q.endDate()==null)
            throw badRequest("ANALYTICS_QUERY", "请补全指标、时间和统计范围");
        long days=ChronoUnit.DAYS.between(q.startDate(),q.endDate())+1;
        if (days<1 || days>366 || q.startDate().getYear()<2000 || q.endDate().getYear()>2100)
            throw badRequest("ANALYTICS_DATE_RANGE", "请选择 2000 至 2100 年内、连续 1 至 366 天的日期");
    }
    @Transactional(readOnly=true)
    public Result query(Query q) {
        var c=context(); validate(q);
        String configured=organizations.requireOrganization(c.tenantId(),c.organizationId()).timezoneCode();
        ZoneId zone=ZoneId.of(configured==null || configured.isBlank()?"Asia/Shanghai":configured);
        Map<Long,String> names=new LinkedHashMap<>();
        if(q.scope()==Scope.CURRENT) {
            var option=work.requireAuthorized(c.tenantId(),c.subjectId(),c.organizationId(),c.departmentId());
            names.put(c.departmentId(),option.departmentName());
        } else work.availableContexts(c.tenantId(),c.subjectId()).stream()
                .filter(o->c.organizationId().equals(o.organizationId()) && o.departmentId()!=null && o.authorities().contains("PORTAL.ACCESS"))
                .forEach(o->names.put(o.departmentId(),o.departmentName()));
        if(names.isEmpty()) throw forbidden("ANALYTICS_SCOPE", "当前没有可查询的科室");
        List<DailyCount> current=outpatient.dailyCounts(c.tenantId(),c.organizationId(),names.keySet(),q.startDate(),q.endDate(),zone);
        long days=ChronoUnit.DAYS.between(q.startDate(),q.endDate())+1;
        LocalDate previousStart=q.startDate().minusDays(days), previousEnd=q.startDate().minusDays(1);
        if(q.startDate().getDayOfMonth()==1 && q.endDate().equals(q.endDate().withDayOfMonth(q.endDate().lengthOfMonth()))) {
            long months=ChronoUnit.MONTHS.between(q.startDate(),q.endDate().plusDays(1));
            previousStart=q.startDate().minusMonths(months);
        }
        List<DailyCount> previous=outpatient.dailyCounts(c.tenantId(),c.organizationId(),names.keySet(),previousStart,previousEnd,zone);
        long[] totals=sum(current), old=sum(previous);
        double total=value(q.metric(),totals), before=value(q.metric(),old);
        String scope=q.scope()==Scope.CURRENT?names.get(c.departmentId()):"当前机构 · 可访问的 "+names.size()+" 个科室";
        return new Result(q,metricName(q.metric()),q.metric()==Metric.CANCELLATION_RATE?"%":"人次",scope,zone.getId(),Instant.now(),
                rows(q,current,names),totals[0],totals[1],totals[2],total,before==0?null:(total-before)/before*100,
                previousStart,previousEnd,definition(q.metric()));
    }
    public static long[] sum(List<DailyCount> facts) {
        long[] n=new long[3]; for(var f:facts){n[0]+=f.registered();n[1]+=f.cancelled();n[2]+=f.completed();} return n;
    }
    public static double value(Metric m,long[] n) {
        return switch(m){case REGISTERED->n[0];case CANCELLED->n[1];case COMPLETED->n[2];case CANCELLATION_RATE->n[0]==0?0:n[1]*100.0/n[0];};
    }
    public static List<Row> rows(Query q,List<DailyCount> facts,Map<Long,String> names) {
        Map<String,long[]> buckets=new TreeMap<>();
        if(q.dimension()==Dimension.DEPARTMENT) names.keySet().forEach(id->buckets.put(id.toString(),new long[3]));
        else for(LocalDate d=q.startDate();!d.isAfter(q.endDate());d=d.plusDays(1)) buckets.putIfAbsent(key(q.dimension(),d,null),new long[3]);
        for(var f:facts){var n=buckets.computeIfAbsent(key(q.dimension(),f.date(),f.departmentId()),ignored->new long[3]);n[0]+=f.registered();n[1]+=f.cancelled();n[2]+=f.completed();}
        return buckets.entrySet().stream().map(e->new Row(q.dimension()==Dimension.DEPARTMENT?names.get(Long.valueOf(e.getKey())):e.getKey(),e.getValue()[0],e.getValue()[1],e.getValue()[2],value(q.metric(),e.getValue()))).toList();
    }
    private static String key(Dimension d,LocalDate date,Long dept){return switch(d){case DAY->date.toString();case MONTH->YearMonth.from(date).toString();case DEPARTMENT->dept.toString();};}
    public static String metricName(Metric m){return switch(m){case REGISTERED->"挂号人次";case CANCELLED->"挂号队列退号人次";case COMPLETED->"诊毕人次";case CANCELLATION_RATE->"挂号队列退号率";};}
    public static String definition(Metric m){return switch(m){
        case REGISTERED->"按挂号时间计数，包含转科新建挂号，不等同于去重患者数。";
        case CANCELLED->"在所选日期挂号、截至本次查询已退号的人次；不是所选日期发生的退号数。";
        case COMPLETED->"按诊毕时间计数，且接诊状态为 COMPLETED；转科、终止不计入。";
        case CANCELLATION_RATE->"所选日期挂号队列中已退号人次 ÷ 挂号人次；总计按合并后的分子分母重算，分母为零时显示 0%。";};}
    public record Stored(int pilotVersion, Save analysis) {}
    @Transactional
    public Saved save(Save request) {
        var c=context();validate(request.query());
        var catalog=catalogs.findByTenantIdAndCodeAndCatalogVersion(c.tenantId(),"outpatient-pilot-v1",1)
                .orElseGet(()->catalogs.save(new AnalyticsCatalogVersion(c.tenantId(),"outpatient-pilot-v1",1,
                        "{\"pilotVersion\":1,\"source\":\"OUTPATIENT_FIXED_AGGREGATES\"}",Instant.now())));
        var draft=drafts.save(new AnalysisDraftVersion(c.tenantId(),GlobalIds.next(),1,c.subjectId(),catalog.id(),json.write(new Stored(1,request)),Instant.now()));
        return new Saved(draft.id(),request.title(),request.query(),request.chart(),draft.createdAt());
    }
    @Transactional(readOnly=true)
    public List<Saved> saved() {
        var c=context();
        return drafts.findTop50ByTenantIdAndOwnerIdOrderByCreatedAtDesc(c.tenantId(),c.subjectId()).stream()
                .filter(d->json.readTree(d.specJson()).path("pilotVersion").asInt(0)==1)
                .map(d->{var s=json.read(d.specJson(),Stored.class).analysis();return new Saved(d.id(),s.title(),s.query(),s.chart(),d.createdAt());}).toList();
    }
}
