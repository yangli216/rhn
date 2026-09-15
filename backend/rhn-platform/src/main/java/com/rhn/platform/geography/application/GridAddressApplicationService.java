package com.rhn.platform.geography.application;

import com.rhn.platform.geography.api.GridAddressNodeView;
import com.rhn.platform.geography.domain.GridAddressLevel;
import com.rhn.platform.geography.domain.GridAddressNode;
import com.rhn.platform.geography.domain.GridAddressStatus;
import com.rhn.platform.geography.infrastructure.GridAddressNodeRepository;
import com.rhn.shared.api.RevisionGuard;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class GridAddressApplicationService {
    private final GridAddressNodeRepository repository;
    private final ExecutionContextProvider contextProvider;

    public GridAddressApplicationService(GridAddressNodeRepository repository, ExecutionContextProvider contextProvider) {
        this.repository = repository;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public List<GridAddressNodeView> list(Integer maxLevel, String query, boolean includeInactive) {
        int depth = maxLevel == null ? 5 : maxLevel;
        if (depth != 3 && depth != 5) throw badRequest("GRID_ADDRESS_LEVEL_MODE_INVALID", "地址层级只能配置为 3 级或 5 级");
        String keyword = normalizeQuery(query);
        return repository.findAllByOrderBySortOrderAscCodeAsc().stream()
                .filter(node -> node.level().depth() <= depth)
                .filter(node -> includeInactive || node.status() == GridAddressStatus.ACTIVE)
                .filter(node -> keyword == null || searchText(node).contains(keyword))
                .map(this::view).toList();
    }

    @Transactional
    public GridAddressNodeView create(Long parentId, GridAddressLevel level, String code, String name,
                                      String shortName, String pinyinCode, int sortOrder) {
        GridAddressNode parent = validateParent(null, parentId, level);
        String normalizedCode = normalizeCode(code, level, parent);
        String normalizedName = requireText(name, "网格名称不能为空");
        if (repository.findByCode(normalizedCode).isPresent()) {
            throw conflict("GRID_ADDRESS_CODE_DUPLICATE", "网格地址编码已经存在");
        }
        if (parentId != null && repository.existsByParentIdAndName(parentId, normalizedName)) {
            throw conflict("GRID_ADDRESS_NAME_DUPLICATE", "同一上级下已存在相同名称");
        }
        GridAddressNode node = new GridAddressNode(parentId, level, normalizedCode, normalizedName,
                trim(shortName), normalizePinyin(pinyinCode), path(parent, normalizedName), sortOrder, actorId());
        return view(repository.saveAndFlush(node));
    }

    @Transactional
    public GridAddressNodeView update(Long id, long expectedRevision, Long parentId, String name,
                                      String shortName, String pinyinCode, int sortOrder) {
        GridAddressNode node = require(id);
        GridAddressNode parent = validateParent(id, parentId, node.level());
        String normalizedName = requireText(name, "网格名称不能为空");
        return RevisionGuard.supply("GRID_ADDRESS_REVISION_CONFLICT",
                "网格地址已被其他用户修改，请刷新后重试", () -> {
            node.update(parentId, normalizedName, trim(shortName), normalizePinyin(pinyinCode),
                    path(parent, normalizedName), sortOrder, expectedRevision, actorId());
            GridAddressNode saved = repository.saveAndFlush(node);
            refreshDescendantPaths(saved);
            return view(saved);
        });
    }

    @Transactional
    public GridAddressNodeView changeStatus(Long id, long expectedRevision, GridAddressStatus status) {
        GridAddressNode node = require(id);
        if (status == GridAddressStatus.INACTIVE
                && repository.existsByParentIdAndStatus(id, GridAddressStatus.ACTIVE)) {
            throw conflict("GRID_ADDRESS_CHILD_ACTIVE", "请先停用当前节点下的有效子级");
        }
        return RevisionGuard.supply("GRID_ADDRESS_REVISION_CONFLICT",
                "网格地址已被其他用户修改，请刷新后重试", () -> {
            node.changeStatus(status, expectedRevision, actorId());
            return view(repository.saveAndFlush(node));
        });
    }

    private GridAddressNode validateParent(Long nodeId, Long parentId, GridAddressLevel level) {
        if (level == GridAddressLevel.PROVINCE) {
            if (parentId != null) throw badRequest("GRID_ADDRESS_PARENT_INVALID", "省级节点不能设置上级");
            return null;
        }
        if (parentId == null) throw badRequest("GRID_ADDRESS_PARENT_REQUIRED", "该层级必须选择上级网格");
        GridAddressNode parent = require(parentId);
        if (parent.level().childLevel() != level) {
            throw badRequest("GRID_ADDRESS_LEVEL_INVALID", "网格层级必须按省、市、县、街道、社区顺序建立");
        }
        Set<Long> visited = new HashSet<>();
        for (GridAddressNode current = parent; current != null; ) {
            if (!visited.add(current.id()) || current.id().equals(nodeId)) {
                throw badRequest("GRID_ADDRESS_CYCLE", "上级网格不能选择当前节点或其下级");
            }
            current = current.parentId() == null ? null : require(current.parentId());
        }
        return parent;
    }

    private void refreshDescendantPaths(GridAddressNode parent) {
        for (GridAddressNode child : repository.findByParentIdOrderBySortOrderAscCodeAsc(parent.id())) {
            child.refreshPath(path(parent, child.name()), actorId());
            repository.save(child);
            refreshDescendantPaths(child);
        }
    }

    private GridAddressNode require(Long id) {
        return repository.findById(id).orElseThrow(() -> notFound("GRID_ADDRESS_NOT_FOUND", "未找到网格地址"));
    }

    private GridAddressNodeView view(GridAddressNode node) {
        return new GridAddressNodeView(node.id(), node.revision(), node.parentId(), node.level(),
                node.level().displayName(), node.level().depth(), node.code(), node.name(), node.shortName(),
                node.pinyinCode(), node.fullPath(), node.sortOrder(), node.status(), node.systemManaged(), node.updatedAt());
    }

    private Long actorId() { return contextProvider.requireCurrent().subjectId(); }
    private static String path(GridAddressNode parent, String name) { return parent == null ? name : parent.fullPath() + "/" + name; }
    private static String normalizeCode(String code, GridAddressLevel level, GridAddressNode parent) {
        String value = requireText(code, "网格地址编码不能为空");
        if (!value.matches("\\d{12}")) {
            throw badRequest("GRID_ADDRESS_CODE_INVALID", "统计用区划代码必须为 12 位数字");
        }
        int significantLength = switch (level) {
            case PROVINCE -> 2;
            case CITY -> 4;
            case COUNTY -> 6;
            case STREET -> 9;
            case COMMUNITY -> 12;
        };
        if (significantLength < 12 && !value.substring(significantLength).matches("0+")) {
            throw badRequest("GRID_ADDRESS_CODE_LEVEL_INVALID", level.displayName() + "编码的后续码段必须补 0");
        }
        int segmentStart = switch (level) {
            case PROVINCE -> 0;
            case CITY -> 2;
            case COUNTY -> 4;
            case STREET -> 6;
            case COMMUNITY -> 9;
        };
        if (value.substring(segmentStart, significantLength).matches("0+")) {
            throw badRequest("GRID_ADDRESS_CODE_SEGMENT_INVALID", level.displayName() + "本级码段不能全为 0");
        }
        if (parent != null) {
            int parentLength = switch (parent.level()) {
                case PROVINCE -> 2;
                case CITY -> 4;
                case COUNTY -> 6;
                case STREET -> 9;
                case COMMUNITY -> 12;
            };
            if (!value.regionMatches(0, parent.code(), 0, parentLength)) {
                throw badRequest("GRID_ADDRESS_CODE_PREFIX_INVALID", "统计用区划代码必须继承上级网格的前缀");
            }
        }
        return value;
    }
    private static String normalizePinyin(String value) {
        String result = requireText(value, "拼音码不能为空").replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        if (result.length() > 64) throw badRequest("GRID_ADDRESS_PINYIN_INVALID", "拼音码不能超过 64 位");
        return result;
    }
    private static String normalizeQuery(String value) { String result = trim(value); return result == null ? null : result.toUpperCase(Locale.ROOT); }
    private static String searchText(GridAddressNode node) {
        return (node.code() + " " + node.name() + " " + (node.shortName() == null ? "" : node.shortName())
                + " " + node.pinyinCode() + " " + node.fullPath()).toUpperCase(Locale.ROOT);
    }
    private static String requireText(String value, String message) { String result = trim(value); if (result == null) throw badRequest("GRID_ADDRESS_FIELD_REQUIRED", message); return result; }
    private static String trim(String value) { return value == null || value.trim().isEmpty() ? null : value.trim(); }
}
