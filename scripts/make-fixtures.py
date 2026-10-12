"""Generate the PNG fixtures used by the unit and UI tests.

Uses Pillow, an encoder independent of the plugin's own, so the tests check
the plugin against files it did not write. Run: python3 scripts/make-fixtures.py
"""
import base64
import json
import shutil
import struct
import zlib
from pathlib import Path

from PIL import ExifTags, Image, ImageCms, PngImagePlugin
from PIL.TiffImagePlugin import IFDRational as R

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


def insert_chunks(path, chunks, before="IDAT"):
    """Add raw chunks to a PNG just before the first `before` chunk (Pillow can't write these)."""
    data = path.read_bytes()
    pos = 8
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        if data[pos + 4 : pos + 8] == before.encode():
            break
        pos += 12 + length
    raw = b""
    for ctype, body in chunks:
        ctype = ctype.encode()
        raw += struct.pack(">I", len(body)) + ctype + body + struct.pack(">I", zlib.crc32(ctype + body))
    path.write_bytes(data[:pos] + raw + data[pos:])


def camera_exif(endian=">"):
    exif = Image.Exif()
    exif.endian = endian
    exif[ExifTags.Base.Make] = "Canon"
    exif[ExifTags.Base.Model] = "EOS R5"
    exif[ExifTags.Base.Software] = "png-metadata-editor tests"
    exif[ExifTags.Base.DateTime] = "2026:10:11 14:30:00"
    exif[ExifTags.Base.Orientation] = 1
    exif[ExifTags.Base.Artist] = "Test Photographer"
    exif[ExifTags.Base.Copyright] = "CC0"
    exif[ExifTags.Base.ImageDescription] = "A gradient pretending to be a photo"
    sub = exif.get_ifd(ExifTags.IFD.Exif)
    sub[ExifTags.Base.DateTimeOriginal] = "2026:10:11 14:29:59"
    sub[ExifTags.Base.ExposureTime] = R(1, 250)
    sub[ExifTags.Base.FNumber] = R(28, 10)
    sub[ExifTags.Base.ISOSpeedRatings] = 200
    sub[ExifTags.Base.FocalLength] = R(50, 1)
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    gps[ExifTags.GPS.GPSLatitudeRef] = "N"
    gps[ExifTags.GPS.GPSLatitude] = (R(40, 1), R(42, 1), R(4608, 100))
    gps[ExifTags.GPS.GPSLongitudeRef] = "W"
    gps[ExifTags.GPS.GPSLongitude] = (R(74, 1), R(0, 1), R(2160, 100))
    return exif


XMP = """<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmp:CreatorTool="png-metadata-editor tests"
    xmp:CreateDate="2026-10-11T14:29:59">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Gradient study</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>Test Photographer</rdf:li></rdf:Seq></dc:creator>
   <dc:subject><rdf:Bag><rdf:li>test</rdf:li><rdf:li>gradient</rdf:li></rdf:Bag></dc:subject>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>"""


def imagemagick_raw_profile(payload):
    """ImageMagick's "Raw profile type exif" text: a header, the length, then hex lines."""
    hexed = payload.hex()
    lines = [hexed[i : i + 72] for i in range(0, len(hexed), 72)]
    return "\nexif\n" + f"{len(payload):8d}\n" + "\n".join(lines) + "\n"


def write_exif_reference(png, out):
    with Image.open(png) as img:
        exif = img.getexif()
        groups = {
            "Image": dict(exif),
            "Photo": dict(exif.get_ifd(ExifTags.IFD.Exif)),
            "GPS": dict(exif.get_ifd(ExifTags.IFD.GPSInfo)),
        }
    ref = {}
    for group, tags in groups.items():
        names = ExifTags.GPSTAGS if group == "GPS" else ExifTags.TAGS
        for tag, value in tags.items():
            if tag in (ExifTags.IFD.Exif, ExifTags.IFD.GPSInfo):
                continue
            if isinstance(value, tuple):
                value = [float(v) for v in value]
            elif not isinstance(value, (str, int)):
                value = float(value)
            ref[f"{group}:{names[tag]}"] = value
    out.write_text(json.dumps(ref, indent=2, sort_keys=True) + "\n")


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

    # A "photo" with the standard metadata a camera or editor would write.
    info = PngImagePlugin.PngInfo()
    info.add_itxt("XML:com.adobe.xmp", XMP)
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    gradient().save(OUT / "photo.png", pnginfo=info, exif=camera_exif(), dpi=(300, 300), icc_profile=icc)
    insert_chunks(
        OUT / "photo.png",
        [
            ("tIME", struct.pack(">HBBBBB", 2026, 10, 11, 14, 30, 0)),
            ("gAMA", struct.pack(">I", 45455)),
        ],
    )

    # Little-endian EXIF, as some cameras and tools write it.
    gradient().save(OUT / "photo-le.png", exif=camera_exif("<"))

    # EXIF stored the ImageMagick way, as hex in a "Raw profile type exif" text chunk.
    info = PngImagePlugin.PngInfo()
    info.add_text("Raw profile type exif", imagemagick_raw_profile(camera_exif().tobytes()), zip=True)
    save("imagemagick-exif.png", info)

    # What Pillow reads back from photo.png, so the unit tests can compare our EXIF decoder with it.
    write_exif_reference(OUT / "photo.png", OUT / "photo.exif.json")

    VAULT_IMAGES.mkdir(parents=True, exist_ok=True)
    for png in OUT.glob("*.png"):
        shutil.copy(png, VAULT_IMAGES / png.name)


if __name__ == "__main__":
    main()
