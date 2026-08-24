export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig } from '@/lib/aws-config';
import { requireUserCompany } from '@/lib/auth-helpers';
import { handleApiError } from '@/lib/api-error';
import { z } from 'zod';

/**
 * MIME allowlist.
 *
 * The endpoint exists so users can attach receipts and supporting documents to
 * income/expense records. Anything that a browser will execute or render as a
 * document in our own origin (html, svg, js, wasm) is excluded, as are archives
 * and executables.
 */
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

/** Extension allowlist, cross-checked against the declared content type. */
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'image/heif': ['heif'],
  'application/pdf': ['pdf'],
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — ample for a receipt scan

const uploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(200),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_FILE_BYTES, `File must be ${MAX_FILE_BYTES / (1024 * 1024)}MB or smaller`),
  // NOTE: `isPublic` is intentionally NOT accepted from the client. It used to
  // let any caller write into the bucket's public prefix, which turns our own
  // storage into a host for phishing pages or malware. All uploads are private.
});

export async function POST(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const body = await request.json();
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { fileName, contentType, fileSize } = parsed.data;

    // Normalise the declared content type (strip any ";charset=" parameters).
    const normalizedType = contentType.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(normalizedType)) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${[...ALLOWED_CONTENT_TYPES].join(', ')}` },
        { status: 400 }
      );
    }

    // A client-declared content type is not trustworthy on its own, so the file
    // extension must corroborate it. This blocks "script.html sent as image/png".
    const extension = fileName.includes('.')
      ? fileName.split('.').pop()!.toLowerCase()
      : '';
    if (!ALLOWED_EXTENSIONS[normalizedType].includes(extension)) {
      return NextResponse.json(
        { error: `File extension ".${extension}" does not match content type ${normalizedType}` },
        { status: 400 }
      );
    }

    // Strip path separators and anything unusual from the display name.
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);

    const s3 = createS3Client();
    const { bucketName, folderPrefix } = getBucketConfig();

    // Company-scoped, private path. The UUID makes object keys unguessable —
    // previously `Date.now()-filename` was trivially predictable.
    const cloud_storage_path = `${folderPrefix}uploads/${companyId}/${randomUUID()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: cloud_storage_path,
      ContentType: normalizedType,
      // Binds the presigned URL to this exact byte count, so the signature
      // cannot be reused to push an arbitrarily large object.
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 min

    return NextResponse.json({ uploadUrl, cloud_storage_path });
  } catch (error) {
    return handleApiError('upload:presigned', error, {
      fallbackMessage: 'Failed to generate upload URL',
    });
  }
}
