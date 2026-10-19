package com.rhn.billing.infrastructure.payment;

import com.rhn.billing.api.PaymentReconciliation.*;
import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;
import static com.rhn.billing.infrastructure.payment.StatementCsv.*;

/** Chinese trade detail, verified against either the companion summary or explicit footer totals. */
final class AlipayStatementParser {
    static ParsedStatement parse(StatementRequest request, StatementDownload download) {
        if (!"ALIPAY_SIGNED_API_HTTPS".equals(download.proof())) throw invalid("支付宝账单缺少已验证的下载来源");
        var rows = new ArrayList<StatementRow>();
        var metadata = new StringBuilder();
        List<String> aggregate = null;
        Map<String, Integer> aggregateHeader = null;
        boolean detailFound = false;
        for (var file : download.files()) {
            Map<String, Integer> columns = null;
            boolean summaryFile = false;
            for (var cells : read(file, true)) {
                if (cells.getFirst().startsWith("#")) { metadata.append(String.join(",", cells)).append('\n'); continue; }
                if (cells.size() == 1 && cells.getFirst().isBlank()) continue;
                if (columns == null) {
                    summaryFile = cells.contains("交易订单总笔数") && cells.contains("退款订单总笔数");
                    if (!summaryFile && (!cells.contains("支付宝交易号") || !cells.contains("商户订单号")))
                        throw invalid("支付宝交易账单表头无法识别，请使用中文标准交易账单");
                    if (!summaryFile && detailFound) throw invalid("支付宝账单存在多份明细，需明确分片汇总协议");
                    columns = header(cells);
                    if (!summaryFile) detailFound = true;
                    continue;
                }
                if (cells.size() != columns.size()) throw invalid("支付宝账单列数不完整");
                if (summaryFile) {
                    if (cells.getFirst().equals("合计")) {
                        if (aggregate != null) throw invalid("支付宝账单存在重复汇总");
                        aggregate = cells; aggregateHeader = columns;
                    }
                    continue;
                }
                String type = switch (required(columns, cells, "业务类型")) {
                    case "交易", "收款", "支付" -> "PAYMENT";
                    case "退款" -> "REFUND";
                    default -> throw invalid("支付宝账单出现未支持业务类型");
                };
                var amount = money(required(columns, cells, "订单金额"));
                if (type.equals("PAYMENT") && amount.signum() < 0 || amount.signum() == 0) throw invalid("支付宝交易金额符号无效");
                String transaction = required(columns, cells, "支付宝交易号");
                String merchant = get(columns, cells, "商户PID", "商户号");
                if (merchant != null && !merchant.isBlank()) same(request.scope().merchantId(), merchant, "支付宝账单商户不匹配");
                rows.add(new StatementRow(rows.size() + 1, type, required(columns, cells, "商户订单号"), transaction,
                        type.equals("REFUND") ? required(columns, cells, "退款批次号", "商户退款请求号", "商户退款单号") : null,
                        null, type.equals("REFUND") ? transaction : null, amount.abs(),
                        money(required(columns, cells, "商家实收")).abs(), optionalMoney(get(columns, cells, "服务费", "手续费")),
                        request.currencyCode(), "SUCCESS", true, time(required(columns, cells, "完成时间", "交易完成时间"), request),
                        request.scope().merchantId(), get(columns, cells, "应用ID", "appid")));
            }
        }
        if (!detailFound) throw invalid("支付宝账单缺少交易明细文件");
        // The official header may contain a login account rather than a PID. Merchant identity is bound
        // by the signed SDK request and its HTTPS download; a supplied PID must still match exactly.
        String meta = metadata.toString();
        String iso = request.businessDate().toString();
        String chinese = request.businessDate().format(DateTimeFormatter.ofPattern("yyyy年MM月dd日"));
        if (!Pattern.compile("(?:起始日期|账单日期)\\s*[:：]\\s*\\[?(?:" + iso + "|" + chinese + ")(?:\\s|\\]|$)").matcher(meta).find())
            throw invalid("支付宝账单缺少匹配的账单日期证据");
        var payments = sum(rows, r -> r.transactionType().equals("PAYMENT") ? r.amount() : BigDecimal.ZERO);
        var refunds = sum(rows, r -> r.transactionType().equals("REFUND") ? r.amount() : BigDecimal.ZERO);
        var settledPayments = sum(rows, r -> r.transactionType().equals("PAYMENT") ? r.settlementAmount() : BigDecimal.ZERO);
        var settledRefunds = sum(rows, r -> r.transactionType().equals("REFUND") ? r.settlementAmount() : BigDecimal.ZERO);
        var fees = sum(rows, StatementRow::fee);
        long paymentCount = rows.stream().filter(r -> r.transactionType().equals("PAYMENT")).count();
        if (aggregate != null) {
            check(BigDecimal.valueOf(paymentCount), required(aggregateHeader, aggregate, "交易订单总笔数"));
            check(BigDecimal.valueOf(rows.size() - paymentCount), required(aggregateHeader, aggregate, "退款订单总笔数"));
            check(payments.subtract(refunds), required(aggregateHeader, aggregate, "订单金额"));
            check(settledPayments.subtract(settledRefunds), required(aggregateHeader, aggregate, "商家实收"));
            check(fees, required(aggregateHeader, aggregate, "服务费", "手续费"));
        } else {
            var paymentFooter = footer(meta, "交易合计"); var refundFooter = footer(meta, "退款合计");
            if (paymentFooter != null && refundFooter != null) {
                if (paymentFooter.count != paymentCount || refundFooter.count != rows.size() - paymentCount) throw invalid("支付宝账单汇总笔数与明细不一致");
                check(payments, paymentFooter.amount); check(refunds, refundFooter.amount.abs());
            } else {
                var count = Pattern.compile("(?:总交易笔数|交易总笔数|总笔数)\\s*[:：]\\s*\\[?([0-9]+)").matcher(meta);
                if (!count.find() || Long.parseLong(count.group(1)) != rows.size()) throw invalid("支付宝账单缺少可验证的汇总笔数");
                check(payments, total(meta, "总交易金额", "交易总金额", "收款总金额"));
                check(refunds, total(meta, "总退款金额", "退款总金额").abs());
            }
        }
        return new ParsedStatement(rows, new StatementSummary(rows.size(), payments, refunds, settledPayments, settledRefunds, fees), "ALIPAY-TRADE-1");
    }
    private record Footer(long count, BigDecimal amount) {}
    private static Footer footer(String text, String label) {
        var match = Pattern.compile(label + "\\s*[:：]\\s*([0-9]{1,7})\\s*笔\\s*[,，]\\s*合计金额\\s*[:：]\\s*(-?[0-9]+(?:\\.[0-9]{1,2})?)\\s*元").matcher(text);
        return match.find() ? new Footer(Long.parseLong(match.group(1)), money(match.group(2))) : null;
    }
    private static BigDecimal total(String text, String... names) {
        var match = Pattern.compile("(?:" + String.join("|", names) + ")(?:[（(]元[）)])?\\s*[:：]\\s*\\[?(-?[0-9]+(?:\\.[0-9]{1,2})?)").matcher(text);
        if (!match.find()) throw invalid("支付宝账单缺少可验证的金额汇总");
        return money(match.group(1));
    }
    private static void check(BigDecimal actual, String declared) { check(actual, money(declared)); }
    private static void check(BigDecimal actual, BigDecimal declared) {
        if (actual.compareTo(declared) != 0) throw invalid("支付宝账单金额汇总与明细不一致");
    }
}
