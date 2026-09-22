import unittest

from policy import RESULT_LABEL, SEARCH, passed, project_state


class PolicyTests(unittest.TestCase):
    def test_private_page_data_and_destructive_actions_are_not_transmitted(self):
        page = {
            "url": "http://localhost:5173/?token=secret",
            "text": "patient-private",
            "title": "patient-private",
            "actions": [
                {
                    "id": "e1",
                    "node": 1,
                    "kind": "click",
                    "label": "删除",
                    "value": "private",
                },
                {
                    "id": "e2",
                    "node": 2,
                    "kind": "fill",
                    "label": "模块名称或分类",
                    "value": SEARCH,
                    "role": "searchbox",
                    "private": "secret",
                },
            ],
        }
        view = project_state(page, {"route": False})
        self.assertEqual([a["id"] for a in view["actions"]], ["e2"])
        self.assertNotIn("private", str(view))
        self.assertNotIn("secret", str(view))

    def test_unexpected_input_fails_before_transmission(self):
        with self.assertRaises(ValueError):
            project_state(
                {
                    "actions": [
                        {
                            "id": "e1",
                            "kind": "fill",
                            "label": "模块名称或分类",
                            "value": "private patient name",
                        }
                    ]
                },
                {"route": False},
            )

    def test_done_does_not_prove_navigation(self):
        evidence = {"route": True, "heading": True, "keyword": True, "query": True}
        self.assertFalse(passed(evidence, []))
        history = [
            {"action": "模块名称或分类", "kind": "fill"},
            {"action": RESULT_LABEL, "kind": "click"},
        ]
        self.assertTrue(passed(evidence, history))
        self.assertFalse(passed({}, history))
        self.assertFalse(passed({**evidence, "heading": False}, history))


if __name__ == "__main__":
    unittest.main()
