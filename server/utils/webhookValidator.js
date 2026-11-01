/**
 * Webhook URL Validator & Dispatch Processor for SSRF Defense
 *
 * Enforces strict destination constraints on user-supplied webhook URLs:
 * 1. Protocol must be HTTPS only.
 * 2. Hostnames must belong to explicitly approved provider allowlists.
 * 3. Prohibits IP addresses (IPv4 / IPv6), private subnets, cloud metadata services, and localhost.
 * 4. Enforces provider-specific path prefixes (e.g., Slack /services/, Discord /api/webhooks/).
 * 5. Prohibits non-standard ports and embedded credentials.
 */

// Explicitly approved webhook service configurations
export const APPROVED_PROVIDERS = {
  slack: {
    allowedHosts: ['hooks.slack.com'],
    pathPrefix: '/services/'
  },
  discord: {
    allowedHosts: ['discord.com', 'discordapp.com'],
    pathPrefix: '/api/webhooks/'
  }
};

// Patterns matching private, internal, or loopback IP addresses / hostnames
const FORBIDDEN_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
  /^metadata\.google\.internal$/i,
  // IPv4 Loopback (127.0.0.0/8)
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  // IPv4 Private (10.0.0.0/8)
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  // IPv4 Private (172.16.0.0/12: 172.16 - 172.31)
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
  // IPv4 Private (192.168.0.0/16)
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  // IPv4 Carrier-grade NAT (100.64.0.0/10: 100.64 - 100.127)
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/,
  // IPv4 Link-local / Cloud Metadata (169.254.0.0/16)
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  // IPv4 Current network (0.0.0.0/8)
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  // IPv6 Loopback, Link-local, Unique-local
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd00:/i
];

/**
 * Validates a webhook URL against SSRF attack vectors and explicit provider requirements.
 *
 * @param {string} rawUrl - The user-supplied webhook destination URL.
 * @param {string} [channel] - Optional expected channel ('slack' | 'discord').
 * @returns {{ valid: boolean, error?: string, parsedUrl?: URL, provider?: string }} Validation outcome.
 */
export function validateWebhookUrl(rawUrl, channel) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'Webhook URL must be a non-empty string.' };
  }

  const trimmedUrl = rawUrl.trim();

  let parsed;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }

  // 1. Strict Protocol Check (HTTPS only)
  if (parsed.protocol !== 'https:') {
    return { 
      valid: false, 
      error: `Insecure URL scheme "${parsed.protocol}". Only "https:" is permitted.` 
    };
  }

  // 2. Reject embedded userinfo (credentials in URL: https://user:pass@host)
  if (parsed.username || parsed.password) {
    return { 
      valid: false, 
      error: 'URLs containing embedded authentication credentials are not permitted.' 
    };
  }

  // 3. Port check: Only standard HTTPS port (443) or default empty port allowed
  if (parsed.port && parsed.port !== '443') {
    return { 
      valid: false, 
      error: `Non-standard port "${parsed.port}" is not permitted. Only standard port 443 is allowed.` 
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 4. Block private IPs, loopback, and internal metadata hosts
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      return { 
        valid: false, 
        error: `Requests to internal or private destination "${hostname}" are forbidden.` 
      };
    }
  }

  // 5. Raw IP address check (reject any raw IPv4 or IPv6 address as hostname)
  const isRawIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.startsWith('[') || hostname.includes(':');
  if (isRawIp) {
    return {
      valid: false,
      error: 'Direct IP address destinations are not permitted. Use verified provider domain names.'
    };
  }

  // 6. Explicit Host & Path Allowlist Check
  const normalizedChannel = channel ? channel.toLowerCase() : null;

  if (normalizedChannel && APPROVED_PROVIDERS[normalizedChannel]) {
    const provider = APPROVED_PROVIDERS[normalizedChannel];
    
    // Strict exact host match (no subdomain tricks like evil.hooks.slack.com or hooks.slack.com.evil.com)
    if (!provider.allowedHosts.includes(hostname)) {
      return {
        valid: false,
        error: `Host "${hostname}" is not an authorized destination for ${normalizedChannel} webhooks. Allowed: ${provider.allowedHosts.join(', ')}`
      };
    }

    if (!parsed.pathname.startsWith(provider.pathPrefix)) {
      return {
        valid: false,
        error: `Invalid webhook path for ${normalizedChannel}. Must begin with "${provider.pathPrefix}".`
      };
    }

    return { valid: true, parsedUrl: parsed, provider: normalizedChannel };
  }

  // If no channel specified, check if it matches ANY approved provider configuration
  for (const [providerName, config] of Object.entries(APPROVED_PROVIDERS)) {
    if (config.allowedHosts.includes(hostname) && parsed.pathname.startsWith(config.pathPrefix)) {
      return { valid: true, parsedUrl: parsed, provider: providerName };
    }
  }

  return {
    valid: false,
    error: `Destination "${hostname}" is not in the approved webhook provider allowlist (Slack, Discord).`
  };
}

/**
 * Process a notification dispatch request with strict SSRF defense.
 *
 * @param {object} body - Request body containing { channel, webhookUrl, email, message }
 * @param {Function} [sendWebhookFn] - Async function (url, data, config) => Promise
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function processNotificationDispatch(body, sendWebhookFn) {
  const { channel, webhookUrl, email, message } = body || {};

  if (channel === 'slack' || channel === 'discord') {
    if (!webhookUrl) {
      return {
        status: 400,
        body: { error: 'BadRequest', message: 'Webhook URL required' }
      };
    }

    const validation = validateWebhookUrl(webhookUrl, channel);
    if (!validation.valid) {
      return {
        status: 400,
        body: { error: 'InvalidWebhookUrl', message: validation.error }
      };
    }

    const sanitizedMessage = typeof message === 'string'
      ? message.slice(0, 2000)
      : 'Update notification from MindReflect AI';

    if (sendWebhookFn) {
      try {
        await sendWebhookFn(
          webhookUrl,
          { text: `🧠 *MindReflect Journal Notification*\n${sanitizedMessage}` },
          {
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' },
            maxRedirects: 0
          }
        );
      } catch (err) {
        return {
          status: 500,
          body: { error: 'InternalServerError', message: 'Notification failed: ' + err.message }
        };
      }
    }

    return {
      status: 200,
      body: { success: true, message: `Notification dispatched to ${channel}` }
    };
  }

  return {
    status: 200,
    body: { success: true, message: `Simulated notification sent to ${email || 'user'}` }
  };
}
