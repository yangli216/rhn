package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class InsuranceResponseAmountMigrationTest {
    @Test void migrationPreservesLegacyValuesAndAllowsUnknownOnlyWithoutSuccessConfirmation() throws Exception {
        try(var connection=DriverManager.getConnection("jdbc:h2:mem:insurance-amount-"+UUID.randomUUID());var sql=connection.createStatement()) {
            sql.execute("create table RHN_INS_CLAIM_RESP (ID bigint primary key, SD_STATUS varchar(32) not null, AMT_INS_FUND decimal(24,6) not null, AMT_PERS_ACCT decimal(24,6) not null, AMT_PAT_CASH decimal(24,6) not null, AMT_OTHER_FUND decimal(24,6) not null)");
            sql.execute("insert into RHN_INS_CLAIM_RESP values (1,'PENDING',0,0,0,0),(2,'SUCCEEDED',60,20,20,0)");
            String migration=new ClassPathResource("db/migration/V1_102_0__insurance_response_amount_provenance.sql").getContentAsString(StandardCharsets.UTF_8);
            for(String statement:migration.split(";")) if(!statement.isBlank()) sql.execute(statement);
            try(var rows=sql.executeQuery("select SD_AMT_SRC,AMT_INS_FUND,AMT_PERS_ACCT,AMT_PAT_CASH,AMT_OTHER_FUND from RHN_INS_CLAIM_RESP order by ID")) {
                assertTrue(rows.next()); assertEquals("LEGACY_UNVERIFIED",rows.getString(1));assertEquals(0,rows.getBigDecimal(2).signum());
                assertTrue(rows.next()); assertEquals("LEGACY_UNVERIFIED",rows.getString(1));assertEquals(60,rows.getInt(2));assertEquals(20,rows.getInt(3));assertEquals(20,rows.getInt(4));assertEquals(0,rows.getInt(5));
            }
            sql.execute("insert into RHN_INS_CLAIM_RESP (ID,SD_STATUS,SD_AMT_SRC) values (3,'PENDING','REPORTED')");
            try(var rows=sql.executeQuery("select AMT_INS_FUND,AMT_PERS_ACCT,AMT_PAT_CASH,AMT_OTHER_FUND from RHN_INS_CLAIM_RESP where ID=3")) {
                assertTrue(rows.next());for(int i=1;i<=4;i++) assertNull(rows.getObject(i));
            }
            assertThrows(SQLException.class,()->sql.execute("insert into RHN_INS_CLAIM_RESP (ID,SD_STATUS,SD_AMT_SRC) values (4,'SUCCEEDED','REPORTED')"));
            assertThrows(SQLException.class,()->sql.execute("insert into RHN_INS_CLAIM_RESP values (5,'PENDING',-1,null,null,null,'REPORTED')"));
            sql.execute("insert into RHN_INS_CLAIM_RESP values (6,'SUCCEEDED',0,0,0,0,'REPORTED')");
            sql.execute("insert into RHN_INS_CLAIM_RESP (ID,SD_STATUS) values (7,'FAILED')");
            try(var rows=sql.executeQuery("select SD_AMT_SRC from RHN_INS_CLAIM_RESP where ID=7")) {
                assertTrue(rows.next());assertEquals("LEGACY_UNVERIFIED",rows.getString(1));
            }
        }
    }
}
