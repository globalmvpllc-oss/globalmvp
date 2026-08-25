import { S3Client } from '@aws-sdk/client-s3';

/**
 * Storage configuration and error classification.
 *
 * Presigning does not talk to S3 — the URL is signed locally — so the only way
 * `getSignedUrl` can fail is if credentials cannot be resolved. Everything else
 * (a missing bucket, denied access, a wrong region) surfaces later, when the
 * browser PUTs to the signed URL. That is why a missing AWS_ACCESS_KEY_ID
 * produced "Failed to generate upload URL" and nothing more specific: the
 * config check passed, the SDK threw CredentialsProviderError, and the generic
 * handler swallowed the distinction.
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

/**
 * Environment variables that must be set for storage to work at all.
 * Credentials are handled separately, because they may legitimately come from
 * an instance role rather than the environment.
 */
export const REQUIRED_STORAGE_VARS = ['AWS_BUCKET_NAME', 'AWS_REGION'] as const;

/** Credential pair. Both or neither — one alone cannot sign anything. */
export const STORAGE_CREDENTIAL_VARS = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'] as const;

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

/**
 * Explicit credentials from the environment, or undefined to fall back to the
 * SDK's default provider chain (instance role, shared config, and so on).
 *
 * A half-configured pair is treated as missing rather than passed through: the
 * SDK would otherwise fail deep inside the signer with a less useful message.
 */
export function getStorageCredentials(): { accessKeyId: string; secretAccessKey: string } | undefined {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) return undefined;
  return { accessKeyId, secretAccessKey };
}

/** Which credential variables are absent. Names only — never values. */
export function missingCredentialVars(): string[] {
  return STORAGE_CREDENTIAL_VARS.filter((name) => !process.env[name]?.trim());
}

export function createS3Client() {
  const { region } = getBucketConfig();
  const credentials = getStorageCredentials();
  // Region is always explicit. Credentials are passed only when the environment
  // supplies them, so a role-based deployment still works.
  return new S3Client(credentials ? { region, credentials } : { region });
}

export interface StorageFailure {
  status: number;
  /** Safe to show a user. Contains no keys, endpoints or request identifiers. */
  message: string;
  /** Safe to log. Contains no secret values. */
  logDetail: string;
}

/** Reads an AWS SDK error's discriminators without assuming a class. */
function errorShape(error: unknown): { name: string; code: string; httpStatus?: number } {
  const e = (error ?? {}) as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return {
    name: String(e.name ?? ''),
    code: String(e.Code ?? e.code ?? ''),
    httpStatus: e.$metadata?.httpStatusCode,
  };
}

/**
 * Maps a storage failure to a status and a message worth reading.
 *
 * Verified against the SDK rather than guessed: presigning with no credentials
 * throws CredentialsProviderError, while presigning with a nonexistent bucket
 * succeeds. The bucket, permission and region cases below therefore apply to
 * real S3 calls and to the browser's upload, not to presigning.
 */
export function classifyStorageError(error: unknown): StorageFailure {
  if (isStorageConfigError(error)) {
    return {
      status: 503,
      message: 'Storage configuration is missing. Please try again later.',
      logDetail: `StorageConfigError missing=[${error.missing.join(', ')}]`,
    };
  }

  const { name, code, httpStatus } = errorShape(error);
  const marker = `${name} ${code}`;

  if (name === 'CredentialsProviderError' || code === 'CredentialsProviderError') {
    const absent = missingCredentialVars();
    return {
      status: 503,
      message: 'Storage credentials are missing or invalid. Please try again later.',
      logDetail:
        absent.length > 0
          ? `CredentialsProviderError; unset env: [${absent.join(', ')}]`
          : 'CredentialsProviderError; credential env vars are set, so the values were rejected',
    };
  }

  if (/InvalidAccessKeyId|SignatureDoesNotMatch|InvalidClientTokenId|UnrecognizedClientException/.test(marker)) {
    return {
      status: 503,
      message: 'Storage credentials are invalid. Please try again later.',
      logDetail: `credential rejected by S3: ${marker}`,
    };
  }

  if (/AccessDenied|Forbidden/.test(marker) || httpStatus === 403) {
    return {
      status: 503,
      message: 'Storage access was denied. Please try again later.',
      logDetail: `access denied: ${marker}`,
    };
  }

  if (/NoSuchBucket/.test(marker) || (httpStatus === 404 && /Bucket/.test(marker))) {
    return {
      status: 503,
      message: 'The storage bucket was not found. Please try again later.',
      logDetail: `bucket missing: ${marker}`,
    };
  }

  if (/PermanentRedirect|AuthorizationHeaderMalformed|IllegalLocationConstraint/.test(marker)) {
    return {
      status: 503,
      message: 'Storage region configuration is incorrect. Please try again later.',
      logDetail: `region mismatch: ${marker}`,
    };
  }

  if (
    /TimeoutError|NetworkingError|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ServiceUnavailable|SlowDown/.test(marker) ||
    (httpStatus !== undefined && httpStatus >= 500)
  ) {
    return {
      status: 503,
      message: 'The storage service is temporarily unavailable. Please try again.',
      logDetail: `storage unavailable: ${marker} status=${httpStatus ?? 'n/a'}`,
    };
  }

  return {
    status: 500,
    message: 'Could not generate the upload URL. Please try again.',
    logDetail: `unclassified storage error: ${marker || 'unknown'}`,
  };
}
