package com.rhn.billing.application;

import com.rhn.billing.api.PaymentChannelConfigurationAdapter;
import com.rhn.billing.api.PaymentChannelConfigurationAdapter.*;
import com.rhn.billing.api.PaymentConfigurationPermissions;
import com.rhn.billing.domain.PaymentMerchantConfiguration;
import com.rhn.billing.infrastructure.PaymentMerchantConfigurationRepository;
import com.rhn.platform.cryptography.api.SecretEncryptionService;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.api.StaleRevisionException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class PaymentChannelManagementService {
    private final Map<String, PaymentChannelConfigurationAdapter> providers;
    private final PaymentMerchantConfigurationRepository repository;
    private final PaymentMerchantConfigurationStore store;
    private final SecretEncryptionService encryption;
    private final OrganizationDirectory organizations;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;

    public PaymentChannelManagementService(List<PaymentChannelConfigurationAdapter> adapters, PaymentChannelRegistry routes,
            PaymentMerchantConfigurationRepository repository, PaymentMerchantConfigurationStore store,
            SecretEncryptionService encryption, OrganizationDirectory organizations, ExecutionContextProvider contexts, JsonCodec json) {
        var registered = new LinkedHashMap<String, PaymentChannelConfigurationAdapter>();
        for (var adapter : adapters) {
            var descriptor = adapter.configurationDescriptor();
            var owner = routes.resolve(descriptor.paymentMethodCode());
            if (owner == null || !owner.capabilities(descriptor.paymentMethodCode()).adapterCode().equals(descriptor.adapterCode())
                    || registered.putIfAbsent(descriptor.paymentMethodCode(), adapter) != null) {
                throw new IllegalArgumentException("渠道配置提供者必须唯一且属于对应支付适配器");
            }
            var keys = new HashSet<String>();
            for (var field : descriptor.fields()) {
                if (!field.key().matches("[a-z][A-Za-z0-9]{0,63}") || !keys.add(field.key())
                        || !Set.of("TEXT", "PASSWORD", "FILE", "CHOICE").contains(field.control())
                        || (field.secret() != Set.of("PASSWORD", "FILE").contains(field.control()))
                        || ("FILE".equals(field.control()) && !Set.of("UTF8", "BASE64").contains(field.encoding()))
                        || (field.identity() && field.secret())) throw new IllegalArgumentException("渠道配置字段声明无效");
            }
        }
        providers = Collections.unmodifiableMap(registered); this.repository = repository; this.store = store;
        this.encryption = encryption; this.organizations = organizations; this.contexts = contexts; this.json = json;
    }

    @Transactional(readOnly = true)
    public PaymentConfigurationCatalog catalog() {
        var context = requireManager();
        var visible = organizations.listOrganizationUnits(context.tenantId()).stream()
                .filter(org -> allowed(context, org.id())).map(org -> new PaymentConfigurationOrganization(org.id(), org.name())).toList();
        return new PaymentConfigurationCatalog(encryption.available(), visible,
                providers.values().stream().map(PaymentChannelConfigurationAdapter::configurationDescriptor).toList());
    }

    @Transactional(readOnly = true)
    public PaymentMerchantConfigurationView get(Long organizationId, String method) {
        var context = requireOrganization(organizationId);
        var provider = provider(method);
        var row = repository.findByTenantIdAndOrganizationIdAndPaymentMethodCode(context.tenantId(), organizationId, method).orElse(null);
        var values = currentValues(provider, context.tenantId(), organizationId, row);
        Map<String, String> publicValues = new LinkedHashMap<>();
        Map<String, Boolean> secrets = new LinkedHashMap<>();
        for (var field : provider.configurationDescriptor().fields()) {
            if (field.secret()) secrets.put(field.key(), nonblank(values.get(field.key())));
            else if (values.containsKey(field.key())) publicValues.put(field.key(), values.get(field.key()));
        }
        return new PaymentMerchantConfigurationView(organizationId, method, row == null ? -1 : row.revision(),
                row == null ? !values.isEmpty() : row.enabled(), row == null ? deploymentIdentityLocked(provider, values) : row.identityLocked(),
                row == null ? (values.isEmpty() ? "UNCONFIGURED" : "DEPLOYMENT") : "MANAGED", encryption.available(), publicValues, secrets, row == null ? null : row.updatedAt());
    }

    @Transactional
    public PaymentMerchantConfigurationView save(Long organizationId, String method, PaymentMerchantConfigurationUpdate update) {
        var context = requireOrganization(organizationId);
        var provider = provider(method);
        requireUpdate(update);
        if (!encryption.available()) throw conflict("PAYMENT_SECRET_ENCRYPTION_REQUIRED", "请先配置服务端凭证加密主密钥，再保存支付配置");
        var existing = repository.lock(context.tenantId(), organizationId, method).orElse(null);
        long revision = existing == null ? -1 : existing.revision();
        if (update.expectedRevision() != revision) throw new StaleRevisionException(revision);
        var old = currentValues(provider, context.tenantId(), organizationId, existing);
        var values = merge(provider, old, update);
        boolean locked = existing == null ? deploymentIdentityLocked(provider, old) : existing.identityLocked();
        if (locked) for (var field : provider.configurationDescriptor().fields()) {
            if (field.identity() && !Objects.equals(old.get(field.key()), values.get(field.key()))) {
                throw conflict("PAYMENT_MERCHANT_IDENTITY_LOCKED", "已启用商户的应用、商户号及支付环境不能直接替换，请保留历史交易处理渠道");
            }
        }
        // A pure stop must remain possible even if an existing credential has expired.
        boolean changed = !old.equals(values);
        if (update.enabled() || locked && changed) validate(provider, values);
        for (var field : provider.configurationDescriptor().fields()) {
            if (field.secret() && field.visibleWhenField() != null && !Objects.equals(values.get(field.visibleWhenField()), field.visibleWhenValue())) values.remove(field.key());
        }
        var row = existing == null ? new PaymentMerchantConfiguration(context.tenantId(), organizationId, method) : existing;
        if (locked) row.lockIdentity();
        row.update(existing == null ? 0 : revision, update.enabled(),
                encryption.encrypt(json.write(values), PaymentMerchantConfigurationStore.binding(context.tenantId(), organizationId, method)), context.subjectId());
        repository.saveAndFlush(row);
        return get(organizationId, method);
    }

    @Transactional(readOnly = true)
    public PaymentConfigurationCheckResult check(Long organizationId, String method, PaymentMerchantConfigurationUpdate update) {
        var context = requireOrganization(organizationId);
        var provider = provider(method);
        requireUpdate(update);
        var row = repository.findByTenantIdAndOrganizationIdAndPaymentMethodCode(context.tenantId(), organizationId, method).orElse(null);
        if (update.expectedRevision() != (row == null ? -1 : row.revision())) throw new StaleRevisionException(row == null ? -1L : row.revision());
        try {
            validate(provider, merge(provider, currentValues(provider, context.tenantId(), organizationId, row), update));
            return new PaymentConfigurationCheckResult(true, "字段、密钥和证书本地检测通过；线上签约与实际收退款仍需商户联调", Instant.now());
        } catch (com.rhn.shared.api.BusinessException exception) {
            return new PaymentConfigurationCheckResult(false, exception.getMessage(), Instant.now());
        }
    }

    private Map<String, String> currentValues(PaymentChannelConfigurationAdapter provider, Long tenantId, Long orgId, PaymentMerchantConfiguration row) {
        return row == null ? provider.deploymentConfiguration(tenantId, orgId)
                : store.decode(row.encryptedValues(), tenantId, orgId, provider.configurationDescriptor().paymentMethodCode());
    }
    private Map<String, String> merge(PaymentChannelConfigurationAdapter provider, Map<String, String> current, PaymentMerchantConfigurationUpdate update) {
        var fields = new HashMap<String, PaymentConfigurationField>();
        provider.configurationDescriptor().fields().forEach(field -> fields.put(field.key(), field));
        var result = new LinkedHashMap<>(current);
        if (update.values().size() > fields.size() || update.clearSecrets().size() > fields.size()) throw badRequest("PAYMENT_CONFIGURATION_FIELDS_INVALID", "提交了未声明的支付配置字段");
        for (var entry : update.values().entrySet()) {
            var field = fields.get(entry.getKey());
            if (field == null || entry.getValue() == null || entry.getValue().length() > 180000) throw badRequest("PAYMENT_CONFIGURATION_FIELDS_INVALID", "支付配置字段无效或内容过长");
            String value = entry.getValue().trim();
            if (!field.secret() || !value.isEmpty()) result.put(entry.getKey(), value);
        }
        for (String key : update.clearSecrets()) {
            var field = fields.get(key);
            if (field == null || !field.secret() || nonblank(update.values().get(key))) throw badRequest("PAYMENT_CONFIGURATION_SECRET_CONFLICT", "清除凭证时不能同时录入该凭证");
            result.remove(key);
        }
        return result;
    }
    private void validate(PaymentChannelConfigurationAdapter provider, Map<String, String> values) {
        for (var field : provider.configurationDescriptor().fields()) {
            if (field.visibleWhenField() != null && !Objects.equals(values.get(field.visibleWhenField()), field.visibleWhenValue())) continue;
            if (field.required() && !nonblank(values.get(field.key()))) throw badRequest("PAYMENT_CONFIGURATION_REQUIRED", "请填写或上传：" + field.label());
            if (!field.options().isEmpty() && field.options().stream().noneMatch(option -> option.value().equals(values.get(field.key())))) throw badRequest("PAYMENT_CONFIGURATION_OPTION_INVALID", "请选择有效的" + field.label());
        }
        try { provider.checkConfiguration(values); }
        catch (RuntimeException exception) { throw badRequest("PAYMENT_CONFIGURATION_CREDENTIAL_INVALID", "渠道配置或凭证检测未通过，请检查密钥格式、证书有效期和商户信息"); }
    }
    private void requireUpdate(PaymentMerchantConfigurationUpdate update) {
        if (update == null) throw badRequest("PAYMENT_CONFIGURATION_UPDATE_REQUIRED", "请提供配置版本和渠道启停状态");
    }
    private boolean deploymentIdentityLocked(PaymentChannelConfigurationAdapter provider, Map<String, String> values) {
        return !values.isEmpty() && provider.configurationDescriptor().fields().stream().filter(PaymentConfigurationField::identity)
                .allMatch(field -> nonblank(values.get(field.key())));
    }
    private PaymentChannelConfigurationAdapter provider(String method) {
        var value = providers.get(method);
        if (value == null) throw notFound("PAYMENT_CONFIGURATION_PROVIDER_MISSING", "支付渠道未在当前部署启用配置管理");
        return value;
    }
    private ExecutionContext requireManager() {
        var context = contexts.requireCurrent();
        if (!context.hasAuthority(PaymentConfigurationPermissions.MANAGE) && !context.hasAuthority("ROLE_ADMIN")) throw forbidden("PAYMENT_CONFIGURATION_FORBIDDEN", "当前账号无权维护支付渠道");
        return context;
    }
    private ExecutionContext requireOrganization(Long id) {
        var context = requireManager();
        if (!allowed(context, id)) throw forbidden("PAYMENT_CONFIGURATION_ORGANIZATION_FORBIDDEN", "当前账号无权维护此机构的支付渠道");
        organizations.requireOrganization(context.tenantId(), id);
        return context;
    }
    private boolean allowed(ExecutionContext context, Long id) { return id != null && (context.canAccessOrganization(id) || "TENANT".equals(context.dataScopeType()) || context.hasAuthority("ROLE_ADMIN")); }
    private static boolean nonblank(String value) { return value != null && !value.isBlank(); }

    public record PaymentConfigurationCatalog(boolean encryptionAvailable, List<PaymentConfigurationOrganization> organizations, List<PaymentConfigurationDescriptor> channels) {}
    public record PaymentConfigurationOrganization(Long id, String name) {}
    public record PaymentMerchantConfigurationView(Long organizationId, @com.rhn.platform.dictionary.api.DictionaryBinding("PAY_METHOD") String paymentMethodCode, long revision, boolean enabled,
            boolean identityLocked, String source, boolean encryptionAvailable, Map<String, String> values,
            Map<String, Boolean> configuredSecrets, Instant updatedAt) {}
    public record PaymentMerchantConfigurationUpdate(
            @com.fasterxml.jackson.annotation.JsonProperty(value = "expectedRevision", required = true)
            @com.fasterxml.jackson.annotation.JsonSetter(nulls = com.fasterxml.jackson.annotation.Nulls.FAIL)
            @io.swagger.v3.oas.annotations.media.Schema(requiredMode = io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED)
            long expectedRevision,
            @com.fasterxml.jackson.annotation.JsonProperty(value = "enabled", required = true)
            @com.fasterxml.jackson.annotation.JsonSetter(nulls = com.fasterxml.jackson.annotation.Nulls.FAIL)
            @io.swagger.v3.oas.annotations.media.Schema(requiredMode = io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED)
            boolean enabled,
            @io.swagger.v3.oas.annotations.media.Schema(accessMode = io.swagger.v3.oas.annotations.media.Schema.AccessMode.WRITE_ONLY)
            Map<String, String> values, Set<String> clearSecrets) {
        public PaymentMerchantConfigurationUpdate { values = values == null ? Map.of() : Map.copyOf(values); clearSecrets = clearSecrets == null ? Set.of() : Set.copyOf(clearSecrets); }
        @Override public String toString() { return "PaymentMerchantConfigurationUpdate[credentials=REDACTED]"; }
    }
    public record PaymentConfigurationCheckResult(boolean success, String message, Instant checkedAt) {}
}
