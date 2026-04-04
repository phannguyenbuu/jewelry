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
class ProductQuad:
    side: str
    order: int
    area: int
    corners: list[list[float]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Detect jewelry products as oriented quadrilaterals in the tray frame."
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
        help="Directory for overlay and JSON outputs.",
    )
    parser.add_argument(
        "--prefix",
        default=None,
        help="Optional output prefix. Defaults to the input stem.",
    )
    return parser.parse_args()


def resolve_path(path: Path, base: Path) -> Path:
    return path if path.is_absolute() else (base / path).resolve()


def threshold_gold(image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
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
    core_mask = cv2.morphologyEx(
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
    return core_mask, fill_mask


def find_row_peaks(row_profile: np.ndarray, window: int = 11, min_distance: int = 45) -> list[int]:
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


def order_quad(points: np.ndarray) -> np.ndarray:
    points = np.asarray(points, dtype=np.float32)
    x_sorted = points[np.argsort(points[:, 0])]
    left_pair = x_sorted[:2]
    right_pair = x_sorted[2:]

    left_pair = left_pair[np.argsort(left_pair[:, 1])]
    top_left, bottom_left = left_pair

    right_pair = right_pair[np.argsort(right_pair[:, 1])]
    top_right, bottom_right = right_pair

    return np.array([top_left, top_right, bottom_right, bottom_left], dtype=np.float32)


def quad_is_valid(quad: np.ndarray) -> bool:
    rounded = {tuple(np.round(point, 1)) for point in quad}
    if len(rounded) < 4:
        return False
    area = cv2.contourArea(quad.astype(np.float32).reshape((-1, 1, 2)))
    return area > 500.0


def simplify_to_quad(points: np.ndarray) -> np.ndarray:
    hull = cv2.convexHull(points.astype(np.float32))
    perimeter = cv2.arcLength(hull, True)

    for epsilon_ratio in (0.01, 0.015, 0.02, 0.03, 0.04, 0.05):
        approx = cv2.approxPolyDP(hull, epsilon_ratio * perimeter, True)
        if len(approx) == 4:
            quad = order_quad(approx.reshape(-1, 2))
            if quad_is_valid(quad):
                return quad

    rect = cv2.minAreaRect(hull)
    return order_quad(cv2.boxPoints(rect))


def build_product_mask(
    selected_component: np.ndarray,
    fill_mask: np.ndarray,
    region_top: int,
    region_left: int,
) -> np.ndarray:
    dilated_component = cv2.dilate(
        selected_component,
        cv2.getStructuringElement(cv2.MORPH_RECT, (25, 9)),
    )
    component_count, labels, stats, _ = cv2.connectedComponentsWithStats(fill_mask)
    product_mask = np.zeros_like(fill_mask)
    for component_index in range(1, component_count):
        _, _, _, _, area = stats[component_index]
        if area < 40:
            continue
        component = labels == component_index
        if np.any(dilated_component[component]):
            product_mask[component] = 255

    product_mask = cv2.morphologyEx(
        product_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (11, 3)),
    )
    return product_mask


def detect_quads(image: np.ndarray) -> tuple[np.ndarray, list[ProductQuad]]:
    core_mask, fill_mask = threshold_gold(image)
    height, width = image.shape[:2]
    midpoint = width // 2

    overlay = image.copy()
    product_quads: list[ProductQuad] = []
    label_index = 1

    side_regions = [
        ("left", 0, midpoint - 20),
        ("right", midpoint + 20, width),
    ]

    for side, x_start, x_end in side_regions:
        side_core = core_mask[:, x_start:x_end]
        row_profile = (side_core > 0).mean(axis=1)
        peaks = find_row_peaks(row_profile)
        band_edges = [0]
        band_edges.extend((peaks[index - 1] + peaks[index]) // 2 for index in range(1, len(peaks)))
        band_edges.append(height - 1)

        for order, peak_y in enumerate(peaks, start=1):
            band_top = band_edges[order - 1]
            band_bottom = band_edges[order]
            side_band = side_core[band_top : band_bottom + 1, :]
            component_count, labels, stats, _ = cv2.connectedComponentsWithStats(side_band)
            if component_count <= 1:
                continue

            selected_index = choose_component(
                stats=stats,
                band_top=band_top,
                peak_y=peak_y,
                side=side,
                band_width=x_end - x_start,
            )
            if selected_index is None:
                continue

            x, y, component_width, component_height, area = stats[selected_index]
            region_left = max(x_start, x_start + x - 24)
            region_right = min(x_end, x_start + x + component_width + 24)
            region_top = max(band_top, band_top + y - 10)
            region_bottom = min(height, band_top + y + component_height + 10)

            selected_component = np.zeros(
                (region_bottom - region_top, region_right - region_left),
                dtype=np.uint8,
            )
            local_component = labels[y : y + component_height, x : x + component_width] == selected_index
            insert_y = band_top + y - region_top
            insert_x = x_start + x - region_left
            selected_component[
                insert_y : insert_y + component_height,
                insert_x : insert_x + component_width,
            ][local_component] = 255

            local_fill = fill_mask[region_top:region_bottom, region_left:region_right]
            product_mask = build_product_mask(
                selected_component=selected_component,
                fill_mask=local_fill,
                region_top=region_top,
                region_left=region_left,
            )

            points = np.column_stack(np.where(product_mask > 0))
            if len(points) < 20:
                continue
            points = points[:, ::-1].astype(np.float32)
            points[:, 0] += region_left
            points[:, 1] += region_top
            quad = simplify_to_quad(points)
            product_quads.append(
                ProductQuad(
                    side=side,
                    order=order,
                    area=int(area),
                    corners=[[float(xv), float(yv)] for xv, yv in quad],
                )
            )

            polygon = quad.astype(np.int32).reshape((-1, 1, 2))
            cv2.polylines(overlay, [polygon], True, (0, 255, 255), 3)
            anchor = tuple(quad[0].astype(np.int32))
            cv2.putText(
                overlay,
                str(label_index),
                (anchor[0] + 6, anchor[1] + 24),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 0, 255),
                2,
                cv2.LINE_AA,
            )
            label_index += 1

    return overlay, product_quads


def write_outputs(
    image_path: Path,
    output_dir: Path,
    prefix: str,
    overlay: np.ndarray,
    product_quads: list[ProductQuad],
) -> None:
    overlay_path = output_dir / f"{prefix}.product-quads.overlay.png"
    json_path = output_dir / f"{prefix}.product-quads.json"

    cv2.imwrite(str(overlay_path), overlay)
    json_path.write_text(
        json.dumps(
            {
                "image": str(image_path),
                "overlay_png": str(overlay_path),
                "count": len(product_quads),
                "products": [
                    {
                        "side": quad.side,
                        "order": quad.order,
                        "area": quad.area,
                        "corners": quad.corners,
                    }
                    for quad in product_quads
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Overlay PNG: {overlay_path}")
    print(f"Metadata JSON: {json_path}")
    print(f"Count: {len(product_quads)}")


def main() -> int:
    args = parse_args()
    image_path = resolve_path(args.image, SCRIPT_DIR)
    output_dir = resolve_path(args.output_dir, SCRIPT_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    image = cv2.imread(str(image_path))
    if image is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")

    overlay, product_quads = detect_quads(image)
    prefix = args.prefix or image_path.stem
    write_outputs(
        image_path=image_path,
        output_dir=output_dir,
        prefix=prefix,
        overlay=overlay,
        product_quads=product_quads,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
