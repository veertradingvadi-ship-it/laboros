/**
 * Storage utilities for LaborOS
 * Upload compressed thumbnails to Supabase Storage
 */

import { supabase } from './supabase';
import { compressToThumbnail, generateProofFilename } from './image-utils';

const BUCKET_NAME = 'daily-scans';

/**
 * Upload proof photo to Supabase Storage
 * Returns the public URL
 */
export async function uploadProofPhoto(
    imageData: string | Blob,
    workerId: string,
    date?: string
): Promise<string | null> {
    try {
        // Compress to tiny thumbnail
        const compressedBlob = await compressToThumbnail(imageData, 200, 0.5);

        // Generate unique filename
        const filename = generateProofFilename(workerId, date);

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filename, compressedBlob, {
                contentType: 'image/webp',
                cacheControl: '3600',
                upsert: true,
            });

        if (error) {
            console.error('Upload error:', error);
            return null;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(data.path);

        return urlData.publicUrl;
    } catch (err) {
        console.error('Proof upload failed:', err);
        return null;
    }
}

/**
 * Upload proof and update attendance log in parallel (non-blocking)
 */
export function uploadProofAsync(
    imageData: string,
    workerId: string,
    logId: string,
    isCheckOut: boolean = false
): void {
    // Fire and forget - don't block UI
    uploadProofPhoto(imageData, workerId).then(async (url) => {
        if (url) {
            const updateField = isCheckOut ? 'proof_out_url' : 'proof_url';
            await supabase.from('attendance_logs')
                .update({ [updateField]: url })
                .eq('id', logId);
        }
    }).catch(console.error);
}

/**
 * Get recent scan proofs for live wall
 */
export async function getRecentProofs(limit: number = 20): Promise<{
    id: string;
    worker_name: string;
    proof_url: string;
    check_in_time: string;
    date: string;
}[]> {
    const { data } = await supabase
        .from('attendance_logs')
        .select('id, proof_url, check_in_time, date, workers(name)')
        .not('proof_url', 'is', null)
        .order('check_in_time', { ascending: false })
        .limit(limit);

    return (data || []).map((log: any) => ({
        id: log.id,
        worker_name: log.workers?.name || 'Unknown',
        proof_url: log.proof_url,
        check_in_time: log.check_in_time,
        date: log.date,
    }));
}
