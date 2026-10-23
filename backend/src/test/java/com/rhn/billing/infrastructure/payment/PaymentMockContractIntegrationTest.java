package com.rhn.billing.infrastructure.payment;

import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.billing.api.PaymentChannelAdapter.InitiationResult;
import com.rhn.billing.api.PaymentChannelAdapter.PaymentInstruction;
import com.rhn.billing.api.PaymentChannelAdapter.QueryInstruction;
import com.rhn.billing.api.PaymentChannelAdapter.QueryResult;
import com.rhn.billing.api.PaymentChannelAdapter.RefundInstruction;
import com.rhn.billing.api.PaymentChannelAdapter.RefundResult;
import com.rhn.billing.application.PaymentChannelRegistry;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Duration;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * 真实支付宝/微信 SDK ↔ 统一三方 Mock 服务的协议联调证据。
 *
 * <p>该用例依赖跨仓库的 Mock jar，无法在 CI 中自动编排，因此是本地/联调证据而非门禁：
 * 测试自行在 {@link #MOCK_PORT} 拉起一个 Mock 实例（用运行时生成的临时密钥覆盖网关密钥），
 * jar 缺失或端口不可用时整体跳过。密钥与 p12 材料全部运行时生成，不落库、不提交。
 */
@SpringBootTest
@ActiveProfiles({"test", "paymentmock"})
class PaymentMockContractIntegrationTest {
    private static final int MOCK_PORT = 18091;
    private static final String GATEWAY_URL = "http://127.0.0.1:" + MOCK_PORT + "/alipay/gateway.do";
    private static final String WXPAY_HOST_URL = "http://127.0.0.1:" + MOCK_PORT + "/wxpay";
    /** 微信商户号同时是 p12 的存储口令与密钥口令（WxJava {@code initSSLContext()} 的约定）。 */
    private static final String WECHAT_MCH_ID = "1900000109";

    private static Path keys;
    private static Process mockProcess;
    private static boolean mockAvailable;

    static {
        try {
            keys = Files.createTempDirectory("rhn-payment-mock-keys");
            KeyPair application = keyPair();
            KeyPair alipay = keyPair();
            Path appPublic = write(keys.resolve("app-public-key.pem"), pem("PUBLIC KEY", application.getPublic().getEncoded()));
            write(keys.resolve("app-private-key.pem"), pem("PRIVATE KEY", application.getPrivate().getEncoded()));
            Path alipayPrivate = write(keys.resolve("alipay-private-key.pem"), pem("PRIVATE KEY", alipay.getPrivate().getEncoded()));
            write(keys.resolve("alipay-public-key.pem"), pem("PUBLIC KEY", alipay.getPublic().getEncoded()));
            generateMerchantKeystore(keys.resolve("merchant.p12"), WECHAT_MCH_ID);
            mockProcess = startMock(appPublic, alipayPrivate);
            mockAvailable = mockProcess != null;
        } catch (Exception exception) {
            mockAvailable = false;
        }
    }

    @DynamicPropertySource
    static void mockProperties(DynamicPropertyRegistry registry) {
        registry.add("payment.mock.gateway-url", () -> GATEWAY_URL);
        registry.add("payment.mock.wxpay-host-url", () -> WXPAY_HOST_URL);
        registry.add("payment.mock.keys", () -> keys == null ? "" : keys.toString());
    }

    @BeforeAll
    static void requireMock() {
        Assumptions.assumeTrue(mockAvailable, "本地统一三方 Mock 服务不可用（缺少 rhn-thirdparty-mocks jar 或端口被占用），跳过联调用例");
    }

    @AfterAll
    static void stopMock() {
        if (mockProcess != null) mockProcess.destroyForcibly();
    }

    @Autowired
    private PaymentChannelRegistry registry;

    @Test
    void alipayRealSdkRoundTripAgainstMockGateway() {
        PaymentChannelAdapter adapter = registry.resolve("ALIPAY");
        long payOrderId = 90001L;
        BigDecimal amount = new BigDecimal("12.34");

        InitiationResult initiation = adapter.initiate(new PaymentInstruction(
                payOrderId, "MOCK-ORDER-1", "MOCK-KEY-1", 3L, 4L, "OUTPATIENT", "CASHIER", "ALIPAY",
                amount, "CNY", "mock-correlation", "TERMINAL", null, "284567890123456789", 1L, 2L));
        assertEquals(InitiationResult.Outcome.SUCCEEDED, initiation.outcome());
        assertNotNull(initiation.externalOrderNo());
        assertNotNull(initiation.externalTransactionNo());
        assertEquals(amount, initiation.capturedAmount());

        QueryResult settlement = adapter.query(new QueryInstruction(
                payOrderId, "MOCK-ORDER-1", "SETTLEMENT_PAY", "ALIPAY", initiation.externalOrderNo(),
                amount, "CNY", "mock-correlation", "TERMINAL", null, 1L, 2L));
        assertEquals(QueryResult.Outcome.SUCCEEDED, settlement.outcome());
        assertEquals(initiation.externalTransactionNo(), settlement.externalTransactionNo());

        long refundOrderId = 90002L;
        RefundResult refund = adapter.refund(new RefundInstruction(
                refundOrderId, "MOCK-REFUND-1", "MOCK-RKEY-1", 10L, "PAY-LOCAL",
                initiation.externalTransactionNo(), "OUTPATIENT", "CASHIER", "ALIPAY", amount, "CNY",
                "mock refund", "mock-correlation", "TERMINAL", amount, 1L, 2L));
        assertEquals(RefundResult.Outcome.PENDING, refund.outcome());
        assertNotNull(refund.externalOrderNo());

        QueryResult refundQuery = adapter.query(new QueryInstruction(
                refundOrderId, "MOCK-REFUND-1", "REFUND", "ALIPAY", refund.externalOrderNo(),
                amount, "CNY", "mock-correlation", "TERMINAL", initiation.externalTransactionNo(), 1L, 2L));
        assertEquals(QueryResult.Outcome.SUCCEEDED, refundQuery.outcome());
    }

    @Test
    void wechatRealSdkRoundTripAgainstMockGateway() {
        PaymentChannelAdapter adapter = registry.resolve("WECHAT");
        long payOrderId = 91001L;
        BigDecimal amount = new BigDecimal("12.34");

        InitiationResult initiation = adapter.initiate(new PaymentInstruction(
                payOrderId, "MOCK-WX-ORDER-1", "MOCK-WX-KEY-1", 3L, 4L, "OUTPATIENT", "CASHIER", "WECHAT",
                amount, "CNY", "mock-correlation", "TERMINAL", null, "134567890123456789", 1L, 2L));
        assertEquals(InitiationResult.Outcome.SUCCEEDED, initiation.outcome());
        assertNotNull(initiation.externalOrderNo());
        assertNotNull(initiation.externalTransactionNo());
        assertEquals(amount, initiation.capturedAmount());

        QueryResult settlement = adapter.query(new QueryInstruction(
                payOrderId, "MOCK-WX-ORDER-1", "SETTLEMENT_PAY", "WECHAT", initiation.externalOrderNo(),
                amount, "CNY", "mock-correlation", "TERMINAL", null, 1L, 2L));
        assertEquals(QueryResult.Outcome.SUCCEEDED, settlement.outcome());
        assertEquals(initiation.externalTransactionNo(), settlement.externalTransactionNo());

        long refundOrderId = 91002L;
        RefundResult refund = adapter.refund(new RefundInstruction(
                refundOrderId, "MOCK-WX-REFUND-1", "MOCK-WX-RKEY-1", 10L, "PAY-LOCAL",
                initiation.externalTransactionNo(), "OUTPATIENT", "CASHIER", "WECHAT", amount, "CNY",
                "mock refund", "mock-correlation", "TERMINAL", amount, 1L, 2L));
        assertEquals(RefundResult.Outcome.PENDING, refund.outcome());
        assertNotNull(refund.externalOrderNo());

        QueryResult refundQuery = adapter.query(new QueryInstruction(
                refundOrderId, "MOCK-WX-REFUND-1", "REFUND", "WECHAT", refund.externalOrderNo(),
                amount, "CNY", "mock-correlation", "TERMINAL", initiation.externalTransactionNo(), 1L, 2L));
        assertEquals(QueryResult.Outcome.SUCCEEDED, refundQuery.outcome());
    }

    /** 用 JDK keytool 生成 PKCS12 商户密钥库；口令等于商户号，与 WxJava {@code initSSLContext()} 一致。 */
    private static void generateMerchantKeystore(Path keystore, String password) throws IOException, InterruptedException {
        Process process = new ProcessBuilder(
                Path.of(System.getProperty("java.home"), "bin", "keytool").toString(),
                "-genkeypair", "-alias", "merchant", "-keyalg", "RSA", "-keysize", "2048",
                "-storetype", "PKCS12", "-dname", "CN=" + password,
                "-storepass", password, "-keypass", password,
                "-validity", "3650", "-keystore", keystore.toString())
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .start();
        if (!process.waitFor(60, java.util.concurrent.TimeUnit.SECONDS) || process.exitValue() != 0) {
            throw new IllegalStateException("keytool 生成微信商户 p12 失败");
        }
    }

    private static Process startMock(Path requestVerifyPublicKey, Path responseSignPrivateKey) throws IOException {
        Path jar = mockJar();
        if (jar == null) return null;
        Process process = new ProcessBuilder(
                Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-jar", jar.toString(),
                "--server.address=127.0.0.1",
                "--server.port=" + MOCK_PORT,
                "--mock.alipay.request-verify-public-key=file:" + requestVerifyPublicKey,
                "--mock.alipay.response-sign-private-key=file:" + responseSignPrivateKey)
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .start();
        Runtime.getRuntime().addShutdownHook(new Thread(process::destroyForcibly));
        return healthy() ? process : stop(process);
    }

    private static Process stop(Process process) {
        process.destroyForcibly();
        return null;
    }

    private static boolean healthy() {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + MOCK_PORT + "/mock/health"))
                .timeout(Duration.ofSeconds(2)).GET().build();
        for (int attempt = 0; attempt < 40; attempt++) {
            try {
                Thread.sleep(500);
                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if (response.statusCode() == 200 && response.body().contains("alipay")) return true;
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return false;
            } catch (Exception exception) {
                // Mock 尚未监听，继续轮询。
            }
        }
        return false;
    }

    private static Path mockJar() throws IOException {
        for (Path cursor = Path.of(System.getProperty("user.dir")).toAbsolutePath(); cursor != null; cursor = cursor.getParent()) {
            Path jar = newestJar(cursor.resolve("rhn-thirdparty-mocks").resolve("target"));
            if (jar != null) return jar;
            Path parent = cursor.getParent();
            if (parent != null) {
                jar = newestJar(parent.resolve("rhn-thirdparty-mocks").resolve("target"));
                if (jar != null) return jar;
            }
        }
        return null;
    }

    private static Path newestJar(Path targetDirectory) throws IOException {
        if (!Files.isDirectory(targetDirectory)) return null;
        try (Stream<Path> entries = Files.list(targetDirectory)) {
            List<Path> jars = entries
                    .filter(path -> path.getFileName().toString().startsWith("rhn-thirdparty-mocks-"))
                    .filter(path -> path.getFileName().toString().endsWith(".jar"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString())).toList();
            return jars.isEmpty() ? null : jars.get(jars.size() - 1);
        }
    }

    private static KeyPair keyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    private static String pem(String type, byte[] encoded) {
        String base64 = Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.UTF_8)).encodeToString(encoded);
        return "-----BEGIN " + type + "-----\n" + base64 + "\n-----END " + type + "-----\n";
    }

    private static Path write(Path path, String content) throws IOException {
        Files.writeString(path, content, StandardCharsets.UTF_8);
        return path;
    }
}
