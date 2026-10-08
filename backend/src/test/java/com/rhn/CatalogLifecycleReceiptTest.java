package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CatalogLifecycleReceiptTest extends RhnIntegrationTestSupport {
    @Test
    void create_replace_and_status_receipts_preserve_fields_versions_and_persisted_history() throws Exception {
        LocalDate today = LocalDate.now();
        String firstDate = today.minusDays(10).toString(), replacementDate = today.minusDays(5).toString();
        JsonNode service = write("/api/platform/master-data/services", """
                {"code":"RECEIPT-%s","name":"目录价格回执核验","unitCode":"次","orderable":true,"chargeable":true,
                 "sdStatus":"ACTIVE","validFrom":"2026-01-01","sdServiceType":"EXAMINATION","sdUsageType":"COMMON",
                 "medicalTechnology":true,"combinationItem":false,"singleOrder":true,"pregnancyAlert":false}
                """.formatted(UUID.randomUUID().toString().substring(0, 8)));
        String item = service.get("id").asString();
        for (String kind : List.of("adoptions", "prices")) {
            String history = kind.equals("adoptions") ? "adoptionHistory" : "priceHistory";
            String link = kind.equals("adoptions") ? "replacesAdoptionId" : "replacesPriceId";
            String input = kind.equals("adoptions") ? """
                    "localCode":" RECEIPT-A ","localName":" 测试采用 ","orderable":false,"executable":true,"chargeable":true,
                    "purchasable":false,"stocked":false,"dispensable":false,"returnable":false
                    """ : """
                    "priceType":"SALE","price":0.123456,"currencyCode":" USD ","priceDocumentCode":" DOC-A ","priceReason":" 初始定价 "
                    """;
            JsonNode created = write("/api/platform/master-data/catalog-lifecycle/catalog-items/" + item + "/" + kind,
                    "{\"organizationId\":\"" + ORGANIZATION + "\",\"status\":\"ACTIVE\",\"validFrom\":\"" + firstDate + "\"," + input + "}");
            JsonNode original = created.get(history).get(0);
            assertThat(original.get("organizationId").asString()).isEqualTo(ORGANIZATION);
            assertThat(original.get("validFrom").asString()).isEqualTo(firstDate);
            assertThat(original.get("sdStatus").asString()).isEqualTo("ACTIVE");
            if (kind.equals("adoptions")) {
                assertThat(original.get("localCode").asString()).isEqualTo("RECEIPT-A");
                assertThat(original.get("localName").asString()).isEqualTo("测试采用");
                assertThat(original.get("orderable").asBoolean()).isFalse();
            } else {
                assertThat(original.get("currencyCode").asString()).isEqualTo("USD");
                assertThat(original.get("price").decimalValue()).isEqualByComparingTo("0.123456");
                assertThat(original.get("priceDocumentCode").asString()).isEqualTo("DOC-A");
                assertThat(original.get("priceReason").asString()).isEqualTo("初始定价");
            }
            assertThat(read(item, firstDate).get(history)).isEqualTo(created.get(history));
            JsonNode replaced = write("/api/platform/master-data/catalog-lifecycle/" + kind + "/" + original.get("id").asString() + "/replace",
                    "{\"organizationId\":\"" + ORGANIZATION + "\",\"status\":\"ACTIVE\",\"expectedRevision\":" + original.get("revision").asLong()
                            + ",\"validFrom\":\"" + replacementDate + "\"," + input + "}");
            JsonNode replacement = replaced.get(history).get(0), ended = replaced.get(history).get(1);
            assertThat(replacement.get("id")).isNotEqualTo(original.get("id"));
            assertThat(replacement.get(link)).isEqualTo(original.get("id"));
            assertThat(ended.get("id")).isEqualTo(original.get("id"));
            assertThat(ended.get("revision").asLong()).isGreaterThan(original.get("revision").asLong());
            assertThat(ended.get("sdStatus").asString()).isEqualTo("REPLACED");
            assertThat(ended.get("validTo").asString()).isEqualTo(today.minusDays(6).toString());
            assertThat(read(item, replacementDate).get(history)).isEqualTo(replaced.get(history));
            JsonNode prior = replacement;
            for (String target : List.of("SUSPENDED", "ACTIVE", "RETIRED")) {
                String path = "/api/platform/master-data/catalog-lifecycle/" + kind + "/" + prior.get("id").asString() + "/status";
                long revision = prior.get("revision").asLong();
                JsonNode response = write(path, "{\"expectedRevision\":" + revision + ",\"status\":\"" + target
                        + "\"" + (target.equals("RETIRED") ? ",\"validTo\":\"" + today + "\"" : "") + "}");
                JsonNode actual = response.get(history).get(0);
                assertThat(response.get(history).size()).isEqualTo(2);
                assertThat(response.get(history).get(1)).isEqualTo(ended);
                assertThat(actual.get("id")).isEqualTo(prior.get("id"));
                assertThat(actual.get("revision").asLong()).isGreaterThan(revision);
                assertThat(actual.get("sdStatus").asString()).isEqualTo(target);
                assertThat(actual.get("validFrom")).isEqualTo(prior.get("validFrom"));
                assertThat(actual.get(link)).isEqualTo(prior.get(link));
                for (String field : kind.equals("adoptions") ? List.of("catalogItemId", "defaultDepartmentId", "localCode", "localName", "orderable", "executable", "chargeable", "purchasable", "stocked", "dispensable", "returnable")
                        : List.of("organizationId", "packageId", "sdPriceType", "price", "currencyCode", "priceDocumentCode", "priceReason")) {
                    assertThat(actual.get(field)).as(field).isEqualTo(prior.get(field));
                }
                if (target.equals("RETIRED")) assertThat(actual.get("validTo").asString()).isEqualTo(today.toString());
                else assertThat(actual.get("validTo")).isEqualTo(prior.get("validTo"));
                assertThat(read(item, today.toString()).get(history)).isEqualTo(response.get(history));
                mockMvc.perform(post(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                                .content("{\"expectedRevision\":" + revision + ",\"status\":\"SUSPENDED\"}"))
                        .andExpect(result -> assertThat(result.getResponse().getStatus()).isBetween(400, 599));
                assertThat(read(item, today.toString()).get(history)).isEqualTo(response.get(history));
                prior = actual;
            }
        }
    }
    private JsonNode write(String path, String content) throws Exception {
        return json(mockMvc.perform(post(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(content))
                .andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString());
    }
    private JsonNode read(String item, String date) throws Exception {
        return json(mockMvc.perform(get("/api/platform/master-data/catalog-lifecycle/catalog-items/{id}", item)
                        .with(rhnWorkContext()).param("organizationId", ORGANIZATION).param("businessDate", date))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
}
