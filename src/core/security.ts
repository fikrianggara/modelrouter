import net from 'net';

export interface EgressValidationOptions {
  allowPrivate?: boolean;
}

export interface EgressValidationResult {
  ok: boolean;
  reason?: string;
}

export function isPrivateOrBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a >= 224) return true;

  return false;
}

export function isPrivateOrBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower === '0:0:0:0:0:0:0:1' || lower === '0:0:0:0:0:0:0:0') {
    return true;
  }

  if (lower.startsWith('::ffff:')) {
    const rest = lower.slice(7);
    if (net.isIP(rest) === 4) {
      return isPrivateOrBlockedIpv4(rest);
    }
  }

  if (/^f[cd][0-9a-f]{2}:/i.test(lower) || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }

  if (/^fe[89ab][0-9a-f]:/i.test(lower) || lower.startsWith('fe80:')) {
    return true;
  }

  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) {
    return true;
  }
  if (
    lower === 'metadata.google.internal' ||
    lower === 'instance-data' ||
    lower === 'metadata'
  ) {
    return true;
  }
  return false;
}

// ponytail: DNS resolution check skipped; add dns.lookup when async egress resolution is required
export function validateOutboundUrl(
  urlInput: string,
  options?: EgressValidationOptions
): EgressValidationResult {
  if (!urlInput || typeof urlInput !== 'string') {
    return { ok: false, reason: 'URL must be a non-empty string' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlInput);
  } catch {
    return { ok: false, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `Unsupported protocol '${parsed.protocol}'. Only http: and https: are allowed.` };
  }

  const allowPrivate = options?.allowPrivate !== undefined
    ? options.allowPrivate
    : process.env.ALLOW_PRIVATE_EGRESS === 'true';

  if (allowPrivate) {
    return { ok: true };
  }

  const rawHost = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (isBlockedHostname(rawHost)) {
    return { ok: false, reason: `Disallowed private or metadata hostname: ${rawHost}` };
  }

  const ipVersion = net.isIP(rawHost);
  if (ipVersion === 4 && isPrivateOrBlockedIpv4(rawHost)) {
    return { ok: false, reason: `Disallowed private, loopback, or metadata IPv4 address: ${rawHost}` };
  }

  if (ipVersion === 6 && isPrivateOrBlockedIpv6(rawHost)) {
    return { ok: false, reason: `Disallowed private or loopback IPv6 address: ${rawHost}` };
  }

  return { ok: true };
}

export function isSafeEgressUrl(url: string, options?: EgressValidationOptions): boolean {
  return validateOutboundUrl(url, options).ok;
}
