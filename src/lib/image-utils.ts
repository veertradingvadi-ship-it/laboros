/**
 * Image Utilities for LaborOS
 * Compress images to tiny thumbnails for fast upload
 */

/**
 * Compress image to tiny thumbnail (200px, WebP, ~5KB)
 */
export async function compressToThumbnail(
    input: File | Blob | string, // File, Blob, or base64 string
    maxWidth: number = 200,
    quality: number = 0.5
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            // Calculate dimensions
            const ratio = img.height / img.width;
            const width = Math.min(img.width, maxWidth);
            const height = Math.round(width * ratio);

            // Draw to canvas
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas context not available'));
                return;
            }

            ctx.drawImage(img, 0, 0, width, height);

            // Export as WebP (smaller than JPEG)
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create blob'));
                    }
                },
                'image/webp',
                quality
            );
        };

        img.onerror = () => reject(new Error('Failed to load image'));

        // Handle different input types
        if (typeof input === 'string') {
            // Base64 string
            img.src = input;
        } else {
            // File or Blob
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target?.result as string;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(input);
        }
    });
}

/**
 * Convert base64 to Blob
 */
export function base64ToBlob(base64: string, contentType: string = 'image/webp'): Blob {
    const byteString = atob(base64.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);

    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ab], { type: contentType });
}

/**
 * Generate unique filename for scan proof
 * Format: {date}/{worker_id}_{timestamp}.webp
 */
export function generateProofFilename(workerId: string, date?: string): string {
    const d = date || new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    return `${d}/${workerId}_${timestamp}.webp`;
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compress and get stats
 */
export async function compressWithStats(
    input: File | Blob | string,
    maxWidth: number = 200
): Promise<{ blob: Blob; originalSize: number; compressedSize: number; ratio: number }> {
    let originalSize = 0;

    if (typeof input === 'string') {
        // Estimate base64 size
        originalSize = Math.round((input.length * 3) / 4);
    } else {
        originalSize = input.size;
    }

    const blob = await compressToThumbnail(input, maxWidth);
    const compressedSize = blob.size;
    const ratio = originalSize / compressedSize;

    return { blob, originalSize, compressedSize, ratio };
}
