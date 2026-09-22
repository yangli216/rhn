package com.rhn.platform.masterdata.api;

import com.rhn.platform.masterdata.api.OrderFrequencyDirectory.FrequencySnapshot;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

/** Shared deterministic schedule preview. A computable average rate does not imply a known schedule. */
public final class ClinicalFrequencySchedule {
    public static final String VERSION="rhn-frequency-schedule-v1";
    private ClinicalFrequencySchedule() {}
    public record Capability(String version, String status, String reason, String explanation) {}
    public record Plan(Capability capability, List<LocalDateTime> times) {}
    public static Capability capability(FrequencySnapshot f) {
        if(f==null) return unavailable("FREQUENCY_MISSING","缺少结构化频次");
        if(!f.automaticTaskGeneration()) return result("DISABLED","AUTOMATION_DISABLED","当前频次关闭自动任务生成");
        String type=Objects.toString(f.ruleType(),"");
        if(Set.of("PRN","CONTINUOUS").contains(type)) return result("EVENT_DRIVEN","EVENT_CONTEXT_REQUIRED","按需或持续用药由事件、速率及实际执行过程决定，不预生成固定时点");
        if("CALENDAR".equals(type)) return unavailable("CALENDAR_DATES_REQUIRED","缺少具体日期、星期或月内日期规则，不能把日历频次展开为每日执行");
        if("ONCE".equals(type)) return "ORDER_START".equals(f.anchorType())?supported("按医嘱开始时刻执行一次"):unavailable("ANCHOR_UNSUPPORTED","单次频次需要明确医嘱开始时刻锚点");
        if(!Set.of("FIXED_INTERVAL","TIMES_PER_PERIOD").contains(type)) return unavailable("RULE_UNSUPPORTED","当前频次类型尚不能生成确定性执行计划");
        if(f.periodValue()==null || f.periodValue().signum()<=0) return unavailable("PERIOD_INVALID","周期值必须为正数");
        if("FIXED_INTERVAL".equals(type)) {
            if(!Integer.valueOf(1).equals(f.frequencyCount())) return unavailable("INTERVAL_COUNT_CONFLICT","固定间隔表示每间隔执行一次，次数必须为 1");
            if(!"ORDER_START".equals(f.anchorType())) return unavailable("ANCHOR_UNSUPPORTED","固定间隔需要医嘱开始时刻锚点，不能忽略其他锚点定义");
            if(!Set.of("MIN","H","D","WK").contains(Objects.toString(f.periodUnit(),""))) return unavailable("CALENDAR_INTERVAL_REQUIRED","月并非固定时长，须明确月末及日期策略后生成日历计划");
            try {f.periodValue().longValueExact();} catch(ArithmeticException invalid) {return unavailable("INTERVAL_VALUE_INVALID","固定间隔周期须为可表示的正整数");}
            return supported("从医嘱开始时刻按固定间隔生成；不是每日固定钟点");
        }
        BigDecimal days=switch(Objects.toString(f.periodUnit(),"")) {
            case "D" -> f.periodValue(); case "WK" -> f.periodValue().multiply(BigDecimal.valueOf(7));
            case "H" -> f.periodValue().divide(BigDecimal.valueOf(24),java.math.MathContext.DECIMAL128);
            case "MIN" -> f.periodValue().divide(BigDecimal.valueOf(1440),java.math.MathContext.DECIMAL128); default -> null;
        };
        if(days==null || days.compareTo(BigDecimal.ONE)!=0) return unavailable("PERIOD_DISTRIBUTION_REQUIRED","周期次数只能计算平均频率；非每日周期还需明确各次执行的日期或周期内位置");
        if(!"STANDARD_TIME".equals(f.anchorType())) return unavailable("ANCHOR_UNSUPPORTED","每日钟点计划需要标准时点锚点");
        if(!Set.of("REMAINING_SLOTS","FULL_SCHEDULE").contains(Objects.toString(f.firstDayPolicy(),"")))
            return unavailable("FIRST_DAY_POLICY_UNSUPPORTED","从开立时间顺延尚无明确的钟点偏移规则，不能替代为仅执行剩余时点");
        if(f.executionTimes()==null || f.executionTimes().isEmpty() || f.frequencyCount()==null || f.executionTimes().size()!=f.frequencyCount())
            return unavailable("EXECUTION_TIME_COUNT_CONFLICT","执行时点数量必须与每日次数一致");
        try {
            var times=f.executionTimes().stream().map(LocalTime::parse).toList();
            if(new HashSet<>(times).size()!=times.size()) return unavailable("EXECUTION_TIME_DUPLICATE","执行时点不能重复");
        } catch(RuntimeException invalid) {return unavailable("EXECUTION_TIME_INVALID","执行时点格式无效");}
        return supported("FULL_SCHEDULE".equals(f.firstDayPolicy())?"展示首日完整计划，可能包含开立前时点；预演不代表补执行授权":"按每日标准时点生成，跳过开立时刻之前的时点");
    }
    public static Plan preview(FrequencySnapshot f,LocalDateTime start,int count) {
        if(start==null || count<1 || count>30) throw new IllegalArgumentException("开始时间及预演数量无效");
        var capability=capability(f); if(!"SUPPORTED".equals(capability.status())) return new Plan(capability,List.of());
        var rows=new ArrayList<LocalDateTime>();
        try {
            switch(f.ruleType()) {
                case "ONCE" -> rows.add(start);
                case "FIXED_INTERVAL" -> {
                    long period=f.periodValue().longValueExact(); var at=start;
                    for(int i=0;i<count;i++) {rows.add(at); if(i+1<count) at=switch(f.periodUnit()) {
                        case "MIN" -> at.plusMinutes(period); case "H" -> at.plusHours(period); case "D" -> at.plusDays(period); default -> at.plusWeeks(period);};}
                }
                case "TIMES_PER_PERIOD" -> {
                    var times=f.executionTimes().stream().map(LocalTime::parse).sorted().toList(); var date=start.toLocalDate();
                    while(rows.size()<count) {
                        for(var time:times) {var at=date.atTime(time); if("FULL_SCHEDULE".equals(f.firstDayPolicy()) || !at.isBefore(start)) rows.add(at); if(rows.size()==count) break;}
                        if(rows.size()<count) date=date.plusDays(1);
                    }
                }
                default -> throw new IllegalStateException("Unsupported schedule passed capability check");
            }
        } catch(DateTimeException | ArithmeticException invalid) {return new Plan(unavailable("DATE_RANGE_EXCEEDED","预演超出可表示的日期范围，未返回部分计划"),List.of());}
        return new Plan(capability,List.copyOf(rows));
    }
    private static Capability supported(String explanation) {return result("SUPPORTED",null,explanation);}
    private static Capability unavailable(String reason,String explanation) {return result("UNSUPPORTED",reason,explanation);}
    private static Capability result(String status,String reason,String explanation) {return new Capability(VERSION,status,reason,explanation);}
}
