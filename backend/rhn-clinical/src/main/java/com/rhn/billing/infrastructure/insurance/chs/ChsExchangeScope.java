package com.rhn.billing.infrastructure.insurance.chs;

import java.util.function.Supplier;

/** 标记当前线程正在为哪个医保申请与网关往返，供调试控制台把交易记录关联到申请；不影响交易本身。 */
public final class ChsExchangeScope {
    private static final ThreadLocal<Long> CLAIM = new ThreadLocal<>();

    private ChsExchangeScope() {}

    public static <T> T within(Long claimId, Supplier<T> work) {
        Long previous = CLAIM.get();
        CLAIM.set(claimId);
        try { return work.get(); }
        finally { if (previous == null) CLAIM.remove(); else CLAIM.set(previous); }
    }

    /** 当前线程关联的申请标识；不在申请操作内时为空。 */
    public static Long currentClaimId() { return CLAIM.get(); }
}
