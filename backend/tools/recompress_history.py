"""Re-store History images saved as PNG as lossless WebP, with the same pixels; new images are WebP already.

    uv run python backend/tools/recompress_history.py --dry-run
    uv run python backend/tools/recompress_history.py

Stop the web app first, so nothing writes to history.db meanwhile. A copy is kept as history.db.bak (unless
--no-backup); delete it once you are happy. Each image is converted on its own, so stopping and running again is safe.
"""
import sys
import argparse
from pathlib import Path

# The backend modules sit one folder up, in backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import history_store  # noqa: E402

MB = 1_000_000


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="only report how many PNG images there are")
    parser.add_argument("--limit", type=int, help="convert at most this many images")
    parser.add_argument("--no-backup", action="store_true", help="skip the history.db.bak copy")
    return parser.parse_args(argv)


def backup_path() -> Path:
    return history_store.DB_PATH.with_name(f"{history_store.DB_PATH.name}.bak")


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    ids = history_store.png_image_ids()[: args.limit]
    print(f"{len(ids)} image(s) stored as PNG in {history_store.DB_PATH} ({history_store.DB_PATH.stat().st_size / MB:.1f} MB).")
    if args.dry_run or not ids:
        return 0
    if not args.no_backup:
        history_store.backup(backup_path())
        print(f"Backup: {backup_path()}")
    saved = [history_store.store_as_webp(item_id) for item_id in ids]
    history_store.compact()
    converted = sum(1 for bytes_saved in saved if bytes_saved > 0)
    print(f"Converted {converted}, kept {len(ids) - converted} as PNG; {sum(saved) / MB:.1f} MB saved.")
    print(f"history.db is now {history_store.DB_PATH.stat().st_size / MB:.1f} MB.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
