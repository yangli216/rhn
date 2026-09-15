package com.rhn.shared.reporting;

import com.rhn.shared.reporting.ReportModel.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.math.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import static com.rhn.shared.api.BusinessErrors.badRequest;

@Component
public class StructuredReportEngine {
    private static final int ROW_LIMIT=50000;
    private final JdbcTemplate jdbc;
    private final Map<String,Source> sources=new LinkedHashMap<>();
    private final Map<String,Catalog> verified=new ConcurrentHashMap<>();
    public StructuredReportEngine(JdbcTemplate jdbc,List<ReportSourceProvider> providers) {
        this.jdbc=jdbc;
        providers.forEach(p->p.sources().forEach(s->{if(sources.putIfAbsent(s.code(),s)!=null) throw new IllegalStateException("Duplicate report source");}));
    }
    public List<Catalog> catalog() { return sources.values().stream().map(this::describe).toList(); }
    private Source source(Measure m) {
        Source s=m==null?null:sources.get(m.source());
        if(s==null || m.sourceVersion()!=s.version()) throw badRequest("ANALYSIS_SOURCE_INVALID","数据来源或口径版本不可用，请重新生成");
        return s;
    }
    private Field field(Source s,String code) {
        return s.fields().stream().filter(f->f.code().equals(code)).findFirst().orElseThrow(()->badRequest("ANALYSIS_FIELD_INVALID","该字段未开放统计"));
    }
    // Read JDBC column metadata from a zero-row projection; never infer meaning from sample patient data.
    private Catalog describe(Source s) {
        return verified.computeIfAbsent(s.code(),ignored->jdbc.query("select "+String.join(",",s.fields().stream().map(Field::expression).toList())+","+s.timeExpression()+",e.ID_TNT,e.ID_ORG,e.ID_DEPT from "+s.from()+" where 1=0",rs->{
            List<CatalogField> fields=new ArrayList<>();var metadata=rs.getMetaData();
            for(int i=0;i<s.fields().size();i++) {
                Field f=s.fields().get(i);int type=metadata.getColumnType(i+1);
                if(f.aggregates().contains(Aggregate.SUM) && !Set.of(Types.NUMERIC,Types.DECIMAL,Types.INTEGER,Types.BIGINT,Types.DOUBLE,Types.FLOAT,Types.REAL).contains(type))
                    throw badRequest("ANALYSIS_SCHEMA_CHANGED","统计字段类型已变化，请维护数据目录后重试");
                fields.add(new CatalogField(f.code(),f.name(),metadata.getColumnTypeName(i+1),f.unit(),f.aggregates(),f.operators(),f.values()));
            }
            List<String> dimensions=new ArrayList<>(List.of("DAY","MONTH","DEPARTMENT"));dimensions.addAll(new TreeSet<>(s.groups().keySet()));
            return new Catalog(s.code(),s.version(),s.name(),s.grain(),s.definition(),s.relation(),dimensions,fields);
        }));
    }
    public void validate(Measure m,String dimension) {
        Source s=source(m);
        if(m.code()==null || !m.code().matches("M[1-4]") || m.name()==null || m.name().isBlank() || m.name().length()>60 || m.aggregate()==null)
            throw badRequest("ANALYSIS_MEASURE_INVALID","统计项不完整");
        if(!describe(s).dimensions().contains(dimension)) throw badRequest("ANALYSIS_DIMENSION_UNAVAILABLE",s.name()+"不支持所选分组");
        Field value=field(s,m.field());
        if(!value.aggregates().contains(m.aggregate())) throw badRequest("ANALYSIS_AGGREGATE_INVALID",value.name()+"不支持该计算方式");
        if(!m.field().endsWith("Id") && m.aggregate()==Aggregate.COUNT_DISTINCT) throw badRequest("ANALYSIS_AGGREGATE_INVALID","该字段不支持去重");
        if(m.field().equals("patientId") && m.aggregate()!=Aggregate.COUNT_DISTINCT) throw badRequest("ANALYSIS_AGGREGATE_INVALID","患者人数必须去重");
        if((m.field().equals("encounterId") && !s.code().equals("ENCOUNTER") || m.field().equals("orderId") && s.code().equals("CHARGE")) && m.aggregate()!=Aggregate.COUNT_DISTINCT)
            throw badRequest("ANALYSIS_AGGREGATE_INVALID","关联对象必须去重，不能按明细行重复计数");
        if(m.filters()==null || m.filters().size()>8) throw badRequest("ANALYSIS_FILTER_INVALID","筛选条件最多八个");
        for(Filter filter:m.filters()) {
            if(filter==null) throw badRequest("ANALYSIS_FILTER_INVALID","筛选条件不完整");
            Field f=field(s,filter.field());
            if(filter.operator()==null || !f.operators().contains(filter.operator()) || filter.values()==null || filter.values().isEmpty() || filter.values().size()>20 || filter.operator()!=Operator.IN && filter.values().size()!=1)
                throw badRequest("ANALYSIS_FILTER_INVALID","筛选条件无效");
            for(String v:filter.values()) {
                if(v==null || v.isBlank() || v.length()>100 || !f.values().isEmpty()&&!f.values().containsKey(v)) throw badRequest("ANALYSIS_FILTER_INVALID","筛选值无效");
                if(f.aggregates().contains(Aggregate.SUM)) decimal(v);
            }
        }
    }
    private BigDecimal decimal(String v) {try{return new BigDecimal(v);}catch(NumberFormatException e){throw badRequest("ANALYSIS_FILTER_INVALID","金额筛选需要数值");}}
    public Result query(Measure m,String dimension,Scope scope) {
        validate(m,dimension);Source s=source(m);Field f=field(s,m.field());
        if(scope.departments().isEmpty()||scope.departments().size()>100) throw badRequest("ANALYTICS_SCOPE","请选择 1 至 100 个可访问科室");
        List<Object> args=new ArrayList<>(List.of(scope.tenant(),scope.organization()));args.addAll(scope.departments().keySet());
        args.add(Timestamp.from(scope.start().atStartOfDay(scope.zone()).toInstant()));args.add(Timestamp.from(scope.end().plusDays(1).atStartOfDay(scope.zone()).toInstant()));
        Group group=s.groups().get(dimension);
        String groupSql=group==null?"e.ID_DEPT, e.ID_DEPT":group.keyExpression()+", "+group.labelExpression();
        StringBuilder sql=new StringBuilder("select "+s.timeExpression()+", e.ID_DEPT, "+f.expression()+", "+groupSql+" from "+s.from()+" where "+s.predicate()+" and e.ID_TNT=? and e.ID_ORG=? and e.ID_DEPT in ("+String.join(",",Collections.nCopies(scope.departments().size(),"?"))+") and "+s.timeExpression()+">=? and "+s.timeExpression()+"<?");
        for(Filter filter:m.filters()) {
            Field ff=field(s,filter.field());sql.append(" and ").append(ff.expression());
            switch(filter.operator()) {
                case EQ -> sql.append(" = ?");case GTE -> sql.append(" >= ?");case LTE -> sql.append(" <= ?");
                case IN -> sql.append(" in (").append(String.join(",",Collections.nCopies(filter.values().size(),"?"))).append(")");
                case CONTAINS -> sql.append(" like ? escape '!'");
            }
            for(String value:filter.values()) args.add(filter.operator()==Operator.CONTAINS?"%"+value.replace("!","!!").replace("%","!%").replace("_","!_")+"%":ff.aggregates().contains(Aggregate.SUM)?decimal(value):value);
        }
        sql.append(" fetch first ").append(ROW_LIMIT+1).append(" rows only");
        var total=new Accumulator(m.aggregate());Map<String,Accumulator> buckets=new TreeMap<>();Map<String,String> labels=new HashMap<>();
        if(dimension.equals("DAY")||dimension.equals("MONTH")) for(LocalDate d=scope.start();!d.isAfter(scope.end());d=d.plusDays(1)) {String k=dimension.equals("DAY")?d.toString():YearMonth.from(d).toString();buckets.putIfAbsent(k,new Accumulator(m.aggregate()));labels.put(k,k);}
        if(dimension.equals("DEPARTMENT")) scope.departments().forEach((id,name)->{buckets.put(id.toString(),new Accumulator(m.aggregate()));labels.put(id.toString(),name);});
        jdbc.query(connection->{var ps=connection.prepareStatement(sql.toString());ps.setQueryTimeout(15);ps.setMaxRows(ROW_LIMIT+1);for(int i=0;i<args.size();i++) ps.setObject(i+1,args.get(i));return ps;},rs->{
            int rows=0;while(rs.next()) {
                if(++rows>ROW_LIMIT) throw badRequest("ANALYTICS_RANGE_TOO_LARGE","查询超过五万条明细，请缩小日期或科室范围；未返回截断统计");
                LocalDate day=rs.getTimestamp(1).toInstant().atZone(scope.zone()).toLocalDate();
                String key=switch(dimension){case "DAY"->day.toString();case "MONTH"->YearMonth.from(day).toString();case "DEPARTMENT"->rs.getString(2);default->Objects.toString(rs.getString(4),"未标注");};
                String label=group==null?labels.getOrDefault(key,key):group.labels().getOrDefault(key,Objects.toString(rs.getString(5),"未标注"));
                labels.merge(key,label,(a,b)->a.compareTo(b)<=0?a:b);
                Object value=rs.getObject(3);total.add(value);buckets.computeIfAbsent(key,k->new Accumulator(m.aggregate())).add(value);
            }return null;
        });
        String computation=switch(m.aggregate()){case COUNT->"计数";case COUNT_DISTINCT->"去重计数";case SUM->"求和";case AVG->"逐行平均（空值不参与）";};
        String filters=m.filters().stream().map(v->{Field ff=field(s,v.field());String op=switch(v.operator()){case EQ->"等于";case IN->"属于";case CONTAINS->"包含";case GTE->"大于等于";case LTE->"小于等于";};return ff.name()+op+String.join("、",v.values().stream().map(x->ff.values().getOrDefault(x,x)).toList());}).reduce((a,b)->a+"；"+b).orElse("未追加筛选");
        String definition=s.name()+" · "+f.name()+" · "+computation+"；"+filters+"。"+s.definition()+((m.aggregate()==Aggregate.COUNT_DISTINCT||m.aggregate()==Aggregate.AVG)?" 总计按全部符合条件的明细重新计算，不是分组结果相加。":"");
        return new Result(f.unit(),definition,total.value(),buckets.entrySet().stream().map(e->new Point(e.getKey(),labels.get(e.getKey()),e.getValue().value())).toList());
    }
    private static class Accumulator {
        private final Aggregate aggregate;private BigDecimal sum=BigDecimal.ZERO;private long count;private final Set<String> distinct=new HashSet<>();
        Accumulator(Aggregate aggregate){this.aggregate=aggregate;}
        void add(Object v){if(v==null)return;count++;if(aggregate==Aggregate.COUNT_DISTINCT)distinct.add(v.toString());if(aggregate==Aggregate.SUM||aggregate==Aggregate.AVG)sum=sum.add(new BigDecimal(v.toString()));}
        double value(){return switch(aggregate){case COUNT->count;case COUNT_DISTINCT->distinct.size();case SUM->sum.doubleValue();case AVG->count==0?0:sum.divide(BigDecimal.valueOf(count),8,RoundingMode.HALF_UP).doubleValue();};}
    }
}
