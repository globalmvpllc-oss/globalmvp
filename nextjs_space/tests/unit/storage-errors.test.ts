import { describe, it, expect, afterEach } from 'vitest';
import {
  classifyStorageError,
  getBucketConfig,
  getStorageCredentials,
  missingCredentialVars,
  isStorageConfigError,
  StorageConfigError,
  REQUIRED_STORAGE_VARS,
  STORAGE_CREDENTIAL_VARS,
} from '@/lib/aws-config';

/**
 * Storage configuration and failure classification.
 *
 * The error shapes asserted here were taken from the SDK rather than guessed.
 * Two facts drove the design:
 *
 *   1. Presigning never contacts S3. Signing a PUT for a bucket that does not
 *      exist, with credentials that are not real, still returns a URL. So
 *      NoSuchBucket, AccessDenied and SignatureDoesNotMatch cannot occur while
 *      generating an upload URL — they appear later, on the browser's PUT.
 *   2. The only failure presigning can produce is credential resolution, which
 *      throws `CredentialsProviderError: Could not load credentials from any
 *      providers`.
 *
 * That is why "Failed to generate upload URL" meant, in practice, "the server
 * has no AWS credentials".
 */

const ENV_KEYS = [...REQUIRED_STORAGE_VARS, ...STORAGE_CREDENTIAL_VARS, 'AWS_FOLDER_PREFIX'];
const original: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) original[key] = process.env[key];

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function setEnv(values: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

/** The shape the AWS SDK throws when credentials cannot be resolved. */
const credentialsProviderError = () => Object.assign(new Error('Could not load credentials from any providers'), {
  name: 'CredentialsProviderError',
  tryNextLink: false,
});

/** An S3 service error, as the SDK surfaces it. */
const s3Error = (name: string, httpStatusCode = 400) =>
  Object.assign(new Error(name), { name, Code: name, $metadata: { httpStatusCode } });

describe('required configuration', () => {
  it('reports a missing bucket name', () => {
    setEnv({ AWS_REGION: 'eu-central-1' });
    expect(() => getBucketConfig()).toThrow(StorageConfigError);
    try {
      getBucketConfig();
    } catch (e) {
      expect((e as StorageConfigError).missing).toEqual(['AWS_BUCKET_NAME']);
    }
  });

  it('reports a missing region', () => {
    setEnv({ AWS_BUCKET_NAME: 'my-bucket' });
    try {
      getBucketConfig();
    } catch (e) {
      expect((e as StorageConfigError).missing).toEqual(['AWS_REGION']);
    }
  });

  it('reports both when neither is set', () => {
    setEnv({});
    try {
      getBucketConfig();
    } catch (e) {
      expect((e as StorageConfigError).missing).toEqual(['AWS_BUCKET_NAME', 'AWS_REGION']);
    }
  });

  it('treats a blank value as missing', () => {
    setEnv({ AWS_BUCKET_NAME: '   ', AWS_REGION: 'eu-central-1' });
    expect(() => getBucketConfig()).toThrow(StorageConfigError);
  });

  it('returns the configuration when both are present', () => {
    setEnv({ AWS_BUCKET_NAME: 'my-bucket', AWS_REGION: 'eu-central-1', AWS_FOLDER_PREFIX: 'prod/' });
    const config = getBucketConfig();
    expect(config.bucketName).toBe('my-bucket');
    expect(config.region).toBe('eu-central-1');
    expect(config.folderPrefix).toBe('prod/');
  });

  it('treats an absent folder prefix as the bucket root', () => {
    setEnv({ AWS_BUCKET_NAME: 'my-bucket', AWS_REGION: 'eu-central-1' });
    expect(getBucketConfig().folderPrefix).toBe('');
  });
});

describe('credentials', () => {
  it('returns the pair when both are set', () => {
    setEnv({ AWS_ACCESS_KEY_ID: 'AKIA_EXAMPLE', AWS_SECRET_ACCESS_KEY: 'secret_example' });
    expect(getStorageCredentials()).toEqual({
      accessKeyId: 'AKIA_EXAMPLE',
      secretAccessKey: 'secret_example',
    });
  });

  it('falls back to the provider chain when neither is set', () => {
    setEnv({});
    expect(getStorageCredentials()).toBeUndefined();
    expect(missingCredentialVars()).toEqual(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']);
  });

  it('treats a half-configured pair as unusable rather than passing it through', () => {
    setEnv({ AWS_ACCESS_KEY_ID: 'AKIA_EXAMPLE' });
    expect(getStorageCredentials()).toBeUndefined();
    expect(missingCredentialVars()).toEqual(['AWS_SECRET_ACCESS_KEY']);
  });

  it('names only the variables that are unset', () => {
    setEnv({ AWS_ACCESS_KEY_ID: 'AKIA_EXAMPLE', AWS_SECRET_ACCESS_KEY: 'secret_example' });
    expect(missingCredentialVars()).toEqual([]);
  });
});

describe('classification of the failure that actually happened', () => {
  it('maps CredentialsProviderError to a credentials message, not a generic one', () => {
    setEnv({});
    const failure = classifyStorageError(credentialsProviderError());
    expect(failure.status).toBe(503);
    expect(failure.message).toMatch(/credentials/i);
    expect(failure.message).not.toBe('Failed to generate upload URL');
  });

  it('logs which credential variables are unset', () => {
    setEnv({});
    const failure = classifyStorageError(credentialsProviderError());
    expect(failure.logDetail).toContain('AWS_ACCESS_KEY_ID');
    expect(failure.logDetail).toContain('AWS_SECRET_ACCESS_KEY');
  });

  it('says the values were rejected when the variables are present', () => {
    setEnv({ AWS_ACCESS_KEY_ID: 'AKIA_EXAMPLE', AWS_SECRET_ACCESS_KEY: 'secret_example' });
    const failure = classifyStorageError(credentialsProviderError());
    expect(failure.logDetail).toMatch(/rejected/i);
  });

  it('maps missing configuration and names it in the log only', () => {
    const failure = classifyStorageError(new StorageConfigError(['AWS_BUCKET_NAME']));
    expect(failure.status).toBe(503);
    expect(failure.message).toMatch(/configuration is missing/i);
    expect(failure.logDetail).toContain('AWS_BUCKET_NAME');
    expect(failure.message).not.toContain('AWS_BUCKET_NAME');
  });
});

describe('classification of failures that surface on the upload itself', () => {
  it('distinguishes rejected credentials', () => {
    for (const name of ['InvalidAccessKeyId', 'SignatureDoesNotMatch']) {
      expect(classifyStorageError(s3Error(name, 403)).message).toMatch(/credentials are invalid/i);
    }
  });

  it('distinguishes denied access', () => {
    expect(classifyStorageError(s3Error('AccessDenied', 403)).message).toMatch(/access was denied/i);
  });

  it('distinguishes a missing bucket', () => {
    expect(classifyStorageError(s3Error('NoSuchBucket', 404)).message).toMatch(/bucket was not found/i);
  });

  it('distinguishes a region mismatch', () => {
    expect(classifyStorageError(s3Error('PermanentRedirect', 301)).message).toMatch(/region configuration/i);
  });

  it('distinguishes a transient outage', () => {
    expect(classifyStorageError(s3Error('ServiceUnavailable', 503)).message).toMatch(/temporarily unavailable/i);
    expect(classifyStorageError(s3Error('TimeoutError')).message).toMatch(/temporarily unavailable/i);
  });

  it('falls back without pretending to know more than it does', () => {
    const failure = classifyStorageError(new Error('something unexpected'));
    expect(failure.status).toBe(500);
    expect(failure.message).toMatch(/could not generate the upload url/i);
  });
});

describe('nothing sensitive reaches the client', () => {
  it('never puts a key, endpoint or request id in a user message', () => {
    setEnv({ AWS_ACCESS_KEY_ID: 'AKIA_SUPER_SECRET', AWS_SECRET_ACCESS_KEY: 'shhh_secret_value' });
    const errors: unknown[] = [
      credentialsProviderError(),
      s3Error('AccessDenied', 403),
      s3Error('NoSuchBucket', 404),
      new StorageConfigError(['AWS_BUCKET_NAME']),
      Object.assign(new Error('boom'), {
        name: 'S3ServiceException',
        $metadata: { httpStatusCode: 500, requestId: 'REQ-123-ABC' },
      }),
    ];
    for (const error of errors) {
      const { message, logDetail } = classifyStorageError(error);
      for (const secret of ['AKIA_SUPER_SECRET', 'shhh_secret_value', 'REQ-123-ABC']) {
        expect(message).not.toContain(secret);
        expect(logDetail).not.toContain(secret);
      }
    }
  });

  it('always produces a non-empty, human-readable message', () => {
    for (const error of [credentialsProviderError(), s3Error('AccessDenied'), new Error('x'), null, undefined]) {
      const { message } = classifyStorageError(error);
      expect(message.length).toBeGreaterThan(15);
      expect(message).toMatch(/[.!]$/);
    }
  });

  it('recognises its own configuration error type', () => {
    expect(isStorageConfigError(new StorageConfigError(['AWS_REGION']))).toBe(true);
    expect(isStorageConfigError(credentialsProviderError())).toBe(false);
  });
});
