"""Generate the PNG fixtures used by the unit and UI tests.

Uses Pillow, an encoder independent of the plugin's own, so the tests check
the plugin against files it did not write. Run: python3 scripts/make-fixtures.py
"""
import base64
import json
import shutil
from pathlib import Path

from PIL import Image, PngImagePlugin

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test" / "fixtures"
# The UI tests open this vault in Obsidian; it gets a copy of every fixture.
VAULT_IMAGES = ROOT / "test" / "vaults" / "simple" / "images"


def gradient(size=64):
    img = Image.new("RGB", (size, size))
    img.putdata([(x * 4, y * 4, 160) for y in range(size) for x in range(size)])
    return img


def b64json(obj):
    return base64.b64encode(json.dumps(obj, ensure_ascii=False).encode("utf-8")).decode("ascii")


def save(name, info=None):
    gradient().save(OUT / name, pnginfo=info)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    save("plain.png")

    info = PngImagePlugin.PngInfo()
    info.add_text("Title", "Sample image")
    info.add_text("Comment", "Stored compressed in zTXt", zip=True)
    info.add_itxt("Description", "Unicode text: café, naïve, 日本語", lang="en", tkey="Beschreibung")
    info.add_itxt("Compressed", "Compressed international text: ünïcödé", zip=True)
    save("text-chunks.png", info)

    card_data = {
        "name": "Test Character",
        "description": "A fictional character made for the plugin's tests.",
        "personality": "Curious and helpful",
        "scenario": "Inside an Obsidian vault",
        "first_mes": "Hello! I only exist in test fixtures.",
        "mes_example": "<START>\n{{user}}: Hi\n{{char}}: Hello!",
        "creator_notes": "",
        "system_prompt": "",
        "post_history_instructions": "",
        "alternate_greetings": ["Hi there.", "Greetings, traveller."],
        "tags": ["test"],
        "creator": "png-metadata-editor tests",
        "character_version": "1.0",
        "extensions": {},
    }
    v2 = {"spec": "chara_card_v2", "spec_version": "2.0", "data": card_data}
    v3 = {
        "spec": "chara_card_v3",
        "spec_version": "3.0",
        "data": {**card_data, "group_only_greetings": [], "assets": []},
    }
    info = PngImagePlugin.PngInfo()
    info.add_text("chara", b64json(v2))
    info.add_text("ccv3", b64json(v3))
    save("sillytavern-card.png", info)

    # V2 only (no ccv3), with a lorebook and extension data the editor must keep.
    v2_only = {
        "spec": "chara_card_v2",
        "spec_version": "2.0",
        "data": {
            **card_data,
            "name": "Zoë 🌸",
            "extensions": {"talkativeness": "0.5", "custom_tool": {"keep": True}},
            "character_book": {
                "name": "Test lore",
                "entries": [
                    {"keys": ["vault"], "content": "A vault is a folder of notes.", "id": 0},
                    {"keys": ["plugin"], "content": "Plugins extend Obsidian.", "id": 1},
                ],
            },
        },
    }
    info = PngImagePlugin.PngInfo()
    info.add_text("chara", b64json(v2_only))
    save("card-v2-only.png", info)

    # Old V1 format: fields at the top level, no spec.
    v1 = {k: card_data[k] for k in ("name", "description", "personality", "scenario", "first_mes", "mes_example")}
    v1["name"] = "Old Format Character"
    info = PngImagePlugin.PngInfo()
    info.add_text("chara", b64json(v1))
    save("card-v1.png", info)

    # A chara field that is not valid base64 JSON.
    info = PngImagePlugin.PngInfo()
    info.add_text("chara", "this is not a card")
    save("card-broken.png", info)

    VAULT_IMAGES.mkdir(parents=True, exist_ok=True)
    for png in OUT.glob("*.png"):
        shutil.copy(png, VAULT_IMAGES / png.name)


if __name__ == "__main__":
    main()
