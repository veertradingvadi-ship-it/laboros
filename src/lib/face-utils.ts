// Face detection and recognition utilities using face-api.js
// Only import on client side to avoid SSG/SSR issues with tfjs-node
let faceapi: typeof import('@vladmandic/face-api') | null = null;

if (typeof window !== 'undefined') {
    import('@vladmandic/face-api').then(module => {
        faceapi = module;
    });
}

let modelsLoaded = false;

// Load face detection models (only in browser)
export async function loadFaceModels(): Promise<boolean> {
    if (typeof window === 'undefined') return false; // Server-side check
    if (modelsLoaded) return true;

    try {
        // Wait for dynamic import to complete
        if (!faceapi) {
            const module = await import('@vladmandic/face-api');
            faceapi = module;
        }
        const api = faceapi!; // TypeScript narrowing helper

        const MODEL_URL = '/models';

        await Promise.all([
            api.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        modelsLoaded = true;
        console.log('✓ Face AI models loaded');
        return true;
    } catch (error) {
        console.error('Error loading face models:', error);
        return false;
    }
}

export function areModelsLoaded(): boolean {
    return modelsLoaded;
}

// Head pose type
export type HeadPose = 'left' | 'center' | 'right';

// Face detection result
export interface FaceDetectionResult {
    descriptor: Float32Array;
    croppedFace: string;
    isFrontalFace: boolean; // true if face is looking straight at camera
    headPose: HeadPose;     // left, center, or right
    faceAngle: number;      // -100 to +100 (negative=left, positive=right)
}

// Face box for tracking
export interface FaceBox {
    x: number;      // percentage 0-100
    y: number;      // percentage 0-100
    width: number;  // percentage 0-100
    height: number; // percentage 0-100
}

// Quick face detection for tracking (no descriptor, just position)
export async function detectFaceBox(videoElement: HTMLVideoElement): Promise<FaceBox | null> {
    try {
        if (!faceapi) {
            const module = await import('@vladmandic/face-api');
            faceapi = module;
        }

        const detection = await faceapi.detectSingleFace(
            videoElement,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }) // Very low for reliable tracking
        );

        if (!detection) return null;

        const box = detection.box;
        const videoWidth = videoElement.videoWidth || videoElement.clientWidth;
        const videoHeight = videoElement.videoHeight || videoElement.clientHeight;

        return {
            x: (box.x / videoWidth) * 100,
            y: (box.y / videoHeight) * 100,
            width: (box.width / videoWidth) * 100,
            height: (box.height / videoHeight) * 100,
        };
    } catch {
        return null;
    }
}

// Detect face from base64 image - VERY LENIENT for various conditions
export async function detectFaceFromBase64(base64Image: string): Promise<FaceDetectionResult | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = async () => {
            try {
                // Very low confidence (0.1) to detect faces even in poor conditions
                const api = faceapi!;
                const detection = await api
                    .detectSingleFace(img, new api.SsdMobilenetv1Options({ minConfidence: 0.1 }))
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (!detection) {
                    console.log('No face detected in image');
                    resolve(null);
                    return;
                }

                // Get face bounding box with generous padding
                const box = detection.detection.box;
                const padding = Math.max(box.width, box.height) * 0.4;

                const x = Math.max(0, box.x - padding);
                const y = Math.max(0, box.y - padding);
                const width = Math.min(img.width - x, box.width + padding * 2);
                const height = Math.min(img.height - y, box.height + padding * 2);

                // Create circular cropped face
                const canvas = document.createElement('canvas');
                canvas.width = 200;
                canvas.height = 200;
                const ctx = canvas.getContext('2d')!;

                // Circular mask
                ctx.beginPath();
                ctx.arc(100, 100, 100, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();

                // Draw centered face
                const centerX = x + width / 2;
                const centerY = y + height / 2;
                const cropSize = Math.max(width, height);

                ctx.drawImage(
                    img,
                    centerX - cropSize / 2, centerY - cropSize / 2, cropSize, cropSize,
                    0, 0, 200, 200
                );

                const croppedFace = canvas.toDataURL('image/jpeg', 0.9);

                // Check if face is frontal using landmarks
                // Compare nose position relative to eyes - if nose is centered, face is frontal
                const landmarks = detection.landmarks;
                const leftEye = landmarks.getLeftEye();
                const rightEye = landmarks.getRightEye();
                const nose = landmarks.getNose();

                // Get center points
                const leftEyeCenter = leftEye.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
                leftEyeCenter.x /= leftEye.length;
                leftEyeCenter.y /= leftEye.length;

                const rightEyeCenter = rightEye.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
                rightEyeCenter.x /= rightEye.length;
                rightEyeCenter.y /= rightEye.length;

                const noseTip = nose[nose.length - 1]; // Bottom of nose
                const eyesCenterX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
                const eyeDistance = Math.abs(rightEyeCenter.x - leftEyeCenter.x);

                // Calculate nose offset from center (negative = left, positive = right)
                const noseOffsetRaw = noseTip.x - eyesCenterX;
                const noseOffset = Math.abs(noseOffsetRaw);
                const faceAngle = Math.round((noseOffsetRaw / eyeDistance) * 100); // -100 to +100

                // Check if frontal (centered)
                const isFrontalFace = noseOffset < eyeDistance * 0.40; // 40% tolerance (relaxed)

                // Determine head pose
                let headPose: 'left' | 'center' | 'right' = 'center';
                if (faceAngle < -15) headPose = 'left'; // Lowered threshold from 20 to 15
                else if (faceAngle > 15) headPose = 'right';

                console.log(`✓ Face detected (pose: ${headPose}, angle: ${faceAngle}%, frontal: ${isFrontalFace})`);
                resolve({
                    descriptor: detection.descriptor,
                    croppedFace,
                    isFrontalFace,
                    headPose,
                    faceAngle
                });
            } catch (error) {
                console.error('Face detection error:', error);
                resolve(null);
            }
        };

        img.onerror = () => {
            console.error('Failed to load image');
            resolve(null);
        };

        img.src = base64Image;
    });
}

// Legacy function
export async function getFaceDescriptorFromBase64(base64Image: string): Promise<Float32Array | null> {
    const result = await detectFaceFromBase64(base64Image);
    return result?.descriptor || null;
}

// Calculate euclidean distance between descriptors
export function getFaceDistance(d1: Float32Array, d2: Float32Array): number {
    if (!faceapi) throw new Error('Face API not loaded');
    return faceapi.euclideanDistance(d1, d2);
}

// Worker interface
export interface WorkerWithDescriptor {
    id: string;
    name: string;
    face_descriptor: number[] | null;
    photo_url: string | null;
}

// THRESHOLD: 0.55 for balanced accuracy
// Lower = stricter (more false negatives)
// Higher = more lenient (more false positives)
const MATCH_THRESHOLD = 0.55;

export async function findBestMatch(
    capturedDescriptor: Float32Array,
    workers: WorkerWithDescriptor[],
    threshold: number = MATCH_THRESHOLD
): Promise<{ worker: WorkerWithDescriptor; similarity: number; distance: number } | null> {
    let bestMatch: WorkerWithDescriptor | null = null;
    let bestDistance = Infinity;

    // Filter workers with valid 128-dim descriptors
    const validWorkers = workers.filter(w => w.face_descriptor && w.face_descriptor.length === 128);

    console.log(`Comparing against ${validWorkers.length} workers with face data`);

    for (const worker of validWorkers) {
        const workerDescriptor = new Float32Array(worker.face_descriptor!);
        const distance = getFaceDistance(capturedDescriptor, workerDescriptor);

        console.log(`  ${worker.name}: distance ${distance.toFixed(3)}`);

        if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = worker;
        }
    }

    // Only return if within threshold
    if (bestMatch && bestDistance <= threshold) {
        const similarity = Math.max(0, 1 - bestDistance / threshold);
        console.log(`✓ Match: ${bestMatch.name} (distance: ${bestDistance.toFixed(3)}, ${(similarity * 100).toFixed(0)}%)`);
        return { worker: bestMatch, similarity, distance: bestDistance };
    }

    console.log(`✗ No match (best: ${bestMatch?.name || 'none'} at ${bestDistance.toFixed(3)}, threshold: ${threshold})`);
    return null;
}

export function descriptorToArray(descriptor: Float32Array): number[] {
    return Array.from(descriptor);
}

export function arrayToDescriptor(arr: number[]): Float32Array {
    return new Float32Array(arr);
}
