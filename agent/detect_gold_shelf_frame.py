#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IMAGE = REPO_ROOT / "20260403_131258.jpg"
DEFAULT_OUTPUT = Path(__file__).resolve().parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Detect the main gold shelf frame from a jewelry display photo."
    )
    parser.add_argument(
        "--image",
        type=Path,
        default=DEFAULT_IMAGE,
        help="Input image path. Defaults to 20260403_131258.jpg at the repo root.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Directory for the PNG and JSON outputs.",
    )
    parser.add_argument(
        "--prefix",
        default=None,
        help="Optional output filename prefix. Defaults to the input stem.",
    )
    return parser.parse_args()


def order_quad(points: np.ndarray) -> np.ndarray:
    pts = np.asarray(points, dtype=np.float32)
    sums = pts.sum(axis=1)
    diffs = np.diff(pts, axis=1).reshape(-1)
    top_left = pts[np.argmin(sums)]
    bottom_right = pts[np.argmax(sums)]
    top_right = pts[np.argmin(diffs)]
    bottom_left = pts[np.argmax(diffs)]
    return np.array([top_left, top_right, bottom_right, bottom_left], dtype=np.float32)


def clip_quad(quad: np.ndarray, width: int, height: int) -> np.ndarray:
    clipped = quad.copy()
    clipped[:, 0] = np.clip(clipped[:, 0], 0, width - 1)
    clipped[:, 1] = np.clip(clipped[:, 1], 0, height - 1)
    return clipped


def detect_projective_quad(contour: np.ndarray) -> np.ndarray | None:
    hull = cv2.convexHull(contour)
    perimeter = cv2.arcLength(hull, True)
    for epsilon_ratio in (0.015, 0.02, 0.03, 0.04, 0.05):
        approx = cv2.approxPolyDP(hull, epsilon_ratio * perimeter, True)
        if len(approx) == 4:
            return order_quad(approx.reshape(-1, 2))
    return None


def detect_gold_shelf_quad(image: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Gold jewelry in this setup sits on a bright white tray. Connecting the
    # gold rows first gives a cleaner tray footprint than edge detection alone.
    gold_mask = cv2.inRange(
        hsv,
        np.array((5, 40, 60), dtype=np.uint8),
        np.array((45, 255, 255), dtype=np.uint8),
    )
    connected = cv2.morphologyEx(
        gold_mask,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (81, 101)),
    )
    connected = cv2.morphologyEx(
        connected,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15)),
    )

    count, labels, stats, _ = cv2.connectedComponentsWithStats(connected)
    if count <= 1:
        raise RuntimeError("No connected components found for the gold shelf.")

    height, width = image.shape[:2]
    frame_index = None
    best_score = None
    for index in range(1, count):
        x, y, w, h, area = stats[index]
        if area < 800_000:
            continue
        if w < width * 0.35 or h < height * 0.65:
            continue
        center_x = x + (w / 2.0)
        center_penalty = abs(center_x - (width / 2.0)) / (width / 2.0)
        score = float(area) - (center_penalty * 300_000.0)
        if best_score is None or score > best_score:
            best_score = score
            frame_index = index

    if frame_index is None:
        raise RuntimeError("Could not find a suitable gold shelf component.")

    component_mask = np.zeros_like(connected)
    component_mask[labels == frame_index] = 255
    contours, _ = cv2.findContours(
        component_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if not contours:
        raise RuntimeError("Could not recover a contour from the gold shelf mask.")

    contour = max(contours, key=cv2.contourArea)
    quad = detect_projective_quad(contour)
    if quad is not None:
        return clip_quad(quad, width, height)

    rect = cv2.minAreaRect(contour)
    quad = order_quad(cv2.boxPoints(rect))
    return clip_quad(quad, width, height)


def warp_quad(image: np.ndarray, quad: np.ndarray) -> np.ndarray:
    top_left, top_right, bottom_right, bottom_left = quad
    width_top = np.linalg.norm(top_right - top_left)
    width_bottom = np.linalg.norm(bottom_right - bottom_left)
    height_left = np.linalg.norm(bottom_left - top_left)
    height_right = np.linalg.norm(bottom_right - top_right)

    out_width = max(1, int(round(max(width_top, width_bottom))))
    out_height = max(1, int(round(max(height_left, height_right))))
    destination = np.array(
        [
            [0, 0],
            [out_width - 1, 0],
            [out_width - 1, out_height - 1],
            [0, out_height - 1],
        ],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(quad.astype(np.float32), destination)
    return cv2.warpPerspective(image, matrix, (out_width, out_height))


def render_overlay(image: np.ndarray, quad: np.ndarray) -> np.ndarray:
    overlay = image.copy()
    points = quad.astype(np.int32).reshape((-1, 1, 2))
    cv2.polylines(overlay, [points], isClosed=True, color=(0, 200, 255), thickness=8)
    for index, point in enumerate(quad.astype(np.int32), start=1):
        x, y = int(point[0]), int(point[1])
        cv2.circle(overlay, (x, y), 18, (0, 80, 255), -1)
        cv2.putText(
            overlay,
            str(index),
            (x + 20, y - 12),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.1,
            (0, 80, 255),
            3,
            cv2.LINE_AA,
        )
    return overlay


def main() -> int:
    args = parse_args()
    image_path = args.image
    if not image_path.is_absolute():
        image_path = (REPO_ROOT / image_path).resolve()

    output_dir = args.output_dir
    if not output_dir.is_absolute():
        output_dir = (REPO_ROOT / output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    prefix = args.prefix or image_path.stem
    image = cv2.imread(str(image_path))
    if image is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")

    quad = detect_gold_shelf_quad(image)
    warped = warp_quad(image, quad)
    overlay = render_overlay(image, quad)

    frame_path = output_dir / f"{prefix}.frame.png"
    overlay_path = output_dir / f"{prefix}.frame.overlay.png"
    meta_path = output_dir / f"{prefix}.frame.json"

    cv2.imwrite(str(frame_path), warped)
    cv2.imwrite(str(overlay_path), overlay)
    meta_path.write_text(
        json.dumps(
            {
                "image": str(image_path),
                "frame_png": str(frame_path),
                "overlay_png": str(overlay_path),
                "corners": [[float(x), float(y)] for x, y in quad],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Frame PNG: {frame_path}")
    print(f"Overlay PNG: {overlay_path}")
    print(f"Metadata JSON: {meta_path}")
    print("Corners:", json.dumps([[round(float(x), 2), round(float(y), 2)] for x, y in quad]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
