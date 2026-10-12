"""Check every PNG the unit tests wrote with Pillow, an independent decoder.

For each test/output/NAME.png, NAME.png.expected.json lists the text chunks
Pillow must find. The image itself must also decode fully.
"""
import json
import sys
from pathlib import Path

from PIL import Image

OUTPUT = Path(__file__).resolve().parent.parent / "test" / "output"


def main():
    files = sorted(OUTPUT.glob("*.png"))
    if not files:
        print(f"No PNGs found in {OUTPUT}; run the unit tests first.")
        return 1
    failures = 0
    for path in files:
        expected = json.loads(Path(f"{path}.expected.json").read_text(encoding="utf-8"))
        try:
            with Image.open(path) as img:
                img.load()  # decodes the image data and verifies chunk checksums
                text = dict(img.text)
        except Exception as e:  # noqa: BLE001
            print(f"FAIL {path.name}: {e}")
            failures += 1
            continue
        if text != expected:
            print(f"FAIL {path.name}: text mismatch\n  expected {expected}\n  got      {text}")
            failures += 1
        else:
            print(f"ok   {path.name}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
