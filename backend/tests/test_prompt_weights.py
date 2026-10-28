import pytest

from prompt_weights import a1111_to_compel


@pytest.mark.parametrize(
    ("a1111", "compel"),
    [
        ("1girl, (nude:1.3), smile", "1girl, (nude)1.3, smile"),
        ("(worst quality, low quality:1.2), lowres", "(worst quality, low quality)1.2, lowres"),
        ("(masterpiece), [blurry]", "(masterpiece)1.1, (blurry)0.9"),
        ("((detailed eyes))", "((detailed eyes)1.1)1.1"),
        ("(red (silk:1.5) dress:0.8)", "(red (silk)1.5 dress)0.8"),
        ("(tag: 1.25)", "(tag)1.25"),
        ("plain prompt, no weights", "plain prompt, no weights"),
        ("zumi \\(zumidraws\\), (nude:1.2)", "zumi \\(zumidraws\\), (nude)1.2"),
        ("[by nixeu|by wlop]", "[by nixeu|by wlop]"),
    ],
)
def test_weights_are_rewritten_for_compel(a1111: str, compel: str) -> None:
    assert a1111_to_compel(a1111) == compel
