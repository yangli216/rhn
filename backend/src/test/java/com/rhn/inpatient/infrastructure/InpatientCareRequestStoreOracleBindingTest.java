package com.rhn.inpatient.infrastructure;

import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogItemSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogOperationalSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory.ItemAttributeSnapshot;
import com.rhn.platform.masterdata.api.ItemStandardMappingDirectory;
import com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ParameterMetaData;
import java.sql.PreparedStatement;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InpatientCareRequestStoreOracleBindingTest {

    @Test
    void care_request_instants_are_bound_as_timestamp_with_time_zone() throws Exception {
        RecordingJdbc recording = recordingJdbc();
        InpatientCareRequestStore store = new InpatientCareRequestStore(
                mock(CatalogLifecycleDirectory.class), mock(ItemAttributeSnapshotDirectory.class),
                mock(ItemStandardMappingDirectory.class), mock(JsonCodec.class), recording.jdbc());

        store.create(new InpatientCareRequestStore.CreateFact(
                1L, 2L, 3L, 4L, 5L, 6L, "NURSING", null,
                "NUR-FASTING", "检查前禁食", null, null, null, null, "午夜后禁食", 7L));

        assertEquals(1, recording.sql().size());
        PreparedStatement statement = recording.statements().getFirst();
        var timestampValues = org.mockito.ArgumentCaptor.forClass(Object.class);
        verify(statement, times(2)).setObject(anyInt(), timestampValues.capture(),
                eq(Types.TIMESTAMP_WITH_TIMEZONE));
        timestampValues.getAllValues().forEach(value -> assertInstanceOf(OffsetDateTime.class, value));
    }

    @Test
    void medication_number_one_flags_are_bound_parameters_not_sql_boolean_literals() throws Exception {
        RecordingJdbc recording = recordingJdbc();
        CatalogLifecycleDirectory catalog = mock(CatalogLifecycleDirectory.class);
        ItemAttributeSnapshotDirectory attributes = mock(ItemAttributeSnapshotDirectory.class);
        ItemStandardMappingDirectory mappings = mock(ItemStandardMappingDirectory.class);
        JsonCodec json = mock(JsonCodec.class);
        LocalDate today = LocalDate.now();
        MedicationSnapshot medication = new MedicationSnapshot(
                20L, 21L, "AMOX", "阿莫西林", null, "WESTERN", "CAPSULE",
                "0.25g", "粒", new BigDecimal("0.25"), "g", "ROOM_TEMPERATURE",
                true, true, false, null, false, new BigDecimal("0.25"), "g",
                "ORAL", null, "TID", false, false, "ACTIVE");
        CatalogItemSnapshot item = new CatalogItemSnapshot(
                10L, 11L, "MED_PRODUCT", medication.id(), "AMOX-025", "阿莫西林胶囊 0.25g",
                "盒", true, true, true, "ACTIVE", today.minusDays(1), null,
                null, null, null, null, "示范制药有限公司");
        OrganizationAdoptionView adoption = new OrganizationAdoptionView(
                30L, 0, 5L, item.id(), 6L, "AMOX-LOCAL", "阿莫西林",
                true, true, true, true, true, true, true,
                "ACTIVE", today.minusDays(1), null, null);
        when(catalog.resolve(eq(1L), eq(item.id()), eq(5L), eq(null), eq("SALE"), any(LocalDate.class)))
                .thenReturn(new CatalogOperationalSnapshot(item.id(), 5L, null, "SALE", today,
                        item, null, medication, adoption, null));
        when(attributes.resolveSnapshot(eq("MEDICATION"), eq(medication.id()), any(LocalDate.class), any()))
                .thenReturn(new ItemAttributeSnapshot(40L, "MEDICATION", medication.id(), 21L, today,
                        Instant.parse("2026-08-31T00:00:00Z"), mock(tools.jackson.databind.JsonNode.class), "HASH"));
        when(mappings.resolve(eq(1L), eq("MEDICATION"), eq(medication.id()), eq(null), any(LocalDate.class)))
                .thenReturn(List.of());
        when(json.write(any())).thenReturn("{}");
        InpatientCareRequestStore store = new InpatientCareRequestStore(
                catalog, attributes, mappings, json, recording.jdbc());

        store.create(new InpatientCareRequestStore.CreateFact(
                1L, 2L, 3L, 4L, 5L, 6L, "MEDICATION", item.id(),
                null, null, new BigDecimal("0.25"), "g", "ORAL", "TID", "饭后服用", 7L));

        assertEquals(2, recording.sql().size());
        String medicationSql = recording.sql().get(1).toLowerCase();
        assertFalse(medicationSql.matches("(?s).*\\b(?:true|false)\\b.*"));
        PreparedStatement medicationStatement = recording.statements().get(1);
        verify(medicationStatement).setBoolean(10, false);
        verify(medicationStatement).setBoolean(11, false);
    }

    private static RecordingJdbc recordingJdbc() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData databaseMetaData = mock(DatabaseMetaData.class);
        when(connection.getMetaData()).thenReturn(databaseMetaData);
        when(databaseMetaData.getDriverName()).thenReturn("Oracle JDBC driver");
        when(databaseMetaData.getDatabaseProductName()).thenReturn("Oracle");
        List<String> sql = new ArrayList<>();
        List<PreparedStatement> statements = new ArrayList<>();
        when(connection.prepareStatement(anyString())).thenAnswer(invocation -> {
            sql.add(invocation.getArgument(0));
            PreparedStatement statement = mock(PreparedStatement.class);
            ParameterMetaData parameterMetaData = mock(ParameterMetaData.class);
            when(statement.getConnection()).thenReturn(connection);
            when(statement.getParameterMetaData()).thenReturn(parameterMetaData);
            when(parameterMetaData.getParameterType(anyInt())).thenReturn(Types.NULL);
            statements.add(statement);
            return statement;
        });
        doAnswer(invocation -> {
            PreparedStatementCreator creator = invocation.getArgument(0);
            creator.createPreparedStatement(connection);
            return 1;
        }).when(jdbc).update(any(PreparedStatementCreator.class));
        return new RecordingJdbc(jdbc, sql, statements);
    }

    private record RecordingJdbc(JdbcTemplate jdbc, List<String> sql, List<PreparedStatement> statements) {
    }
}
