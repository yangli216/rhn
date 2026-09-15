package com.rhn.platform.dictionary.application;

import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import com.rhn.platform.dictionary.api.SystemEnumItem;
import com.rhn.platform.dictionary.domain.DictionaryDefinition;
import com.rhn.platform.dictionary.domain.DictionaryItem;
import com.rhn.platform.dictionary.domain.DictionaryScopeType;
import com.rhn.platform.dictionary.domain.DictionaryStatus;
import com.rhn.platform.dictionary.infrastructure.DictionaryDefinitionRepository;
import com.rhn.platform.dictionary.infrastructure.DictionaryItemRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
class PersistedSystemDictionaryVerifier implements ApplicationRunner {
    private final DictionarySystemEnumCatalog catalog;
    private final DictionaryDefinitionRepository definitionRepository;
    private final DictionaryItemRepository itemRepository;

    PersistedSystemDictionaryVerifier(DictionarySystemEnumCatalog catalog,
                                      DictionaryDefinitionRepository definitionRepository,
                                      DictionaryItemRepository itemRepository) {
        this.catalog = catalog;
        this.definitionRepository = definitionRepository;
        this.itemRepository = itemRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public void run(ApplicationArguments args) {
        catalog.persistedSystemEnums().forEach(this::verify);
    }

    private void verify(SystemEnumDefinition expected) {
        DictionaryDefinition actual = definitionRepository
                .findByScopeTypeAndCode(DictionaryScopeType.PLATFORM, expected.code())
                .orElseThrow(() -> mismatch(expected.code(), "缺少平台字典定义"));
        if (!actual.systemManaged()
                || actual.status() != DictionaryStatus.ACTIVE
                || !expected.name().equals(actual.name())
                || !expected.description().equals(actual.description())) {
            throw mismatch(expected.code(), "字典定义与代码目录不一致");
        }
        List<DictionaryItem> actualItems = itemRepository
                .findByDictionaryIdOrderBySortOrderAscCodeAsc(actual.id());
        if (actualItems.size() != expected.items().size()) {
            throw mismatch(expected.code(), "字典项数量与代码目录不一致");
        }
        for (SystemEnumItem expectedItem : expected.items()) {
            DictionaryItem actualItem = actualItems.stream()
                    .filter(item -> expectedItem.code().equals(item.code()))
                    .findFirst()
                    .orElseThrow(() -> mismatch(expected.code(), "缺少字典项 " + expectedItem.code()));
            if (actualItem.status() != DictionaryStatus.ACTIVE
                    || !expectedItem.name().equals(actualItem.name())
                    || !expectedItem.description().equals(actualItem.description())
                    || expectedItem.sortOrder() != actualItem.sortOrder()) {
                throw mismatch(expected.code(), "字典项与代码目录不一致: " + expectedItem.code());
            }
        }
    }

    private IllegalStateException mismatch(String code, String detail) {
        return new IllegalStateException("系统字典持久化校验失败 [" + code + "]: " + detail);
    }
}
