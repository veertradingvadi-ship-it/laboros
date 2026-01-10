/**
 * LaborOS Liveness Detection Utilities
 * Uses MediaPipe Face Mesh landmarks for anti-spoofing
 */

// MediaPipe Face Mesh landmark indices
export const LANDMARKS = {
    // Left eye
    LEFT_EYE_TOP: 159,
    LEFT_EYE_BOTTOM: 145,
    LEFT_EYE_LEFT: 33,
    LEFT_EYE_RIGHT: 133,

    // Right eye
    RIGHT_EYE_TOP: 386,
    RIGHT_EYE_BOTTOM: 374,
    RIGHT_EYE_LEFT: 362,
    RIGHT_EYE_RIGHT: 263,

    // Lips
    UPPER_LIP_CENTER: 13,
    LOWER_LIP_CENTER: 14,
    LEFT_LIP_CORNER: 61,
    RIGHT_LIP_CORNER: 291,

    // Nose
    NOSE_TIP: 1,
    NOSE_BRIDGE: 6,

    // Face bounds
    FOREHEAD: 10,
    CHIN: 152,
    LEFT_CHEEK: 234,
    RIGHT_CHEEK: 454,
};

export type Challenge = 'BLINK' | 'SMILE' | 'LOOK_LEFT' | 'LOOK_RIGHT' | 'OPEN_MOUTH';

export interface QualityResult {
    isGood: boolean;
    faceDetected: boolean;
    isCentered: boolean;
    isCorrectDistance: boolean;
    message: string;
}

export interface LivenessResult {
    passed: boolean;
    confidence: number;
    message: string;
}

/**
 * Calculate Euclidean distance between two points
 */
function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

/**
 * Calculate Eye Aspect Ratio (EAR) - Used for blink detection
 * Lower EAR = eye more closed
 */
export function calculateEAR(landmarks: any[]): { left: number; right: number; average: number } {
    if (!landmarks || landmarks.length < 468) {
        return { left: 1, right: 1, average: 1 };
    }

    const leftEye = {
        top: landmarks[LANDMARKS.LEFT_EYE_TOP],
        bottom: landmarks[LANDMARKS.LEFT_EYE_BOTTOM],
        left: landmarks[LANDMARKS.LEFT_EYE_LEFT],
        right: landmarks[LANDMARKS.LEFT_EYE_RIGHT],
    };

    const rightEye = {
        top: landmarks[LANDMARKS.RIGHT_EYE_TOP],
        bottom: landmarks[LANDMARKS.RIGHT_EYE_BOTTOM],
        left: landmarks[LANDMARKS.RIGHT_EYE_LEFT],
        right: landmarks[LANDMARKS.RIGHT_EYE_RIGHT],
    };

    const leftVertical = distance(leftEye.top, leftEye.bottom);
    const leftHorizontal = distance(leftEye.left, leftEye.right);
    const leftEAR = leftVertical / (leftHorizontal + 0.0001);

    const rightVertical = distance(rightEye.top, rightEye.bottom);
    const rightHorizontal = distance(rightEye.left, rightEye.right);
    const rightEAR = rightVertical / (rightHorizontal + 0.0001);

    return {
        left: leftEAR,
        right: rightEAR,
        average: (leftEAR + rightEAR) / 2,
    };
}

/**
 * Calculate Mouth Aspect Ratio (MAR) - Used for smile/open mouth detection
 */
export function calculateMAR(landmarks: any[]): { vertical: number; horizontal: number; ratio: number } {
    if (!landmarks || landmarks.length < 468) {
        return { vertical: 0, horizontal: 0, ratio: 0 };
    }

    const upperLip = landmarks[LANDMARKS.UPPER_LIP_CENTER];
    const lowerLip = landmarks[LANDMARKS.LOWER_LIP_CENTER];
    const leftCorner = landmarks[LANDMARKS.LEFT_LIP_CORNER];
    const rightCorner = landmarks[LANDMARKS.RIGHT_LIP_CORNER];

    const vertical = distance(upperLip, lowerLip);
    const horizontal = distance(leftCorner, rightCorner);

    return {
        vertical,
        horizontal,
        ratio: vertical / (horizontal + 0.0001),
    };
}

/**
 * Detect if user is blinking
 */
export function detectBlink(landmarks: any[], threshold: number = 0.15): boolean {
    const ear = calculateEAR(landmarks);
    return ear.average < threshold;
}

/**
 * Detect if user is smiling (mouth corners up)
 */
export function detectSmile(landmarks: any[], threshold: number = 0.08): boolean {
    if (!landmarks || landmarks.length < 468) return false;

    const leftCorner = landmarks[LANDMARKS.LEFT_LIP_CORNER];
    const rightCorner = landmarks[LANDMARKS.RIGHT_LIP_CORNER];
    const upperLip = landmarks[LANDMARKS.UPPER_LIP_CENTER];

    // When smiling, corners move up relative to upper lip center
    const leftUp = upperLip.y - leftCorner.y;
    const rightUp = upperLip.y - rightCorner.y;

    return leftUp > threshold && rightUp > threshold;
}

/**
 * Detect if mouth is open
 */
export function detectMouthOpen(landmarks: any[], threshold: number = 0.15): boolean {
    const mar = calculateMAR(landmarks);
    return mar.ratio > threshold;
}

/**
 * Detect head turn direction
 */
export function detectHeadTurn(landmarks: any[]): 'LEFT' | 'RIGHT' | 'CENTER' {
    if (!landmarks || landmarks.length < 468) return 'CENTER';

    const nose = landmarks[LANDMARKS.NOSE_TIP];
    const leftCheek = landmarks[LANDMARKS.LEFT_CHEEK];
    const rightCheek = landmarks[LANDMARKS.RIGHT_CHEEK];

    const faceCenter = (leftCheek.x + rightCheek.x) / 2;
    const noseOffset = nose.x - faceCenter;

    if (noseOffset > 0.03) return 'LEFT';  // Nose shifted right = head turns left
    if (noseOffset < -0.03) return 'RIGHT'; // Nose shifted left = head turns right
    return 'CENTER';
}

/**
 * Check face quality (distance, centering)
 */
export function checkFaceQuality(landmarks: any[], frameWidth: number, frameHeight: number): QualityResult {
    if (!landmarks || landmarks.length < 468) {
        return { isGood: false, faceDetected: false, isCentered: false, isCorrectDistance: false, message: 'No face detected' };
    }

    const forehead = landmarks[LANDMARKS.FOREHEAD];
    const chin = landmarks[LANDMARKS.CHIN];
    const leftCheek = landmarks[LANDMARKS.LEFT_CHEEK];
    const rightCheek = landmarks[LANDMARKS.RIGHT_CHEEK];

    // Calculate face bounds
    const faceHeight = Math.abs(chin.y - forehead.y);
    const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
    const faceCenter = { x: (leftCheek.x + rightCheek.x) / 2, y: (forehead.y + chin.y) / 2 };

    // Check if face is centered (within 30% of center)
    const isCentered = Math.abs(faceCenter.x - 0.5) < 0.2 && Math.abs(faceCenter.y - 0.5) < 0.2;

    // Check if face is correct distance (face should be 25-60% of frame height)
    const faceRatio = faceHeight;
    const isCorrectDistance = faceRatio > 0.2 && faceRatio < 0.7;

    let message = 'Perfect!';
    if (!isCentered) message = 'Center your face';
    if (faceRatio < 0.2) message = 'Move closer';
    if (faceRatio > 0.7) message = 'Move back';

    return {
        isGood: isCentered && isCorrectDistance,
        faceDetected: true,
        isCentered,
        isCorrectDistance,
        message,
    };
}

/**
 * Check for photo spoof (flat face detection)
 * Uses Z-depth from face mesh to detect if face is 3D or flat
 */
export function detectPhotoSpoof(landmarks: any[]): boolean {
    if (!landmarks || landmarks.length < 468) return true;

    // In MediaPipe, z-values indicate depth
    // A real face has varying z-values, a photo is flat
    const nose = landmarks[LANDMARKS.NOSE_TIP];
    const leftCheek = landmarks[LANDMARKS.LEFT_CHEEK];
    const rightCheek = landmarks[LANDMARKS.RIGHT_CHEEK];

    // Check if z-values exist and show depth variation
    if (nose.z !== undefined && leftCheek.z !== undefined && rightCheek.z !== undefined) {
        const noseDepth = Math.abs(nose.z);
        const cheekDepth = (Math.abs(leftCheek.z) + Math.abs(rightCheek.z)) / 2;

        // Nose should be closer (lower z) than cheeks
        const depthDiff = cheekDepth - noseDepth;

        // If depth difference is too small, might be a photo
        return depthDiff < 0.01; // Returns true if likely spoof
    }

    return false; // Can't determine, assume real
}

/**
 * Generate random liveness challenge
 */
export function generateChallenge(): Challenge {
    const challenges: Challenge[] = ['BLINK', 'SMILE', 'OPEN_MOUTH'];
    return challenges[Math.floor(Math.random() * challenges.length)];
}

/**
 * Get challenge instruction text
 */
export function getChallengeText(challenge: Challenge, gujarati: boolean = false): string {
    const instructions = {
        BLINK: { en: '👁️ Please BLINK', gu: '👁️ આંખ મારો' },
        SMILE: { en: '😊 Please SMILE', gu: '😊 હસો' },
        LOOK_LEFT: { en: '👈 Look LEFT', gu: '👈 ડાબી જુઓ' },
        LOOK_RIGHT: { en: '👉 Look RIGHT', gu: '👉 જમણી જુઓ' },
        OPEN_MOUTH: { en: '😮 Open MOUTH', gu: '😮 મોં ખોલો' },
    };
    return gujarati ? instructions[challenge].gu : instructions[challenge].en;
}

/**
 * Check if liveness challenge is passed
 */
export function checkLivenessChallenge(challenge: Challenge, landmarks: any[]): LivenessResult {
    if (!landmarks || landmarks.length < 468) {
        return { passed: false, confidence: 0, message: 'No face detected' };
    }

    switch (challenge) {
        case 'BLINK':
            const blinked = detectBlink(landmarks);
            return {
                passed: blinked,
                confidence: blinked ? 1 : 0,
                message: blinked ? 'Blink detected!' : 'Please blink',
            };

        case 'SMILE':
            const smiled = detectSmile(landmarks);
            return {
                passed: smiled,
                confidence: smiled ? 1 : 0,
                message: smiled ? 'Smile detected!' : 'Please smile',
            };

        case 'OPEN_MOUTH':
            const mouthOpen = detectMouthOpen(landmarks);
            return {
                passed: mouthOpen,
                confidence: mouthOpen ? 1 : 0,
                message: mouthOpen ? 'Mouth open detected!' : 'Please open mouth',
            };

        case 'LOOK_LEFT':
            const turnedLeft = detectHeadTurn(landmarks) === 'LEFT';
            return {
                passed: turnedLeft,
                confidence: turnedLeft ? 1 : 0,
                message: turnedLeft ? 'Left turn detected!' : 'Please look left',
            };

        case 'LOOK_RIGHT':
            const turnedRight = detectHeadTurn(landmarks) === 'RIGHT';
            return {
                passed: turnedRight,
                confidence: turnedRight ? 1 : 0,
                message: turnedRight ? 'Right turn detected!' : 'Please look right',
            };

        default:
            return { passed: false, confidence: 0, message: 'Unknown challenge' };
    }
}
