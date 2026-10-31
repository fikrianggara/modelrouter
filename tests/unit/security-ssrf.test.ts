import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isPrivateOrBlockedIpv4,
  isPrivateOrBlockedIpv6,
  isBlockedHostname,
  validateOutboundUrl,
  isSafeEgressUrl,
} from '../../src/core/security';
import { ModelSpecSchema } from '../../src/engine/registry';

describe('SSRF IP Subnet & Egress Security (VULN-04, TKT-028)', () => {
  const originalEnv = process.env.ALLOW_PRIVATE_EGRESS;

  beforeEach(() => {
    delete process.env.ALLOW_PRIVATE_EGRESS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_PRIVATE_EGRESS = originalEnv;
    } else {
      delete process.env.ALLOW_PRIVATE_EGRESS;
    }
  });

  describe('IPv4 Subnet Filtering', () => {
    it('blocks loopback addresses (127.0.0.0/8)', () => {
      expect(isPrivateOrBlockedIpv4('127.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIpv4('127.0.0.2')).toBe(true);
      expect(isPrivateOrBlockedIpv4('127.255.255.255')).toBe(true);
    });

    it('blocks 0.0.0.0/8 and broadcast/multicast', () => {
      expect(isPrivateOrBlockedIpv4('0.0.0.0')).toBe(true);
      expect(isPrivateOrBlockedIpv4('224.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIpv4('255.255.255.255')).toBe(true);
    });

    it('blocks private network 10.0.0.0/8', () => {
      expect(isPrivateOrBlockedIpv4('10.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIpv4('10.254.1.1')).toBe(true);
      expect(isPrivateOrBlockedIpv4('10.255.255.255')).toBe(true);
    });

    it('blocks private network 172.16.0.0/12', () => {
      expect(isPrivateOrBlockedIpv4('172.16.0.1')).toBe(true);
      expect(isPrivateOrBlockedIpv4('172.24.10.5')).toBe(true);
      expect(isPrivateOrBlockedIpv4('172.31.255.255')).toBe(true);
      // Public 172.x should not be blocked by 172.16/12
      expect(isPrivateOrBlockedIpv4('172.15.255.255')).toBe(false);
      expect(isPrivateOrBlockedIpv4('172.32.0.1')).toBe(false);
    });

    it('blocks private network 192.168.0.0/16', () => {
      expect(isPrivateOrBlockedIpv4('192.168.0.1')).toBe(true);
      expect(isPrivateOrBlockedIpv4('192.168.1.100')).toBe(true);
      expect(isPrivateOrBlockedIpv4('192.168.255.255')).toBe(true);
      // Public 192.x outside 168 should not be blocked
      expect(isPrivateOrBlockedIpv4('192.169.1.1')).toBe(false);
    });

    it('blocks link-local and cloud metadata (169.254.0.0/16)', () => {
      expect(isPrivateOrBlockedIpv4('169.254.169.254')).toBe(true);
      expect(isPrivateOrBlockedIpv4('169.254.1.1')).toBe(true);
    });

    it('permits public routable IPv4 addresses', () => {
      expect(isPrivateOrBlockedIpv4('8.8.8.8')).toBe(false);
      expect(isPrivateOrBlockedIpv4('1.1.1.1')).toBe(false);
      expect(isPrivateOrBlockedIpv4('142.250.190.46')).toBe(false);
    });
  });

  describe('IPv6 Filtering', () => {
    it('blocks IPv6 loopback (::1) and unspecified (::)', () => {
      expect(isPrivateOrBlockedIpv6('::1')).toBe(true);
      expect(isPrivateOrBlockedIpv6('::')).toBe(true);
      expect(isPrivateOrBlockedIpv6('0:0:0:0:0:0:0:1')).toBe(true);
    });

    it('blocks IPv6 Unique Local Addresses (fc00::/7)', () => {
      expect(isPrivateOrBlockedIpv6('fc00::1')).toBe(true);
      expect(isPrivateOrBlockedIpv6('fd12:3456:789a::1')).toBe(true);
    });

    it('blocks IPv6 Link-Local (fe80::/10)', () => {
      expect(isPrivateOrBlockedIpv6('fe80::1')).toBe(true);
      expect(isPrivateOrBlockedIpv6('fe80::200:5aee:feaa:20a2')).toBe(true);
    });

    it('blocks IPv4-mapped IPv6 pointing to private/loopback', () => {
      expect(isPrivateOrBlockedIpv6('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIpv6('::ffff:10.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIpv6('::ffff:169.254.169.254')).toBe(true);
    });
  });

  describe('Blocked Hostnames', () => {
    it('blocks localhost and *.localhost', () => {
      expect(isBlockedHostname('localhost')).toBe(true);
      expect(isBlockedHostname('sub.localhost')).toBe(true);
      expect(isBlockedHostname('dev.local.localhost')).toBe(true);
    });

    it('blocks cloud metadata hostnames', () => {
      expect(isBlockedHostname('metadata.google.internal')).toBe(true);
      expect(isBlockedHostname('instance-data')).toBe(true);
      expect(isBlockedHostname('metadata')).toBe(true);
    });

    it('allows standard public hostnames', () => {
      expect(isBlockedHostname('api.openai.com')).toBe(false);
      expect(isBlockedHostname('api.anthropic.com')).toBe(false);
      expect(isBlockedHostname('openrouter.ai')).toBe(false);
    });
  });

  describe('validateOutboundUrl', () => {
    it('rejects loopback URLs', () => {
      expect(validateOutboundUrl('http://127.0.0.1:8080/v1').ok).toBe(false);
      expect(validateOutboundUrl('http://localhost:11434/v1').ok).toBe(false);
      expect(validateOutboundUrl('http://[::1]:8080/v1').ok).toBe(false);
    });

    it('rejects private network URLs', () => {
      expect(validateOutboundUrl('http://10.0.0.5:8000/api').ok).toBe(false);
      expect(validateOutboundUrl('http://172.16.1.1:8080').ok).toBe(false);
      expect(validateOutboundUrl('http://192.168.1.1:80/status').ok).toBe(false);
    });

    it('rejects cloud metadata URL (169.254.169.254)', () => {
      const res = validateOutboundUrl('http://169.254.169.254/latest/meta-data/');
      expect(res.ok).toBe(false);
      expect(res.reason).toContain('metadata');
    });

    it('rejects non-http/https protocols', () => {
      expect(validateOutboundUrl('file:///etc/passwd').ok).toBe(false);
      expect(validateOutboundUrl('gopher://127.0.0.1:70').ok).toBe(false);
      expect(validateOutboundUrl('ftp://example.com/file').ok).toBe(false);
    });

    it('allows public HTTPS URLs', () => {
      expect(validateOutboundUrl('https://api.openai.com/v1').ok).toBe(true);
      expect(validateOutboundUrl('https://api.anthropic.com/v1').ok).toBe(true);
      expect(validateOutboundUrl('http://8.8.8.8:8080/api').ok).toBe(true);
    });

    it('permits loopback and private subnets when ALLOW_PRIVATE_EGRESS=true', () => {
      process.env.ALLOW_PRIVATE_EGRESS = 'true';
      expect(validateOutboundUrl('http://127.0.0.1:11434/v1').ok).toBe(true);
      expect(validateOutboundUrl('http://localhost:11434/v1').ok).toBe(true);
      expect(validateOutboundUrl('http://192.168.1.1:8080').ok).toBe(true);
      // Still rejects invalid protocols
      expect(validateOutboundUrl('file:///etc/passwd').ok).toBe(false);
    });

    it('honors options.allowPrivate explicit parameter', () => {
      expect(validateOutboundUrl('http://127.0.0.1:8080', { allowPrivate: true }).ok).toBe(true);
      expect(validateOutboundUrl('http://127.0.0.1:8080', { allowPrivate: false }).ok).toBe(false);
    });
  });

  describe('ModelSpecSchema SSRF Validation', () => {
    it('rejects model registration targeting cloud metadata when private egress disabled', () => {
      const spec = {
        id: 'malicious-metadata',
        provider: 'custom',
        upstream_model: 'custom-model',
        base_url: 'http://169.254.169.254/latest/meta-data',
        complexity_range: [0, 5],
      };
      expect(() => ModelSpecSchema.parse(spec)).toThrow();
    });

    it('accepts valid public model registration', () => {
      const spec = {
        id: 'valid-cloud',
        provider: 'openai',
        upstream_model: 'gpt-4o',
        base_url: 'https://api.openai.com/v1',
        complexity_range: [2, 5],
      };
      const parsed = ModelSpecSchema.parse(spec);
      expect(parsed.id).toBe('valid-cloud');
      expect(parsed.base_url).toBe('https://api.openai.com/v1');
    });
  });
});
