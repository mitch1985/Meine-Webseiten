import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError as error:
    raise SystemExit("Install image optimization dependencies with: python -m pip install -r requirements.txt") from error


def optimize_image(path):
    original_size = path.stat().st_size
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source)
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")

        if max(image.size) <= 1600 and original_size <= 50_000:
            return 0

        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        image.save(path, format="JPEG", quality=82, optimize=True, progressive=True)
    return original_size - path.stat().st_size


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: optimize-media.py <generated-media-directory>")

    media_root = Path(sys.argv[1]).resolve()
    before = 0
    after = 0
    optimized = 0
    for path in media_root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in (".jpg", ".jpeg"):
            continue
        before += path.stat().st_size
        optimized += bool(optimize_image(path))
        after += path.stat().st_size

    print(
        f"Optimized {optimized} JPEG images: "
        f"{before / 1_000_000:.1f} MB -> {after / 1_000_000:.1f} MB."
    )


if __name__ == "__main__":
    main()
