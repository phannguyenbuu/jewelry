const clampCropScale = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return Math.min(1, Math.max(0.1, numeric));
};

export const readAndCropImageAsBase64 = (file, {
    aspectRatio = null,
    cropScale = 1,
    quality = 0.95,
} = {}) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        const sourceDataUrl = String(event?.target?.result || '');
        const image = new Image();
        image.onload = () => {
            const sourceWidth = image.width;
            const sourceHeight = image.height;
            let cropWidth = sourceWidth;
            let cropHeight = sourceHeight;

            if (aspectRatio) {
                const sourceAspect = sourceWidth / sourceHeight;
                if (sourceAspect > aspectRatio) {
                    cropWidth = Math.round(sourceHeight * aspectRatio);
                    cropHeight = sourceHeight;
                } else {
                    cropWidth = sourceWidth;
                    cropHeight = Math.round(sourceWidth / aspectRatio);
                }
            }

            const normalizedScale = clampCropScale(cropScale);
            if (normalizedScale < 1) {
                cropWidth = Math.max(1, Math.round(cropWidth * normalizedScale));
                cropHeight = Math.max(1, Math.round(cropHeight * normalizedScale));
            }

            const cropX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2));
            const cropY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2));

            const canvas = document.createElement('canvas');
            canvas.width = cropWidth;
            canvas.height = cropHeight;
            const context = canvas.getContext('2d');
            if (!context) {
                reject(new Error('Không tạo được canvas để xử lý ảnh.'));
                return;
            }

            context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1] || '');
        };
        image.onerror = () => reject(new Error('Không mở được ảnh để crop.'));
        image.src = sourceDataUrl;
    };
    reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
    reader.readAsDataURL(file);
});
