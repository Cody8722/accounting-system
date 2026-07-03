#!/usr/bin/env python3
"""
前端 JS 簡易壓縮腳本
用途：移除單行/多行註解、多餘空白，生成 js-dist/ 壓縮版本
使用：python minify.py

壓縮後的檔案放在 js-dist/，index.html 可選擇使用壓縮版
注意：不改變原始 js-refactored/ 目錄
"""

import os
import re
import shutil
from pathlib import Path

SRC_DIR = Path(__file__).parent / "js-refactored"
OUT_DIR = Path(__file__).parent / "js-dist"


def minify_js(source: str) -> str:
    # 1. 移除多行註解 /* ... */（非貪婪）
    source = re.sub(r"/\*[\s\S]*?\*/", "", source)
    # 2. 移除單行註解 // ...（但保留 URL 中的 https://）
    source = re.sub(r'(?<![\'":])//[^\n]*', "", source)
    # 3. 移除行首/行尾空白
    lines = [line.strip() for line in source.splitlines()]
    # 4. 移除空行
    lines = [line for line in lines if line]
    return "\n".join(lines)


def main():
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    total_before = 0
    total_after = 0

    for js_file in sorted(SRC_DIR.glob("*.js")):
        original = js_file.read_text(encoding="utf-8")
        minified = minify_js(original)

        out_file = OUT_DIR / js_file.name
        out_file.write_text(minified, encoding="utf-8")

        before = len(original.encode("utf-8"))
        after = len(minified.encode("utf-8"))
        total_before += before
        total_after += after

        pct = (1 - after / before) * 100 if before > 0 else 0
        print(f"  {js_file.name:35s} {before:>7,} → {after:>7,} bytes  (-{pct:.0f}%)")

    print(f"\n  總計: {total_before:,} → {total_after:,} bytes  "
          f"(-{(1 - total_after/total_before)*100:.0f}%)")
    print(f"\n  壓縮檔案已輸出至: {OUT_DIR}")


if __name__ == "__main__":
    main()
