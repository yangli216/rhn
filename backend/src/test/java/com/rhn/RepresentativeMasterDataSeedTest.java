package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RepresentativeMasterDataSeedTest extends RhnIntegrationTestSupport {
    private static final long FIRST_CATALOG_ITEM_ID = 362387871000201L;
    private static final long LAST_CATALOG_ITEM_ID = 362387871000403L;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void representative_master_data_is_complete_enough_for_business_flows() {
        assertEquals(6, count("RHN_BD_SVC_ITEM", "ID_CATALOG_ITEM", 362387871000201L, 362387871000206L));
        assertEquals(6, count("RHN_BD_MED", "ID_MED", 362387871000901L, 362387871000906L));
        assertEquals(6, count("RHN_BD_MED_PRODUCT", "ID_CATALOG_ITEM", 362387871000301L, 362387871000306L));
        assertEquals(3, count("RHN_BD_SUPPLY_ITEM", "ID_CATALOG_ITEM", 362387871000401L, 362387871000403L));
        assertEquals(4, count("RHN_BD_ITEM_GRP", "ID_ITEM_GRP", 362387871001001L, 362387871001004L));

        assertEquals(15, count("RHN_BD_CATALOG_ITEM", "ID_CATALOG_ITEM",
                FIRST_CATALOG_ITEM_ID, LAST_CATALOG_ITEM_ID));
        assertEquals(15, count("RHN_BD_ORG_CATALOG_ITEM", "ID_CATALOG_ITEM",
                FIRST_CATALOG_ITEM_ID, LAST_CATALOG_ITEM_ID));
        assertEquals(15, count("RHN_BD_CATALOG_PRICE", "ID_CATALOG_ITEM",
                FIRST_CATALOG_ITEM_ID, LAST_CATALOG_ITEM_ID));

        assertEquals(6, count("RHN_BD_ITEM_PKG", "ID_ITEM_PKG", 362387871000601L, 362387871000606L));
        assertEquals(6, count("RHN_SUP_STOCK_ITEM", "ID_STOCK_ITEM", 362387871001201L, 362387871001206L));
        assertEquals(6, count("RHN_SUP_INV_BAL", "ID_INV_BAL", 362387871001221L, 362387871001226L));
        assertEquals(0, jdbc.queryForObject("""
                select count(*) from RHN_SUP_INV_BAL
                where ID_INV_BAL between 362387871001221 and 362387871001226
                  and QTY_AVAILABLE <= 0
                """, Integer.class));

        Integer diseaseConcepts = jdbc.queryForObject("select count(*) from RHN_BD_CONCEPT", Integer.class);
        assertTrue(diseaseConcepts != null && diseaseConcepts >= 80);
    }

    private int count(String table, String idColumn, long firstId, long lastId) {
        return jdbc.queryForObject("select count(*) from " + table + " where " + idColumn + " between ? and ?",
                Integer.class, firstId, lastId);
    }
}
