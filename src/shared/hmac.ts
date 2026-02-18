import crypto from 'crypto';

/**
 * Validate HMAC signature for payload authenticity
 */
export function validateHMAC(
  payload: Buffer | string | object,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  try {
    const payloadBuffer = Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));

    const expected = crypto
      .createHmac('sha256', secret)
      .update(payloadBuffer)
      .digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
}

/**
 * Generate HMAC signature for testing
 */
export function generateHMAC(payload: object, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}
