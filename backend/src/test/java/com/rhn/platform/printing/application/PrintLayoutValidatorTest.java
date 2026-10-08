package com.rhn.platform.printing.application;

import com.rhn.platform.printing.domain.PrintDocumentDefinition;
import com.rhn.platform.printing.domain.PrintMediaProfile;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PrintLayoutValidatorTest {
    @ParameterizedTest
    @CsvSource({"line,76,0,true", "line,0,120,true", "line,0,0,false", "line,76,-1,false",
            "line,79,0,false", "line,0,139,false", "text,76,0,false", "box,0,10,false", "barcode,50,0,false"})
    void canvas_accepts_horizontal_and_vertical_lines_but_rejects_invalid_or_out_of_bounds_elements(
            String type, double width, double height, boolean valid) {
        JsonCodec json = mock(JsonCodec.class);
        PrintDocumentDefinition definition = mock(PrintDocumentDefinition.class);
        PrintMediaProfile media = mock(PrintMediaProfile.class);
        when(definition.layoutMode()).thenReturn("CANVAS");
        when(media.widthMm()).thenReturn(BigDecimal.valueOf(80));
        when(json.readObject("layout")).thenReturn(Map.of(
                "paper", Map.of("widthMm", 80, "heightMm", 140),
                "elements", List.of(Map.of("type", type, "xMm", 2, "yMm", 2, "widthMm", width, "heightMm", height))));
        PrintLayoutValidator validator = new PrintLayoutValidator(json);
        if (valid) assertDoesNotThrow(() -> validator.validate("RHN_PRINT_CANVAS_V1", "layout", definition, media));
        else assertEquals("PRINT_LAYOUT_ELEMENT_INVALID", assertThrows(BusinessException.class,
                () -> validator.validate("RHN_PRINT_CANVAS_V1", "layout", definition, media)).code());
    }
}
