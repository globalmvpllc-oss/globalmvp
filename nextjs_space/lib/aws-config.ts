import { S3Client } from '@aws-sdk/client-s3';

/**
 * Thrown when the storage environment variables are missing or blank.
 *
 * Previously these fell back to empty strings, so a missing AWS_BUCKET_NAME
 * reached the SDK as `Bucket: ''` and came back as an opaque AWS error that
 * told the user nothing. Failing here, with a recognisable type, lets the API
 * answer with "Storage is not configured correctly" instead.
 */
export class StorageConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Storage is not configured: missing ${missing.join(', ')}`);
    this.name = 'StorageConfigError';
    this.missing = missing;
  }
}

export function isStorageConfigError(error: unknown): error is StorageConfigError {
  return error instanceof StorageConfigError || (error as Error)?.name === 'StorageConfigError';
}

export function getBucketConfig() {
  const bucketName = process.env.AWS_BUCKET_NAME?.trim();
  const region = process.env.AWS_REGION?.trim();

  const missing: string[] = [];
  if (!bucketName) missing.push('AWS_BUCKET_NAME');
  if (!region) missing.push('AWS_REGION');
  if (missing.length > 0) throw new StorageConfigError(missing);

  return {
    bucketName: bucketName as string,
    region: region as string,
    // Optional: an empty prefix simply means "bucket root".
    folderPrefix: process.env.AWS_FOLDER_PREFIX?.trim() ?? '',
  };
}

export function createS3Client() {
  // Region is passed explicitly. Relying on the SDK's default chain meant a
  // missing AWS_REGION surfaced deep inside the SDK rather than here.
  const { region } = getBucketConfig();
  return new S3Client({ region });
}
