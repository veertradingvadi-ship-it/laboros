/**
 * Face Quality Utilities for LaborOS
 * Quality checks for face images before registration/matching
 */

export interface QualityResult {
    isGood: boolean;
    brightness: number;
    sharpness: number;
    faceSize: number;
    issues: string[];
}

/**
 * Check image quality (brightness, sharpness, face size)
 */
export async function checkImageQuality(imageBase64: string): Promise<QualityResult> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve({ isGood: false, brightness: 0, sharpness: 0, faceSize: 0, issues: ['Canvas error'] });
                return;
            }

            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Calculate brightness (average luminance)
            let totalBrightness = 0;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                totalBrightness += (0.299 * r + 0.587 * g + 0.114 * b);
            }
            const avgBrightness = totalBrightness / (data.length / 4);
            const brightness = avgBrightness / 255; // 0-1

            // Calculate sharpness (variance of Laplacian approximation)
            let variance = 0;
            const width = canvas.width;
            for (let y = 1; y < canvas.height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    const center = data[idx] + data[idx + 1] + data[idx + 2];
                    const left = data[idx - 4] + data[idx - 3] + data[idx - 2];
                    const right = data[idx + 4] + data[idx + 5] + data[idx + 6];
                    const top = data[idx - width * 4] + data[idx - width * 4 + 1] + data[idx - width * 4 + 2];
                    const bottom = data[idx + width * 4] + data[idx + width * 4 + 1] + data[idx + width * 4 + 2];
                    const laplacian = Math.abs(4 * center - left - right - top - bottom);
                    variance += laplacian;
                }
            }
            const sharpness = Math.min(variance / (canvas.width * canvas.height * 100), 1);

            // Face size relative to image (assuming face is roughly in center)
            const faceSize = Math.min(canvas.width, canvas.height) / 200; // normalized

            const issues: string[] = [];
            if (brightness < 0.2) issues.push('Too dark');
            if (brightness > 0.85) issues.push('Too bright');
            if (sharpness < 0.1) issues.push('Blurry');
            if (faceSize < 0.5) issues.push('Face too small');

            resolve({
                isGood: issues.length === 0,
                brightness,
                sharpness,
                faceSize,
                issues,
            });
        };
        img.onerror = () => {
            resolve({ isGood: false, brightness: 0, sharpness: 0, faceSize: 0, issues: ['Image load error'] });
        };
        img.src = imageBase64;
    });
}

/**
 * Average multiple face descriptors for multi-angle enrollment
 */
export function averageDescriptors(descriptors: Float32Array[]): Float32Array {
    if (descriptors.length === 0) return new Float32Array(128);
    if (descriptors.length === 1) return descriptors[0];

    const result = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
        let sum = 0;
        for (const desc of descriptors) {
            sum += desc[i];
        }
        result[i] = sum / descriptors.length;
    }
    return result;
}

/**
 * Check if face descriptors are from the same person
 */
export function areSamePerson(desc1: Float32Array, desc2: Float32Array, threshold: number = 0.5): boolean {
    if (!desc1 || !desc2 || desc1.length !== desc2.length) return false;

    let distance = 0;
    for (let i = 0; i < desc1.length; i++) {
        distance += Math.pow(desc1[i] - desc2[i], 2);
    }
    distance = Math.sqrt(distance);
    return distance < threshold;
}
