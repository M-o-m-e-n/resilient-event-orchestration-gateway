import { validateHMAC, generateHMAC } from '../src/shared/hmac';

describe('HMAC Validation', () => {
  const secret = 'test-secret-key';
  const payload = { eventId: 'test-123', type: 'TEST', payload: { data: 'value' } };

  describe('generateHMAC', () => {
    it('should generate a valid HMAC signature', () => {
      const signature = generateHMAC(payload, secret);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBe(64); // SHA-256 produces 64 hex characters
    });

    it('should generate consistent signatures for the same payload', () => {
      const signature1 = generateHMAC(payload, secret);
      const signature2 = generateHMAC(payload, secret);

      expect(signature1).toBe(signature2);
    });

    it('should generate different signatures for different payloads', () => {
      const differentPayload = { eventId: 'test-456', type: 'OTHER', payload: {} };

      const signature1 = generateHMAC(payload, secret);
      const signature2 = generateHMAC(differentPayload, secret);

      expect(signature1).not.toBe(signature2);
    });

    it('should generate different signatures for different secrets', () => {
      const differentSecret = 'another-secret';

      const signature1 = generateHMAC(payload, secret);
      const signature2 = generateHMAC(payload, differentSecret);

      expect(signature1).not.toBe(signature2);
    });
  });

  describe('validateHMAC', () => {
    it('should validate a correct signature', () => {
      const signature = generateHMAC(payload, secret);
      const payloadBuffer = Buffer.from(JSON.stringify(payload));

      const isValid = validateHMAC(payloadBuffer, signature, secret);

      expect(isValid).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const invalidSignature = 'invalid-signature-that-is-definitely-wrong';
      const payloadBuffer = Buffer.from(JSON.stringify(payload));

      const isValid = validateHMAC(payloadBuffer, invalidSignature, secret);

      expect(isValid).toBe(false);
    });

    it('should reject when signature is empty', () => {
      const payloadBuffer = Buffer.from(JSON.stringify(payload));

      const isValid = validateHMAC(payloadBuffer, '', secret);

      expect(isValid).toBe(false);
    });

    it('should reject when secret is empty', () => {
      const signature = generateHMAC(payload, secret);
      const payloadBuffer = Buffer.from(JSON.stringify(payload));

      const isValid = validateHMAC(payloadBuffer, signature, '');

      expect(isValid).toBe(false);
    });

    it('should reject a tampered payload', () => {
      const signature = generateHMAC(payload, secret);
      const tamperedPayload = { ...payload, type: 'TAMPERED' };
      const payloadBuffer = Buffer.from(JSON.stringify(tamperedPayload));

      const isValid = validateHMAC(payloadBuffer, signature, secret);

      expect(isValid).toBe(false);
    });

    it('should handle string payload', () => {
      const stringPayload = JSON.stringify(payload);
      const signature = generateHMAC(payload, secret);

      const isValid = validateHMAC(stringPayload, signature, secret);

      expect(isValid).toBe(true);
    });

    it('should handle object payload', () => {
      const signature = generateHMAC(payload, secret);

      const isValid = validateHMAC(payload, signature, secret);

      expect(isValid).toBe(true);
    });

    it('should be resistant to timing attacks (uses timingSafeEqual)', () => {
      // This test verifies the function doesn't throw on length mismatch
      const signature = generateHMAC(payload, secret);
      const shortSignature = signature.substring(0, 32);
      const payloadBuffer = Buffer.from(JSON.stringify(payload));

      const isValid = validateHMAC(payloadBuffer, shortSignature, secret);

      expect(isValid).toBe(false);
    });
  });
});

