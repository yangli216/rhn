package com.rhn.outpatient.reporting;

import com.rhn.outpatient.api.OutpatientAnalyticsDirectory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.badRequest;

@Component
public class OutpatientAnalyticsAdapter implements OutpatientAnalyticsDirectory {
    private final JdbcTemplate jdbc;
    public OutpatientAnalyticsAdapter(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    @Transactional(readOnly = true)
    public List<DailyCount> dailyCounts(Long tenant, Long org, Set<Long> departments,
                                       LocalDate start, LocalDate end, ZoneId zone) {
        if (departments.isEmpty() || departments.size() > 100) throw badRequest("ANALYTICS_SCOPE", "请选择 1 至 100 个可访问科室");
        String slots = String.join(",", Collections.nCopies(departments.size(), "?"));
        List<Object> args = new ArrayList<>(List.of(tenant, org));
        args.addAll(departments);
        args.add(Timestamp.from(start.atStartOfDay(zone).toInstant()));
        args.add(Timestamp.from(end.plusDays(1).atStartOfDay(zone).toInstant()));
        Map<String, long[]> counts = new TreeMap<>();
        Map<String, LocalDate> dates = new HashMap<>();
        Map<String, Long> depts = new HashMap<>();
        // Identifiers are constants; only the count of server-authorized department placeholders varies.
        for (boolean completion : List.of(false, true)) {
            String table = completion ? "RHN_VIS_ENC" : "RHN_SC_PAT_REG";
            String time = completion ? "DT_COMPLETED" : "DT_REGISTERED";
            String condition = completion ? " and SD_STATUS = 'COMPLETED' and SD_ENC_CLASS = 'OUTPATIENT'" : "";
            String sql = "select ID_DEPT, " + time + " as EVENT_TIME, SD_STATUS from " + table
                    + " where ID_TNT = ? and ID_ORG = ? and ID_DEPT in (" + slots + ")"
                    + " and " + time + " >= ? and " + time + " < ?" + condition + " fetch first 50001 rows only";
            jdbc.query(sql, rs -> {
                int rows = 0;
                while (rs.next()) {
                    if (++rows > 50000) throw badRequest("ANALYTICS_RANGE_TOO_LARGE", "该范围超过体验版读取上限，请缩短日期或选择当前科室");
                    LocalDate day = rs.getTimestamp("EVENT_TIME").toInstant().atZone(zone).toLocalDate();
                    Long dept = rs.getLong("ID_DEPT");
                    String key = day + "/" + dept;
                    long[] n = counts.computeIfAbsent(key, ignored -> new long[3]);
                    dates.put(key, day); depts.put(key, dept);
                    if (completion) n[2]++;
                    else { n[0]++; if ("CANCELLED".equals(rs.getString("SD_STATUS"))) n[1]++; }
                }
                return null;
            }, args.toArray());
        }
        return counts.entrySet().stream().map(e -> new DailyCount(dates.get(e.getKey()), depts.get(e.getKey()),
                e.getValue()[0], e.getValue()[1], e.getValue()[2])).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<DiagnosisCount> diagnosisCounts(Long tenant, Long org, Set<Long> departments,
                                               LocalDate start, LocalDate end, ZoneId zone) {
        if (departments.isEmpty() || departments.size() > 100) throw badRequest("ANALYTICS_SCOPE", "请选择 1 至 100 个可访问科室");
        String slots = String.join(",", Collections.nCopies(departments.size(), "?"));
        List<Object> args = new ArrayList<>(List.of(tenant, org)); args.addAll(departments);
        args.add(Timestamp.from(start.atStartOfDay(zone).toInstant()));
        args.add(Timestamp.from(end.plusDays(1).atStartOfDay(zone).toInstant()));
        String sql = "select e.ID_DEPT, d.DT_RECORDED, d.CD_ENC_DIAG, d.NA_DISPLAY, d.SD_DIAG_DOMAIN, d.CD_CODE_SYS_SNAP"
                + " from RHN_VIS_ENC_DIAG d join RHN_VIS_ENC e on e.ID_ENC=d.ID_ENC and e.ID_TNT=d.ID_TNT"
                + " where d.ID_TNT=? and e.ID_ORG=? and e.ID_DEPT in ("+slots+")"
                + " and d.DT_RECORDED>=? and d.DT_RECORDED<? and e.SD_ENC_CLASS='OUTPATIENT'"
                + " and d.SD_DIAG_STAGE='ENCOUNTER' and d.SD_DIAG_STATUS='ACTIVE' and d.SD_VERIFICATION_STATUS='CONFIRMED'"
                + " fetch first 50001 rows only";
        return jdbc.query(sql, rs -> {
            List<DiagnosisCount> result = new ArrayList<>();
            while(rs.next()) {
                if(result.size()>=50000) throw badRequest("ANALYTICS_RANGE_TOO_LARGE", "诊断记录超过读取上限，请缩短日期或选择当前科室");
                String code=rs.getString("CD_ENC_DIAG"), domain=rs.getString("SD_DIAG_DOMAIN"), system=rs.getString("CD_CODE_SYS_SNAP");
                String key=domain+"/"+Objects.toString(system, "未标注编码体系")+"/"+code;
                result.add(new DiagnosisCount(rs.getTimestamp("DT_RECORDED").toInstant().atZone(zone).toLocalDate(),
                        rs.getLong("ID_DEPT"), key, rs.getString("NA_DISPLAY")+"（"+code+("TCM_DISEASE".equals(domain)?" · 中医病名":"TCM_SYNDROME".equals(domain)?" · 中医证候":"")+(system==null?" · 编码体系未标注":"")+"）",1));
            }
            return result;
        }, args.toArray());
    }
}
