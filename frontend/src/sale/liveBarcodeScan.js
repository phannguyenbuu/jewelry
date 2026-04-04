const DEFAULT_SCAN_RENDER_SIZE = 1280;
const DEFAULT_FOCUS_RATIO = 0.3;

const clampRatio = (value, fallback = DEFAULT_FOCUS_RATIO) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(0.9, Math.max(0.25, numeric));
};

const getSourceDimensions = (source) => ({
    width: Number(source?.videoWidth || source?.naturalWidth || source?.width || 0),
    height: Number(source?.videoHeight || source?.naturalHeight || source?.height || 0),
});

const buildSquareCropRect = (sourceWidth, sourceHeight, ratio) => {
    const size = Math.max(1, Math.round(Math.min(sourceWidth, sourceHeight) * clampRatio(ratio)));
    return {
        x: Math.max(0, Math.round((sourceWidth - size) / 2)),
        y: Math.max(0, Math.round((sourceHeight - size) / 2)),
        width: size,
        height: size,
    };
};

const buildFullFrameRect = (sourceWidth, sourceHeight) => ({
    x: 0,
    y: 0,
    width: Math.max(1, Math.round(sourceWidth)),
    height: Math.max(1, Math.round(sourceHeight)),
});

const fitRectToLongSide = (rect, targetLongSide) => {
    const safeTarget = Math.max(720, Math.round(targetLongSide || DEFAULT_SCAN_RENDER_SIZE));
    const scale = safeTarget / Math.max(rect.width, rect.height, 1);
    return {
        width: Math.max(1, Math.round(rect.width * scale)),
        height: Math.max(1, Math.round(rect.height * scale)),
    };
};

const scoreDetectedItem = (item, sourceWidth, sourceHeight, cropRect, renderWidth, renderHeight) => {
    const bounds = item?.boundingBox;
    if (!bounds) return { item, score: -1 };

    const scaleX = cropRect.width / Math.max(1, renderWidth);
    const scaleY = cropRect.height / Math.max(1, renderHeight);
    const centerX = cropRect.x + ((bounds.x + (bounds.width / 2)) * scaleX);
    const centerY = cropRect.y + ((bounds.y + (bounds.height / 2)) * scaleY);
    const sourceCenterX = sourceWidth / 2;
    const sourceCenterY = sourceHeight / 2;
    const dx = centerX - sourceCenterX;
    const dy = centerY - sourceCenterY;
    const maxDistance = Math.hypot(sourceCenterX, sourceCenterY) || 1;
    const distanceScore = 1 - (Math.hypot(dx, dy) / maxDistance);
    const areaScore = Math.min(
        1,
        Math.max(1, bounds.width * bounds.height) * scaleX * scaleY / Math.max(1, sourceWidth * sourceHeight),
    );

    return {
        item,
        score: (distanceScore * 0.72) + (areaScore * 0.28),
    };
};

const pickBestDetectedItem = (results, sourceWidth, sourceHeight, cropRect, renderWidth, renderHeight) => {
    return Array.from(results || [])
        .filter((item) => String(item?.rawValue || '').trim())
        .map((item) => scoreDetectedItem(item, sourceWidth, sourceHeight, cropRect, renderWidth, renderHeight))
        .sort((left, right) => right.score - left.score)[0]?.item || null;
};

const drawSourceToCanvas = (source, canvas, cropRect, renderSize, filter = 'none') => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    canvas.width = renderSize.width;
    canvas.height = renderSize.height;
    context.save();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.filter = filter || 'none';
    context.drawImage(
        source,
        cropRect.x,
        cropRect.y,
        cropRect.width,
        cropRect.height,
        0,
        0,
        renderSize.width,
        renderSize.height,
    );
    context.restore();
    return context;
};

const detectBestOnCanvas = async (detector, source, canvas, sourceWidth, sourceHeight, pass) => {
    const context = drawSourceToCanvas(source, canvas, pass.cropRect, pass.renderSize, pass.filter);
    if (!context) return null;
    const results = await detector.detect(canvas);
    return pickBestDetectedItem(
        results,
        sourceWidth,
        sourceHeight,
        pass.cropRect,
        pass.renderSize.width,
        pass.renderSize.height,
    );
};

const buildScanPasses = (sourceWidth, sourceHeight, focusRatio, targetSize) => {
    const normalizedFocus = clampRatio(focusRatio);
    const mediumFocus = clampRatio(Math.max(normalizedFocus * 1.85, 0.52), 0.52);
    const focusRect = buildSquareCropRect(sourceWidth, sourceHeight, normalizedFocus);
    const mediumRect = buildSquareCropRect(sourceWidth, sourceHeight, mediumFocus);
    const fullRect = buildFullFrameRect(sourceWidth, sourceHeight);

    return [
        {
            cropRect: focusRect,
            renderSize: {
                width: Math.max(1280, Math.round(targetSize * 1.15)),
                height: Math.max(1280, Math.round(targetSize * 1.15)),
            },
            filter: 'contrast(1.08) saturate(1.04)',
        },
        {
            cropRect: focusRect,
            renderSize: {
                width: Math.max(1600, Math.round(targetSize * 1.4)),
                height: Math.max(1600, Math.round(targetSize * 1.4)),
            },
            filter: 'grayscale(0.08) contrast(1.28) brightness(1.04) saturate(1.1)',
        },
        {
            cropRect: mediumRect,
            renderSize: {
                width: Math.max(1440, Math.round(targetSize * 1.5)),
                height: Math.max(1440, Math.round(targetSize * 1.5)),
            },
            filter: 'contrast(1.18) brightness(1.02) saturate(1.08)',
        },
        {
            cropRect: fullRect,
            renderSize: fitRectToLongSide(fullRect, Math.max(1440, Math.round(targetSize * 1.6))),
            filter: 'contrast(1.16) brightness(1.03)',
        },
    ];
};

const buildFullFrameScanPasses = (sourceWidth, sourceHeight, targetSize) => {
    const fullRect = buildFullFrameRect(sourceWidth, sourceHeight);
    return [
        {
            cropRect: fullRect,
            renderSize: fitRectToLongSide(fullRect, Math.max(1440, Math.round(targetSize * 1.2))),
            filter: 'none',
        },
        {
            cropRect: fullRect,
            renderSize: fitRectToLongSide(fullRect, Math.max(1760, Math.round(targetSize * 1.4))),
            filter: 'contrast(1.12) brightness(1.02) saturate(1.04)',
        },
        {
            cropRect: fullRect,
            renderSize: fitRectToLongSide(fullRect, Math.max(1920, Math.round(targetSize * 1.55))),
            filter: 'grayscale(0.08) contrast(1.26) brightness(1.05) saturate(1.08)',
        },
    ];
};

const detectBestDirectly = async (detector, source, sourceWidth, sourceHeight) => {
    const results = await detector.detect(source);
    return pickBestDetectedItem(
        results,
        sourceWidth,
        sourceHeight,
        buildFullFrameRect(sourceWidth, sourceHeight),
        sourceWidth,
        sourceHeight,
    );
};

const scanBarcodeSource = async (detector, source, canvasRef, {
    cropRatio = DEFAULT_FOCUS_RATIO,
    targetSize = DEFAULT_SCAN_RENDER_SIZE,
    fallbackToSource = true,
    preferFullFrame = false,
} = {}) => {
    if (!detector || !source) return null;

    const { width: sourceWidth, height: sourceHeight } = getSourceDimensions(source);
    if (!sourceWidth || !sourceHeight) return null;

    const scratchCanvas = canvasRef?.current || document.createElement('canvas');
    if (canvasRef && !canvasRef.current) {
        canvasRef.current = scratchCanvas;
    }

    if (preferFullFrame && fallbackToSource) {
        const directMatch = await detectBestDirectly(detector, source, sourceWidth, sourceHeight);
        if (directMatch?.rawValue) return directMatch;
    }

    const passes = preferFullFrame
        ? buildFullFrameScanPasses(sourceWidth, sourceHeight, targetSize)
        : buildScanPasses(sourceWidth, sourceHeight, cropRatio, targetSize);
    for (const pass of passes) {
        const match = await detectBestOnCanvas(detector, source, scratchCanvas, sourceWidth, sourceHeight, pass);
        if (match?.rawValue) return match;
    }

    if (!fallbackToSource) return null;
    return detectBestDirectly(detector, source, sourceWidth, sourceHeight);
};

export const LIVE_BARCODE_SCAN_INTERVAL_MS = 140;

export const createLiveBarcodeConstraints = ({ square = false } = {}) => ({
    facingMode: { ideal: 'environment' },
    width: { ideal: square ? 1920 : 1600 },
    height: { ideal: square ? 1920 : 2560 },
    frameRate: { ideal: 30, max: 60 },
});

export const tuneLiveBarcodeStream = async (stream, { preferZoom = true } = {}) => {
    const track = stream?.getVideoTracks?.()?.[0];
    if (!track?.getCapabilities || !track?.applyConstraints) return;

    const capabilities = track.getCapabilities();
    const advanced = [];

    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
        advanced.push({ focusMode: 'continuous' });
    }

    if (preferZoom && capabilities.zoom) {
        const minZoom = Number(capabilities.zoom.min ?? 1);
        const maxZoom = Number(capabilities.zoom.max ?? minZoom);
        if (Number.isFinite(minZoom) && Number.isFinite(maxZoom) && maxZoom > minZoom) {
            const preferredZoom = Math.min(maxZoom, Math.max(minZoom, minZoom + ((maxZoom - minZoom) * 0.35)));
            advanced.push({ zoom: preferredZoom });
        }
    }

    if (!advanced.length) return;

    try {
        await track.applyConstraints({ advanced });
    } catch {
        // Ignore unsupported camera tuning and continue with default stream settings.
    }
};

export const detectLiveBarcode = async (detector, video, canvasRef, options = {}) => (
    scanBarcodeSource(detector, video, canvasRef, options)
);

export const scanBarcodeFromSource = async (detector, source, options = {}) => (
    scanBarcodeSource(detector, source, null, options)
);
