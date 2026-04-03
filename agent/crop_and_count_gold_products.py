#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_INPUT = SCRIPT_DIR / "20260403_131258.frame.png"


@dataclass
class ProductBox:
    side: str
    order: int
    x: int
    y: int
    width: int
    height: int
    area: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Crop the top-view tray image and count products using a binary mask."
    )
    parser.add_argument(
        "--image",
        type=Path,
        default=DEFAULT_INPUT,
        help="Input top-view PNG. Defaults to 20260403_131258.frame.png in the agent folder.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=SCRIPT_DIR,
        help="Directory for the crop, mask, overlay, and JSON outputs.",
    )
    parser.add_argument(
        "--prefix",
        default=None,
        help="Optional output prefix. Defaults to the input stem.",
    )
    return parser.parse_args()


def resolve_path(path: Path, base: Path) -> Path:
    return path if path.is_absolute() else (base / path).resolve()


def crop_image(image: np.ndarray) -> np.ndarray:
    # The frame image is already tight, so only trim the outer glass edge slightly.
    inset_left = 8
    inset_top = 6
    inset_right = 8
    inset_bottom = 6
    return image[
        inset_top : image.shape[0] - inset_bottom,
        inset_left : image.shape[1] - inset_right,
    ]


def threshold_gold(image: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    core_mask = cv2.inRange(
        hsv,
        np.array((8, 30, 70), dtype=np.uint8),
        np.array((40, 255, 255), dtype=np.uint8),
    )
    core_mask = cv2.morphologyEx(
        core_mask,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
    )
    band_mask = cv2.morphologyEx(
        core_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (17, 5)),
    )
    fill_mask = cv2.inRange(
        hsv,
        np.array((5, 18, 60), dtype=np.uint8),
        np.array((45, 255, 255), dtype=np.uint8),
    )
    fill_mask = cv2.morphologyEx(
        fill_mask,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
    )
    fill_mask = cv2.morphologyEx(
        fill_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (9, 3)),
    )
    return core_mask, band_mask, fill_mask


def find_row_peaks(row_profile: np.ndarray, window: int, min_distance: int) -> list[int]:
    smoothed = np.convolve(row_profile, np.ones(window) / window, mode="same")
    threshold = max(0.05, float(smoothed.mean() + 0.17 * (smoothed.max() - smoothed.mean())))
    peaks: list[int] = []
    for index in range(1, len(smoothed) - 1):
        if smoothed[index] < threshold:
            continue
        if smoothed[index] < smoothed[index - 1] or smoothed[index] <= smoothed[index + 1]:
            continue
        if peaks and index - peaks[-1] < min_distance:
            if smoothed[index] > smoothed[peaks[-1]]:
                peaks[-1] = index
            continue
        peaks.append(index)
    return peaks


def choose_component(
    labels: np.ndarray,
    stats: np.ndarray,
    band_top: int,
    peak_y: int,
    side: str,
    band_width: int,
) -> int | None:
    best_index: int | None = None
    best_score: float | None = None

    for component_index in range(1, len(stats)):
        x, y, width, height, area = stats[component_index]
        aspect_ratio = width / max(height, 1)
        if area < 1200 or width < 120 or height < 10 or height > 180 or aspect_ratio < 2.5:
            continue

        center_y = band_top + y + (height / 2.0)
        edge_penalty = 0.0
        if side == "left" and x > 250:
            edge_penalty += (x - 250) * 2.0
        if side == "right" and x + width < band_width - 250:
            edge_penalty += ((band_width - 250) - (x + width)) * 2.0

        score = float(area) - (abs(center_y - peak_y) * 25.0) - edge_penalty
        if best_score is None or score > best_score:
            best_score = score
            best_index = component_index

    return best_index


def clean_band_mask(band_mask: np.ndarray) -> np.ndarray:
    component_count, labels, stats, _ = cv2.connectedComponentsWithStats(band_mask)
    cleaned_mask = np.zeros_like(band_mask)
    for component_index in range(1, component_count):
        _, _, width, height, area = stats[component_index]
        aspect_ratio = width / max(height, 1)
        if area >= 50 and width >= 20 and aspect_ratio >= 1.2:
            cleaned_mask[labels == component_index] = 255
    cleaned_mask = cv2.morphologyEx(
        cleaned_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (15, 3)),
    )
    return cleaned_mask


def bbox_from_mask(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(mask > 0)
    if xs.size == 0 or ys.size == 0:
        return None
    min_x = int(xs.min())
    min_y = int(ys.min())
    width = int(xs.max() - xs.min() + 1)
    height = int(ys.max() - ys.min() + 1)
    return min_x, min_y, width, height


def extract_products(image: np.ndarray) -> tuple[np.ndarray, list[ProductBox]]:
    core_mask, band_mask, fill_mask = threshold_gold(image)
    height, width = image.shape[:2]
    midpoint = width // 2

    selections: list[ProductBox] = []
    product_mask = np.zeros((height, width), dtype=np.uint8)

    side_regions = [
        ("left", 0, midpoint - 20),
        ("right", midpoint + 20, width),
    ]

    for side, x_start, x_end in side_regions:
        side_core = core_mask[:, x_start:x_end]
        side_band = band_mask[:, x_start:x_end]
        row_profile = (side_core > 0).mean(axis=1)
        peaks = find_row_peaks(row_profile, window=11, min_distance=45)
        band_edges = [0]
        band_edges.extend((peaks[index - 1] + peaks[index]) // 2 for index in range(1, len(peaks)))
        band_edges.append(height - 1)

        for order, peak_y in enumerate(peaks, start=1):
            band_top = band_edges[order - 1]
            band_bottom = band_edges[order]
            band = side_band[band_top : band_bottom + 1, :]
            component_count, labels, stats, _ = cv2.connectedComponentsWithStats(band)
            if component_count <= 1:
                continue

            selected_index = choose_component(
                labels=labels,
                stats=stats,
                band_top=band_top,
                peak_y=peak_y,
                side=side,
                band_width=x_end - x_start,
            )
            if selected_index is None:
                continue

            x, y, component_width, component_height, area = stats[selected_index]
            band_fill_mask = clean_band_mask(fill_mask[band_top : band_bottom + 1, x_start:x_end])
            product_mask[band_top : band_bottom + 1, x_start:x_end] = np.maximum(
                product_mask[band_top : band_bottom + 1, x_start:x_end],
                band_fill_mask,
            )

            local_bbox = bbox_from_mask(band_fill_mask)
            if local_bbox is None:
                continue
            local_x, local_y, local_width, local_height = local_bbox
            selections.append(
                ProductBox(
                    side=side,
                    order=order,
                    x=int(x_start + local_x),
                    y=int(band_top + local_y),
                    width=int(local_width),
                    height=int(local_height),
                    area=int(area),
                )
            )

    return product_mask, selections


def render_overlay(image: np.ndarray, selections: list[ProductBox]) -> np.ndarray:
    overlay = image.copy()
    for label_index, selection in enumerate(selections, start=1):
        top_left = (selection.x, selection.y)
        bottom_right = (selection.x + selection.width, selection.y + selection.height)
        cv2.rectangle(overlay, top_left, bottom_right, (0, 255, 255), 3)
        cv2.putText(
            overlay,
            str(label_index),
            (selection.x + 6, selection.y + 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 0, 255),
            2,
            cv2.LINE_AA,
        )
    cv2.putText(
        overlay,
        f"Count: {len(selections)}",
        (24, 42),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.1,
        (0, 0, 255),
        3,
        cv2.LINE_AA,
    )
    return overlay


def write_outputs(
    image_path: Path,
    output_dir: Path,
    prefix: str,
    crop: np.ndarray,
    mask: np.ndarray,
    overlay: np.ndarray,
    selections: list[ProductBox],
) -> None:
    crop_path = output_dir / f"{prefix}.products.crop.png"
    mask_path = output_dir / f"{prefix}.products.mask.png"
    overlay_path = output_dir / f"{prefix}.products.overlay.png"
    json_path = output_dir / f"{prefix}.products.json"

    cv2.imwrite(str(crop_path), crop)
    cv2.imwrite(str(mask_path), mask)
    cv2.imwrite(str(overlay_path), overlay)
    json_path.write_text(
        json.dumps(
            {
                "image": str(image_path),
                "crop_png": str(crop_path),
                "mask_png": str(mask_path),
                "overlay_png": str(overlay_path),
                "count": len(selections),
                "products": [
                    {
                        "side": selection.side,
                        "order": selection.order,
                        "x": selection.x,
                        "y": selection.y,
                        "width": selection.width,
                        "height": selection.height,
                        "area": selection.area,
                    }
                    for selection in selections
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Crop PNG: {crop_path}")
    print(f"Mask PNG: {mask_path}")
    print(f"Overlay PNG: {overlay_path}")
    print(f"Metadata JSON: {json_path}")
    print(f"Count: {len(selections)}")


def main() -> int:
    args = parse_args()
    image_path = resolve_path(args.image, SCRIPT_DIR)
    output_dir = resolve_path(args.output_dir, SCRIPT_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    image = cv2.imread(str(image_path))
    if image is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")

    crop = crop_image(image)
    product_mask, selections = extract_products(crop)
    overlay = render_overlay(crop, selections)
    prefix = args.prefix or image_path.stem

    write_outputs(
        image_path=image_path,
        output_dir=output_dir,
        prefix=prefix,
        crop=crop,
        mask=product_mask,
        overlay=overlay,
        selections=selections,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
