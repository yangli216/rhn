"""Narrow pilot policy: only module-search UI, never arbitrary business actions."""

SEARCH = "挂号查询"
GOAL = (
    "通过“搜索模块”打开搜索框，输入“挂号查询”，点击匹配模块。"
    "目标页面加载并显示挂号查询标题及查询条件后才可 DONE。只做模块导航。"
)
RESULT_LABEL = "挂号查询 门诊诊疗"


def project_state(page, evidence):
    """Construct a fresh allowlisted model view; raw DOM text never leaves the machine."""
    allowed = {
        ("click", "搜索模块"),
        ("fill", "模块名称或分类"),
        ("click", RESULT_LABEL),
        ("wait", "Wait for the page to update"),
    }
    actions = []
    for a in page["actions"]:
        if (a["kind"], a["label"]) not in allowed:
            continue
        value = a.get("value", "")
        if a["kind"] == "fill" and value not in ("", SEARCH):
            raise ValueError(
                "Unexpected module-search value; stopped before model transmission"
            )
        # Only these fields enter choose(); guards, text, URLs and screenshots stay local.
        actions.append(
            {
                k: a[k]
                for k in ("id", "node", "role", "label", "kind", "value")
                if k in a
            }
        )
    return {
        "url": "http://localhost/"
        + ("outpatient/registration-query" if evidence["route"] else ""),
        "title": "RHN module navigation pilot",
        "text": str(evidence),
        "actions": actions,
    }


def passed(evidence, history):
    return (
        all(evidence.get(k) is True for k in ("route", "heading", "keyword", "query"))
        and any(h["kind"] == "fill" for h in history)
        and any(h["action"] == RESULT_LABEL for h in history)
    )
