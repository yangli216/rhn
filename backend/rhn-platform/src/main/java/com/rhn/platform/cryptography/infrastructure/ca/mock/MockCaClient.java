package com.rhn.platform.cryptography.infrastructure.ca.mock;

import com.rhn.platform.cryptography.application.CaProperties.Connection;
import com.rhn.shared.json.JsonCodec;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * JSON-over-HTTP client of the CA vendor protocol ({@code POST {base}/v1/<group>/<operation>}). Every
 * failure mode that leaves the outcome unknown (timeout, connection error, HTTP != 200, non-JSON reply)
 * becomes a retryable {@link CaVendorCallException}; {@code code != 0} is a vendor business rejection.
 */
class MockCaClient {
    /** Transport seam: production uses the JDK client, tests substitute an in-process stub. */
    interface Transport {
        Response post(URI uri, Map<String, String> headers, String body, Duration connectTimeout, Duration readTimeout)
                throws IOException, InterruptedException;

        record Response(int status, String body) {}
    }

    private final JsonCodec json;
    private final Transport transport;

    MockCaClient(JsonCodec json, Transport transport) {
        this.json = json;
        this.transport = transport;
    }

    static Transport jdkTransport() {
        Map<Duration, HttpClient> clients = new ConcurrentHashMap<>();
        return (uri, headers, body, connectTimeout, readTimeout) -> {
            HttpClient client = clients.computeIfAbsent(connectTimeout,
                    timeout -> HttpClient.newBuilder().connectTimeout(timeout).build());
            var builder = HttpRequest.newBuilder(uri).timeout(readTimeout)
                    .header("Content-Type", "application/json;charset=UTF-8")
                    .POST(HttpRequest.BodyPublishers.ofString(body));
            headers.forEach(builder::header);
            var response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            return new Transport.Response(response.statusCode(), response.body());
        };
    }

    /** Returns the {@code data} object of a successful call (an empty object node when the vendor sends none). */
    JsonNode call(Connection connection, String operation, Map<String, Object> request) {
        URI uri = URI.create(connection.baseUrl() + "/v1/" + operation);
        Transport.Response response;
        try {
            response = transport.post(uri, Map.of("X-Client-Id", connection.clientId(),
                    "X-Client-Secret", connection.clientSecret()), json.write(request),
                    connection.connectTimeout(), connection.readTimeout());
        } catch (HttpTimeoutException exception) {
            throw new CaVendorCallException("CA_TIMEOUT", "CA 厂商调用超时（" + operation + "），结果未知", true, exception);
        } catch (IOException exception) {
            throw new CaVendorCallException("CA_NETWORK", "CA 厂商网络调用失败（" + operation + "），结果未知", true, exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new CaVendorCallException("CA_INTERRUPTED", "CA 厂商调用被中断（" + operation + "）", true, exception);
        }
        if (response.status() != 200) {
            throw new CaVendorCallException("CA_HTTP_" + response.status(),
                    "CA 厂商返回 HTTP " + response.status() + "（" + operation + "）", true, null);
        }
        JsonNode root;
        try {
            root = json.readTree(response.body());
        } catch (RuntimeException exception) {
            throw new CaVendorCallException("CA_BAD_RESPONSE", "CA 厂商回执不是有效 JSON（" + operation + "）", true, exception);
        }
        if (root == null || !root.isObject() || root.path("code").isMissingNode()) {
            throw new CaVendorCallException("CA_BAD_RESPONSE", "CA 厂商回执缺少 code（" + operation + "）", true, null);
        }
        if (root.path("code").asInt(-1) != 0) {
            String code = text(root.path("errorCode"));
            throw new CaVendorCallException(code == null ? "CA_REJECTED" : code,
                    text(root.path("message")) == null ? "CA 厂商拒绝了该请求" : text(root.path("message")), false, null);
        }
        JsonNode data = root.path("data");
        return data.isObject() ? data : json.readTree("{}");
    }

    static String text(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        String value = node.asString();
        return value == null || value.isBlank() ? null : value;
    }
}
