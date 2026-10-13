package com.rhn.platform.numbering.application;

import com.rhn.platform.numbering.api.BusinessNumberContext;
import com.rhn.platform.numbering.api.BusinessNumberGenerator;
import com.rhn.platform.numbering.api.BusinessNumberRule;
import com.rhn.platform.numbering.api.BusinessNumberSequence;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;

@Service
public class ConfiguredBusinessNumberGenerator implements BusinessNumberGenerator {
    private final BusinessNumberingProperties properties;
    private final BusinessNumberCounter counter;
    private final ExecutionContextProvider contexts;
    private final Clock clock;

    @Autowired
    public ConfiguredBusinessNumberGenerator(BusinessNumberingProperties properties, BusinessNumberCounter counter,
                                             ExecutionContextProvider contexts) {
        this(properties, counter, contexts, Clock.systemUTC());
    }

    public ConfiguredBusinessNumberGenerator(BusinessNumberingProperties properties, BusinessNumberCounter counter,
                                             ExecutionContextProvider contexts, Clock clock) {
        this.properties = properties; this.counter = counter; this.contexts = contexts; this.clock = clock;
    }

    @Override
    public String next(String businessCode) {
        return next(businessCode, BusinessNumberContext.from(contexts.requireCurrent()));
    }

    @Override
    public String next(String businessCode, BusinessNumberContext context) {
        BusinessNumberRule rule = rule(businessCode);
        LocalDate day = LocalDate.now(clock.withZone(ZoneId.of(properties.zoneId())));
        String key = counterKey(businessCode, rule, context, day);
        long sequence;
        try { sequence = counter.next(key, rule.maximumSequence()); }
        catch (RuntimeException error) {
            var unavailable = new BusinessException("BUSINESS_NUMBER_UNAVAILABLE", "业务编号生成服务暂不可用，请稍后重试", HttpStatus.SERVICE_UNAVAILABLE);
            unavailable.initCause(error); throw unavailable;
        }
        if (sequence < 0) throw new BusinessException("BUSINESS_NUMBER_EXHAUSTED", "当日业务编号序列已用尽，请联系管理员", HttpStatus.CONFLICT);
        return rule.format(day, sequence);
    }

    @Override public Map<String, BusinessNumberRule> rules() { return properties.rules(); }
    @Override public String preview(String businessCode, LocalDate date, long sequence) { return rule(businessCode).format(date, sequence); }

    @Override
    public BusinessNumberSequence inspect(String businessCode, BusinessNumberContext context) {
        BusinessNumberRule rule = rule(businessCode);
        LocalDate day = LocalDate.now(clock.withZone(ZoneId.of(properties.zoneId())));
        String key = counterKey(businessCode, rule, context, day);
        long current;
        try { current = counter.current(key); }
        catch (RuntimeException error) {
            var unavailable = new BusinessException("BUSINESS_NUMBER_UNAVAILABLE", "业务编号流水查询暂不可用，请稍后重试", HttpStatus.SERVICE_UNAVAILABLE);
            unavailable.initCause(error); throw unavailable;
        }
        if (current < 0 || current > 999_999_999_999L) throw new BusinessException("BUSINESS_NUMBER_UNAVAILABLE", "业务编号计数异常", HttpStatus.SERVICE_UNAVAILABLE);
        Long next = current >= rule.maximumSequence() ? null : current + 1;
        return new BusinessNumberSequence(day, properties.zoneId(), rule.scope().key(context), current,
                next, rule.maximumSequence(), next == null ? null : rule.format(day, next));
    }

    private String counterKey(String code, BusinessNumberRule rule, BusinessNumberContext context, LocalDate day) {
        try {
            rule.format(day, 1);
            return properties.redisKeyPrefix() + ":" + code + ":" + rule.scope().key(context)
                    + ":" + day.format(DateTimeFormatter.BASIC_ISO_DATE);
        } catch (IllegalArgumentException error) {
            throw new BusinessException("BUSINESS_NUMBER_CONTEXT_INVALID", error.getMessage(), HttpStatus.BAD_REQUEST);
        }
    }

    private BusinessNumberRule rule(String code) {
        BusinessNumberRule rule = code == null ? null : properties.rules().get(code);
        if (rule == null) throw new BusinessException("BUSINESS_NUMBER_RULE_NOT_FOUND", "未配置业务编号规则：" + code, HttpStatus.BAD_REQUEST);
        return rule;
    }
}
