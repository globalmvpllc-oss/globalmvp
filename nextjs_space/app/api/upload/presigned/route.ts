export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig } from '@/lib/aws-config';
import { requireUserCompany } from '@/lib/auth-helpers';
import { z } from 'zod';

const uploadSchema = z.object({
  fileName: z.string().min(1).max(500),
  contentType: z.string().min(1).max(200),
  isPublic: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const body = await request.json();
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const { fileName, contentType, isPublic } = parsed.data;

    // Sanitize filename
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

    const s3 = createS3Client();
    const { bucketName, folderPrefix } = getBucketConfig();
    // Company-scoped path to prevent cross-tenant file access
    const prefix = isPublic
      ? `${folderPrefix}public/uploads/${companyId}`
      : `${folderPrefix}uploads/${companyId}`;
    const cloud_storage_path = `${prefix}/${Date.now()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: cloud_storage_path,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return NextResponse.json({ uploadUrl, cloud_storage_path });
  } catch (error: any) {
    console.error('Upload presigned error:', error);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
