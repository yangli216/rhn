package com.rhn.shared.reporting;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.*;
import java.util.*;

/** Logical identifiers in plans are resolved exclusively against server-owned source descriptors. */
public final class ReportModel {
    private ReportModel() {}
    public enum Aggregate { COUNT, COUNT_DISTINCT, SUM, AVG }
    public enum Operator { EQ, IN, CONTAINS, GTE, LTE }
    @Schema(name="AnalysisPlanFilter")
    public record Filter(String field, Operator operator, List<String> values) {}
    @Schema(name="AnalysisPlanMeasure")
    public record Measure(String code, String name, String source, int sourceVersion, Aggregate aggregate,
                          String field, List<Filter> filters) {}
    public record Field(String code, String name, String expression, String unit,
                        List<Aggregate> aggregates, List<Operator> operators, Map<String,String> values) {}
    public record Group(String keyExpression, String labelExpression, Map<String,String> labels) {}
    public record Source(String code, int version, String name, String grain, String definition,
                         String relation, String from, String predicate, String timeExpression,
                         List<Field> fields, Map<String,Group> groups) {}
    @Schema(name="AnalysisSourceField")
    public record CatalogField(String code, String name, String databaseType, String unit,
                               List<Aggregate> aggregates, List<Operator> operators, Map<String,String> values) {}
    @Schema(name="AnalysisSourceCatalog")
    public record Catalog(String code, int version, String name, String grain, String definition, String relation,
                          List<String> dimensions, List<CatalogField> fields) {}
    public record Scope(Long tenant, Long organization, Map<Long,String> departments,
                        LocalDate start, LocalDate end, ZoneId zone) {}
    public record Point(String key, String label, double value) {}
    public record Result(String unit, String definition, double total, List<Point> points) {}
    public static Field id(String code,String name,String expression,String unit) {
        return new Field(code,name,expression,unit,List.of(Aggregate.COUNT,Aggregate.COUNT_DISTINCT),List.of(),Map.of());
    }
    public static Field number(String code,String name,String expression,String unit) {
        return new Field(code,name,expression,unit,List.of(Aggregate.SUM,Aggregate.AVG),List.of(Operator.EQ,Operator.GTE,Operator.LTE),Map.of());
    }
    public static Field text(String code,String name,String expression,Map<String,String> values) {
        return new Field(code,name,expression,"",List.of(),values.isEmpty()?List.of(Operator.EQ,Operator.IN,Operator.CONTAINS):List.of(Operator.EQ,Operator.IN),values);
    }
}
