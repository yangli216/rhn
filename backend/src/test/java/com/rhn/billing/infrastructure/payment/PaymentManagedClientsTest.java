package com.rhn.billing.infrastructure.payment;

import com.rhn.billing.application.PaymentMerchantConfigurationStore;
import com.rhn.billing.application.PaymentMerchantConfigurationStore.StoredPaymentConfiguration;
import com.rhn.billing.api.PaymentChannelAdapter.PaymentInstruction;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPairGenerator;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PaymentManagedClientsTest {
    @TempDir Path temporary;
    Map<String,String> alipayValues() throws Exception {
        var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);var pair=generator.generateKeyPair();
        return Map.of("appId","APP","merchantId","MERCHANT","serverUrl","https://openapi.alipay.com/gateway.do","keyMode","PUBLIC_KEY",
                "privateKey",Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded()),"publicKey",Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()));
    }
    @Test void managedAlipayCredentialsAreValidatedAndClientCacheRefreshesWithoutRestart() throws Exception {
        var settings=mock(PaymentMerchantConfigurationStore.class);
        var snapshot=new AtomicReference<>(new StoredPaymentConfiguration(true,0,alipayValues()));
        when(settings.find(1L,2L,"ALIPAY")).thenAnswer(invocation->Optional.of(snapshot.get()));
        var clients=new AlipayPaymentClients(new AlipayPaymentProperties(true,List.of()),settings,new PaymentMockProperties(false,null,null));
        clients.checkConfiguration(snapshot.get().values());
        var merchant=clients.merchant(1L,2L);var first=clients.client(merchant);
        assertSame(first,clients.client(merchant));
        snapshot.set(new StoredPaymentConfiguration(true,1,alipayValues()));
        assertNotSame(first,clients.client(merchant));assertTrue(clients.configured(1L,2L));
        assertFalse(snapshot.get().toString().contains(snapshot.get().values().get("privateKey")));
    }
    @Test void disabledMerchantRejectsCollectionButKeepsRecoveryClientAvailable() throws Exception {
        var settings=mock(PaymentMerchantConfigurationStore.class);
        when(settings.find(1L,2L,"ALIPAY")).thenReturn(Optional.of(new StoredPaymentConfiguration(false,2,alipayValues())));
        var clients=new AlipayPaymentClients(new AlipayPaymentProperties(true,List.of()),settings,new PaymentMockProperties(false,null,null));
        assertFalse(clients.configured(1L,2L));
        assertThrows(BusinessException.class,()->clients.requireCollectionEnabled(1L,2L));
        assertNotNull(clients.client(clients.merchant(1L,2L)));
        var instruction=new PaymentInstruction(10L,"ORDER","KEY",3L,4L,"OUTPATIENT","CASHIER","ALIPAY",java.math.BigDecimal.ONE,"CNY","corr","terminal",null,"284567890123456789",1L,2L);
        assertThrows(BusinessException.class,()->new AlipayPaymentChannelAdapter(clients).validate(instruction));
    }
    @Test void wechatP12IsValidatedInMemoryAndAnInvalidPasswordNeverPasses() throws Exception {
        var path = merchantKeyStore();
        var values=new HashMap<String,String>();values.put("appId","wx-test");values.put("merchantId","1234567890");values.put("apiKey","0123456789abcdef0123456789abcdef");values.put("clientIp","127.0.0.1");
        values.put("certificate",Base64.getEncoder().encodeToString(Files.readAllBytes(path)));
        var settings=mock(PaymentMerchantConfigurationStore.class);
        when(settings.find(1L,2L,"WECHAT")).thenReturn(Optional.of(new StoredPaymentConfiguration(false,1,values)));
        var clients=new WechatPaymentClients(new WechatPaymentProperties(true,List.of()),settings,new PaymentMockProperties(false,null,null));
        clients.checkConfiguration(values);
        assertFalse(clients.configured(1L,2L));assertThrows(BusinessException.class,()->clients.requireCollectionEnabled(1L,2L));
        assertNotNull(clients.client(clients.merchant(1L,2L)).getConfig().initSSLContext());
        values.put("merchantId","wrong-password");
        var failure=assertThrows(BusinessException.class,()->clients.checkConfiguration(values));
        assertFalse(failure.toString().contains(values.get("apiKey")));assertNull(failure.getCause());
    }
    @Test void alipayCertificateModeAcceptsMatchingInMemoryCredentials() throws Exception {
        var path=merchantKeyStore();var keyStore=java.security.KeyStore.getInstance("PKCS12");
        try (var input=Files.newInputStream(path)) { keyStore.load(input,"1234567890".toCharArray()); }
        String certificate="-----BEGIN CERTIFICATE-----\n"+Base64.getMimeEncoder(64,new byte[]{'\n'}).encodeToString(keyStore.getCertificate("merchant").getEncoded())+"\n-----END CERTIFICATE-----\n";
        var values=Map.of("appId","APP","merchantId","MERCHANT","serverUrl","https://openapi.alipay.com/gateway.do","keyMode","CERTIFICATE",
                "privateKey",Base64.getEncoder().encodeToString(keyStore.getKey("merchant","1234567890".toCharArray()).getEncoded()),
                "appCertificate",certificate,"alipayCertificate",certificate,"rootCertificate",certificate);
        var settings=mock(PaymentMerchantConfigurationStore.class);
        when(settings.find(1L,2L,"ALIPAY")).thenReturn(Optional.of(new StoredPaymentConfiguration(true,0,values)));
        var clients=new AlipayPaymentClients(new AlipayPaymentProperties(true,List.of()),settings,new PaymentMockProperties(false,null,null));
        clients.checkConfiguration(values);
        assertTrue(clients.certificateMode(clients.merchant(1L,2L)));assertNotNull(clients.client(clients.merchant(1L,2L)));
        var mismatched=new HashMap<>(values);mismatched.put("privateKey",alipayValues().get("privateKey"));
        assertThrows(BusinessException.class,()->clients.checkConfiguration(mismatched));
    }
    private Path merchantKeyStore() throws Exception {
        var path=temporary.resolve("test-only-merchant.p12");
        var process=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","keytool").toString(),"-J-Xmx64m","-genkeypair","-alias","merchant","-keyalg","RSA","-keysize","2048","-storetype","PKCS12",
                "-keystore",path.toString(),"-storepass","1234567890","-keypass","1234567890","-dname","CN=1234567890","-validity","2","-noprompt").redirectErrorStream(true).redirectOutput(temporary.resolve("keytool.log").toFile()).start();
        try { assertTrue(process.waitFor(30,java.util.concurrent.TimeUnit.SECONDS));assertEquals(0,process.exitValue()); }
        finally { if (process.isAlive()) process.destroyForcibly(); }
        return path;
    }
    @Test void invalidKeysAndUnofficialGatewaysNeverPassLocalCheck() throws Exception {
        var clients=new AlipayPaymentClients(new AlipayPaymentProperties(true,List.of()),mock(PaymentMerchantConfigurationStore.class),new PaymentMockProperties(false,null,null));
        var values=new HashMap<>(alipayValues());values.put("serverUrl","http://127.0.0.1/internal");
        assertThrows(BusinessException.class,()->clients.checkConfiguration(values));
        values.put("serverUrl","https://openapi.alipay.com/gateway.do");values.put("privateKey","do-not-echo-this-key");
        var failure=assertThrows(BusinessException.class,()->clients.checkConfiguration(values));
        assertFalse(failure.toString().contains("do-not-echo-this-key"));assertNull(failure.getCause());
    }
}
