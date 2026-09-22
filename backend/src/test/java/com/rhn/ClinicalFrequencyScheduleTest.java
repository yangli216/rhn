package com.rhn;

import com.rhn.platform.masterdata.api.*;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory.FrequencySnapshot;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class ClinicalFrequencyScheduleTest {
    static final LocalDateTime START=LocalDateTime.parse("2026-09-21T10:00:00");
    FrequencySnapshot f(String rule,int count,String amount,String unit,String anchor,List<String> times,String policy,boolean enabled) {
        return new FrequencySnapshot(1L,0,"LOCAL","合成测试",null,null,rule,count,new BigDecimal(amount),unit,anchor,times,policy,enabled);
    }
    FrequencySnapshot daily(String policy) {return f("TIMES_PER_PERIOD",2,"1","D","STANDARD_TIME",List.of("20:00","08:00"),policy,true);}
    @Test void daily_clock_times_observe_first_day_policy_and_exact_start_boundary() {
        assertThat(ClinicalFrequencySchedule.preview(daily("REMAINING_SLOTS"),START,3).times()).containsExactly(START.withHour(20),START.plusDays(1).withHour(8),START.plusDays(1).withHour(20));
        assertThat(ClinicalFrequencySchedule.preview(daily("FULL_SCHEDULE"),START,2).times()).containsExactly(START.withHour(8),START.withHour(20));
        assertThat(ClinicalFrequencySchedule.preview(daily("REMAINING_SLOTS"),START.withHour(8),1).times()).containsExactly(START.withHour(8));
        assertThat(ClinicalFrequencySchedule.preview(daily("FROM_ORDER_TIME"),START,3).capability().reason()).isEqualTo("FIRST_DAY_POLICY_UNSUPPORTED");
    }
    @Test void weekly_average_is_computable_but_clock_times_do_not_define_days_within_a_week() {
        var weekly=f("TIMES_PER_PERIOD",2,"1","WK","STANDARD_TIME",List.of("08:00","20:00"),"REMAINING_SLOTS",true);
        assertThat(ClinicalFrequencySemantics.interpret(weekly).dailyRateComputable()).isTrue();
        assertThat(ClinicalFrequencySemantics.interpret(weekly).perDays()).isEqualByComparingTo("7");
        var plan=ClinicalFrequencySchedule.preview(weekly,START,8);
        assertThat(plan.times()).isEmpty();assertThat(plan.capability().reason()).isEqualTo("PERIOD_DISTRIBUTION_REQUIRED");
        for(String unit:List.of("MIN","H","MO")) assertThat(ClinicalFrequencySchedule.preview(f("TIMES_PER_PERIOD",1,"1",unit,"STANDARD_TIME",List.of("08:00"),"REMAINING_SLOTS",true),START,8).times()).isEmpty();
    }
    @Test void fixed_intervals_keep_the_start_anchor_and_reject_conflicting_counts_or_calendar_units() {
        var q6=f("FIXED_INTERVAL",1,"6","H","ORDER_START",List.of(),"FROM_ORDER_TIME",true);
        assertThat(ClinicalFrequencySchedule.preview(q6,START,3).times()).containsExactly(START,START.plusHours(6),START.plusHours(12));
        var bad=f("FIXED_INTERVAL",2,"6","H","ORDER_START",List.of(),"REMAINING_SLOTS",true);
        assertThat(ClinicalFrequencySchedule.preview(bad,START,3).times()).isEmpty();
        assertThat(ClinicalFrequencySemantics.interpret(bad).unknownReason()).isEqualTo("INTERVAL_COUNT_CONFLICT");
        assertThat(ClinicalFrequencySchedule.capability(f("FIXED_INTERVAL",1,"1","MO","ORDER_START",List.of(),"REMAINING_SLOTS",true)).reason()).isEqualTo("CALENDAR_INTERVAL_REQUIRED");
        assertThat(ClinicalFrequencySchedule.capability(f("FIXED_INTERVAL",1,"1.5","H","ORDER_START",List.of(),"REMAINING_SLOTS",true)).reason()).isEqualTo("INTERVAL_VALUE_INVALID");
    }
    @Test void calendar_prn_continuous_disabled_and_unknown_are_not_fake_daily_schedules() {
        for(String type:List.of("CALENDAR","PRN","CONTINUOUS","OTHER")) assertThat(ClinicalFrequencySchedule.preview(f(type,1,"1","D","CALENDAR",List.of("08:00"),"REMAINING_SLOTS",true),START,8).times()).isEmpty();
        var off=f("TIMES_PER_PERIOD",1,"1","D","STANDARD_TIME",List.of("08:00"),"REMAINING_SLOTS",false);
        assertThat(ClinicalFrequencySchedule.preview(off,START,8).capability().status()).isEqualTo("DISABLED");
        var once=f("ONCE",1,"1","D","ORDER_START",List.of(),"REMAINING_SLOTS",true);
        assertThat(ClinicalFrequencySchedule.preview(once,START,8).times()).containsExactly(START);
    }
    @Test void malformed_times_and_date_overflow_return_no_partial_plan() {
        for(var times:List.of(List.of("08:00"),List.of("08:00","08:00"),List.of("invalid","20:00")))
            assertThat(ClinicalFrequencySchedule.preview(f("TIMES_PER_PERIOD",2,"1","D","STANDARD_TIME",times,"REMAINING_SLOTS",true),START,8).times()).isEmpty();
        var daily=daily("REMAINING_SLOTS");
        var plan=ClinicalFrequencySchedule.preview(daily,LocalDateTime.MAX,8);
        assertThat(plan.times()).isEmpty(); assertThat(plan.capability().reason()).isEqualTo("DATE_RANGE_EXCEEDED");
        assertThatThrownBy(()->ClinicalFrequencySchedule.preview(daily,START,0)).isInstanceOf(IllegalArgumentException.class);
    }
}
