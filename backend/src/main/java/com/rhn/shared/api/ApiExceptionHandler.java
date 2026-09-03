package com.rhn.shared.api;

import com.rhn.platform.web.CorrelationIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.List;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    ResponseEntity<ApiError> handleBusiness(BusinessException exception, HttpServletRequest request) {
        return ResponseEntity.status(exception.status()).body(error(
                exception.code(), exception.getMessage(), request, List.of()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        List<ApiError.FieldViolation> violations = exception.getBindingResult().getFieldErrors().stream()
                .map(this::toViolation)
                .toList();
        return ResponseEntity.badRequest().body(error(
                "VALIDATION_FAILED", "请求数据校验失败", request, violations));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> handleUnreadableJson(HttpMessageNotReadableException exception,
                                                   HttpServletRequest request) {
        log.warn("Unreadable API request, correlationId={}: {}",
                request.getAttribute(CorrelationIdFilter.ATTRIBUTE_NAME), exception.getMostSpecificCause().getMessage());
        return ResponseEntity.badRequest().body(error(
                "MALFORMED_JSON", "请求内容不是合法 JSON 或字段类型不正确", request, List.of()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ApiError> handleIllegalArgument(IllegalArgumentException exception,
                                                   HttpServletRequest request) {
        return ResponseEntity.badRequest().body(error(
                "INVALID_ARGUMENT", exception.getMessage(), request, List.of()));
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ResponseEntity<ApiError> handleOptimisticLock(OptimisticLockingFailureException exception,
                                                   HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error(
                "OPTIMISTIC_LOCK_CONFLICT", "数据已被其他操作更新，请刷新后重试", request, List.of()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiError> handleDataIntegrity(DataIntegrityViolationException exception,
                                                  HttpServletRequest request) {
        log.warn("Data integrity violation at {}: {}", request.getRequestURI(), exception.getMessage(), exception);
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error(
                "DATA_INTEGRITY_CONFLICT", "数据约束冲突，请刷新后重试", request, List.of()));
    }

    @ExceptionHandler({AccessDeniedException.class, AuthorizationDeniedException.class})
    ResponseEntity<ApiError> handleAccessDenied(RuntimeException exception, HttpServletRequest request) {
        boolean missingWorkContext = request.getRequestURI().startsWith("/api/")
                && (request.getHeader("X-Organization-Id") == null
                || request.getHeader("X-Organization-Id").isBlank());
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error(
                missingWorkContext ? "WORK_CONTEXT_REQUIRED" : "ACCESS_DENIED",
                missingWorkContext ? "请选择机构和科室工作上下文" : "当前账号没有执行此操作的权限",
                request, List.of()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleUnexpected(Exception exception, HttpServletRequest request) {
        log.error("Unhandled API exception, correlationId={}",
                request.getAttribute(CorrelationIdFilter.ATTRIBUTE_NAME), exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error(
                "INTERNAL_ERROR", "系统暂时无法处理该请求", request, List.of()));
    }

    private ApiError.FieldViolation toViolation(FieldError error) {
        return new ApiError.FieldViolation(error.getField(), error.getDefaultMessage());
    }

    private ApiError error(String code, String message, HttpServletRequest request,
                           List<ApiError.FieldViolation> violations) {
        Object correlationId = request.getAttribute(CorrelationIdFilter.ATTRIBUTE_NAME);
        return new ApiError(code, message, correlationId == null ? "" : correlationId.toString(),
                Instant.now(), violations);
    }
}
