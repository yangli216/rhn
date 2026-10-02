package com.rhn.platform.masterdata.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class ItemAliasCommands {
    private ItemAliasCommands() {}

    public record ReplaceItemAliasesCommand(@NotNull List<@NotNull @Valid ItemAliasCommand> aliases) {}
    public record ItemAliasCommand(@NotBlank @Size(max = 32) @DictionaryBinding("BD_ALIAS_TYPE") String aliasType,
                                   @NotBlank @Size(max = 300) String aliasName,
                                   boolean primaryAlias, @NotBlank String status) {}
}
