#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_INPUT = SCRIPT_DIR / "20260403_131258.frame.png"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Segment white regions from a normalized jewelry tray frame."
    )
    parser.add_argument(
        "--image",
        type=Path,
        default=DEFAULT_INPUT,
        help="Input frame PNG. Defaults to 20260403_131258.frame.png in the agent folder.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=SCRIPT_DIR,
        help="Directory for the mask outputs.",
    )
    parser.add_argument(
        "--prefix",
        default=None,
        help="Optional output prefix. Defaults to the input stem.",
    )
    return parser.parse_args()


def resolve_path(path: Path, base: Path) -> Path:
    return path if path.is_absolute() else (base / path).resolve()


def remove_small_components(mask: np.ndarray, min_area: int) -> np.ndarray:
    component_count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    cleaned_mask = np.zeros_like(mask)
    for component_index in range(1, component_count):
        _, _, _, _, area = stats[component_index]
        if area >= min_area:
            cleaned_mask[labels == component_index] = 255
    return cleaned_mask


def segment_white_regions(image: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    saturation = hsv[:, :, 1]
    lightness = lab[:, :, 0]
    a_channel = lab[:, :, 1].astype(np.float32)
    b_channel = lab[:, :, 2].astype(np.float32)

    # Normalize local contrast so darker white areas near the bottom tray
    # are treated more consistently with the brighter upper area.
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    normalized_lightness = clahe.apply(lightness)
    chroma_distance = np.sqrt((a_channel - 128.0) ** 2 + (b_channel - 128.0) ** 2)

    # White tray/background is low-saturation and close to neutral. The
    # combined rule keeps the brighter tray while recovering dimmer white
    # regions in the lower part of the frame.
    bright_low_saturation = (saturation <= 70) & (normalized_lightness >= 138)
    neutral_white = (chroma_distance <= 18.0) & (normalized_lightness >= 132)
    white_mask = np.where(
        bright_low_saturation | neutral_white,
        255,
        0,
    ).astype(np.uint8)

    # Extend the white background only near the top/bottom cut corners using a
    # softer neutral rule. This avoids treating those clipped edge regions as
    # dark/color content in the final masks.
    soft_neutral = ((saturation <= 95) & (normalized_lightness >= 110)) | (
        (chroma_distance <= 24.0) & (normalized_lightness >= 108)
    )
    border_zone = np.zeros_like(white_mask)
    border_zone[:170, :] = 255
    border_zone[-220:, :] = 255
    border_fill = np.where(soft_neutral, 255, 0).astype(np.uint8)
    border_fill = cv2.bitwise_and(border_fill, border_zone)
    white_mask = cv2.bitwise_or(white_mask, border_fill)

    white_mask = cv2.morphologyEx(
        white_mask,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
    )
    white_mask = cv2.morphologyEx(
        white_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)),
    )
    white_mask = remove_small_components(white_mask, min_area=60)
    return white_mask


def render_overlay(image: np.ndarray, white_mask: np.ndarray) -> np.ndarray:
    overlay = image.copy()
    tint = np.zeros_like(image)
    tint[:, :] = (255, 255, 0)
    white_region = white_mask > 0
    overlay[white_region] = cv2.addWeighted(
        image[white_region], 0.35, tint[white_region], 0.65, 0
    )
    return overlay


def main() -> int:
    args = parse_args()
    image_path = resolve_path(args.image, SCRIPT_DIR)
    output_dir = resolve_path(args.output_dir, SCRIPT_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    image = cv2.imread(str(image_path))
    if image is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")

    white_mask = segment_white_regions(image)
    color_mask = cv2.bitwise_not(white_mask)
    overlay = render_overlay(image, white_mask)

    prefix = args.prefix or image_path.stem
    white_mask_path = output_dir / f"{prefix}.white-mask.png"
    color_mask_path = output_dir / f"{prefix}.color-mask.png"
    overlay_path = output_dir / f"{prefix}.white-overlay.png"
    json_path = output_dir / f"{prefix}.white-mask.json"

    cv2.imwrite(str(white_mask_path), white_mask)
    cv2.imwrite(str(color_mask_path), color_mask)
    cv2.imwrite(str(overlay_path), overlay)
    json_path.write_text(
        json.dumps(
            {
                "image": str(image_path),
                "white_mask_png": str(white_mask_path),
                "color_mask_png": str(color_mask_path),
                "overlay_png": str(overlay_path),
                "white_pixels": int((white_mask > 0).sum()),
                "color_pixels": int((color_mask > 0).sum()),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"White mask: {white_mask_path}")
    print(f"Color mask: {color_mask_path}")
    print(f"Overlay: {overlay_path}")
    print(f"Metadata JSON: {json_path}")
    print(f"White pixels: {int((white_mask > 0).sum())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
