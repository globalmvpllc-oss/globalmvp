export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireUserCompany } from '@/lib/auth-helpers';
import { createS3Client, getBucketConfig, classifyStorageError } from '@/lib/aws-config';

/**
 * Issues a short-lived read URL for an object this company uploaded.
 *
 * The upload endpoint hands back a storage key rather than a URL, so without
 * this there is no way to render an uploaded file. Objects stay private; the
 * browser gets a signed URL that expires.
 *
 * Authorisation is the same rule the upload side enforces: the key must sit
 * under `uploads/{companyId}/`, and companyId comes from the session, never
 * from the request. A key belonging to another company is rejected.
 */
export async function GET(request: Request) {
  try {
    const { error, companyId } = await requireUserCompany();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    if (!path.includes(`uploads/${companyId}/`)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { bucketName } = getBucketConfig();
    const client = createS3Client();

    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucketName, Key: path }),
      { expiresIn: 3600 }
    );

    return NextResponse.json({ url });
  } catch (error) {
    // Storage failures are classified rather than collapsed into one message:
    // missing configuration, unresolvable credentials, denied access, a missing
    // bucket and a region mismatch are different problems with different fixes.
    // The user gets a safe sentence; the log gets the discriminator, and when
    // credentials are the problem, the names of the variables that are unset.
    const failure = classifyStorageError(error);
    console.error('[upload:view]', failure.logDetail);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
