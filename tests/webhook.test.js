import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWebhookUrl, processNotificationDispatch } from '../server/utils/webhookValidator.js';

test('Webhook SSRF Defense — Scheme & Protocol Validation', async (t) => {
  await t.test('should reject plain HTTP URLs', () => {
    const result = validateWebhookUrl('http://hooks.slack.com/services/fixture-team/fixture-channel/fixture-key', 'slack');
    assert.equal(result.valid, false);
    assert.match(result.error, /Insecure URL scheme "http:"/i);
  });

  await t.test('should reject non-HTTP schemes (file, gopher, ftp, javascript)', () => {
    for (const badSchemeUrl of [
      'file:///etc/passwd',
      'gopher://127.0.0.1:6379/_test',
      'ftp://hooks.slack.com/services/test',
      'javascript:alert(1)'
    ]) {
      const result = validateWebhookUrl(badSchemeUrl, 'slack');
      assert.equal(result.valid, false);
    }
  });

  await t.test('should reject non-string and malformed URL inputs', () => {
    assert.equal(validateWebhookUrl(null).valid, false);
    assert.equal(validateWebhookUrl(undefined).valid, false);
    assert.equal(validateWebhookUrl('').valid, false);
    assert.equal(validateWebhookUrl('   ').valid, false);
    assert.equal(validateWebhookUrl('htt ps://bad url').valid, false);
    assert.equal(validateWebhookUrl(12345).valid, false);
  });
});

test('Webhook SSRF Defense — Host & Destination Allowlist', async (t) => {
  await t.test('should reject cloud metadata service (169.254.169.254)', () => {
    const httpMetadata = validateWebhookUrl('http://169.254.169.254/computeMetadata/v1/', 'slack');
    assert.equal(httpMetadata.valid, false);

    const httpsMetadata = validateWebhookUrl('https://169.254.169.254/computeMetadata/v1/', 'slack');
    assert.equal(httpsMetadata.valid, false);
    assert.match(httpsMetadata.error, /internal or private destination|direct ip address/i);
  });

  await t.test('should reject Google internal metadata hostname', () => {
    const result = validateWebhookUrl('https://metadata.google.internal/computeMetadata/v1/', 'slack');
    assert.equal(result.valid, false);
    assert.match(result.error, /internal or private destination/i);
  });

  await t.test('should reject localhost and loopback interfaces (IPv4 and IPv6)', () => {
    const targets = [
      'https://localhost/webhook',
      'http://localhost:8080/admin',
      'https://127.0.0.1/webhook',
      'http://127.0.0.1:3000',
      'https://127.0.0.2/test',
      'https://[::1]/webhook',
      'http://[::1]:8080'
    ];

    for (const url of targets) {
      const result = validateWebhookUrl(url);
      assert.equal(result.valid, false, `Failed to reject: ${url}`);
    }
  });

  await t.test('should reject private RFC-1918 subnets', () => {
    const privateUrls = [
      'https://10.0.0.1/webhook',
      'https://10.255.0.1/api',
      'https://172.16.0.1/webhook',
      'https://172.31.255.255/hook',
      'https://192.168.1.1/router',
      'https://192.168.0.254/admin'
    ];

    for (const url of privateUrls) {
      const result = validateWebhookUrl(url);
      assert.equal(result.valid, false, `Failed to reject: ${url}`);
    }
  });

  await t.test('should reject unapproved third-party domains', () => {
    const unapproved = [
      'https://evil-attacker.com/webhook',
      'https://webhook.site/#!/view/12345',
      'https://requestbin.com/r/test'
    ];

    for (const url of unapproved) {
      const result = validateWebhookUrl(url);
      assert.equal(result.valid, false);
      assert.match(result.error, /not in the approved webhook provider allowlist/i);
    }
  });

  await t.test('should reject subdomain or suffix spoofing attempts', () => {
    const spoofAttempts = [
      'https://hooks.slack.com.attacker.com/services/fixture-team/fixture-channel/fixture-key',
      'https://attackerhooks.slack.com/services/fixture-team/fixture-channel/fixture-key',
      'https://discord.com.evil.org/api/webhooks/mock-id/mock-key',
      'https://fake-discord.com/api/webhooks/mock-id/mock-key'
    ];

    for (const url of spoofAttempts) {
      const result = validateWebhookUrl(url, 'slack');
      assert.equal(result.valid, false, `Failed to reject spoofed host: ${url}`);
    }
  });
});

test('Webhook SSRF Defense — Advanced Bypass Protection', async (t) => {
  await t.test('should reject URLs with embedded credentials (userinfo)', () => {
    const credsUrl = 'https://admin:password@hooks.slack.com/services/fixture-team/fixture-channel/fixture-key';
    const result = validateWebhookUrl(credsUrl, 'slack');
    assert.equal(result.valid, false);
    assert.match(result.error, /embedded authentication credentials/i);
  });

  await t.test('should reject non-standard ports (e.g. 8080, 8443, 22)', () => {
    const portUrl = 'https://hooks.slack.com:8443/services/fixture-team/fixture-channel/fixture-key';
    const result = validateWebhookUrl(portUrl, 'slack');
    assert.equal(result.valid, false);
    assert.match(result.error, /non-standard port/i);
  });

  await t.test('should enforce provider-specific path prefix constraints', () => {
    // Slack requires /services/
    const badSlackPath = validateWebhookUrl('https://hooks.slack.com/api/chat.postMessage', 'slack');
    assert.equal(badSlackPath.valid, false);
    assert.match(badSlackPath.error, /Must begin with "\/services\/"/i);

    // Discord requires /api/webhooks/
    const badDiscordPath = validateWebhookUrl('https://discord.com/api/v10/users/@me', 'discord');
    assert.equal(badDiscordPath.valid, false);
    assert.match(badDiscordPath.error, /Must begin with "\/api\/webhooks\/"/i);
  });

  await t.test('should reject channel/host mismatch', () => {
    // Slack channel with Discord URL
    const slackWithDiscord = validateWebhookUrl(
      'https://discord.com/api/webhooks/mock-id/mock-key', 
      'slack'
    );
    assert.equal(slackWithDiscord.valid, false);
    assert.match(slackWithDiscord.error, /not an authorized destination for slack/i);

    // Discord channel with Slack URL
    const discordWithSlack = validateWebhookUrl(
      'https://hooks.slack.com/services/fixture-team/fixture-channel/fixture-key', 
      'discord'
    );
    assert.equal(discordWithSlack.valid, false);
    assert.match(discordWithSlack.error, /not an authorized destination for discord/i);
  });
});

test('Webhook Validation — Legitimate Approved Webhooks', async (t) => {
  await t.test('should accept legitimate Slack incoming webhook', () => {
    const slackUrl = 'https://hooks.slack.com/services/test-team/test-channel/fixture-webhook-token';
    const result = validateWebhookUrl(slackUrl, 'slack');
    assert.equal(result.valid, true);
    assert.equal(result.parsedUrl.hostname, 'hooks.slack.com');
  });

  await t.test('should accept legitimate Slack webhook with explicit standard port 443', () => {
    const slackUrl = 'https://hooks.slack.com:443/services/test-team/test-channel/fixture-webhook-token';
    const result = validateWebhookUrl(slackUrl, 'slack');
    assert.equal(result.valid, true);
  });

  await t.test('should accept legitimate Discord webhook on discord.com', () => {
    const discordUrl = 'https://discord.com/api/webhooks/test-id/fixture-discord-token';
    const result = validateWebhookUrl(discordUrl, 'discord');
    assert.equal(result.valid, true);
    assert.equal(result.parsedUrl.hostname, 'discord.com');
  });

  await t.test('should accept legitimate Discord webhook on discordapp.com legacy host', () => {
    const discordLegacyUrl = 'https://discordapp.com/api/webhooks/test-id/fixture-legacy-token';
    const result = validateWebhookUrl(discordLegacyUrl, 'discord');
    assert.equal(result.valid, true);
    assert.equal(result.parsedUrl.hostname, 'discordapp.com');
  });

  await t.test('should accept valid webhook without explicit channel argument', () => {
    const slackUrl = 'https://hooks.slack.com/services/test-team/test-channel/fixture-token';
    const result = validateWebhookUrl(slackUrl);
    assert.equal(result.valid, true);
    assert.equal(result.provider, 'slack');
  });
});

test('Notification Dispatch Handler — SSRF Mitigation & Safety Enforcement', async (t) => {
  await t.test('should reject malicious SSRF payload (cloud metadata) with 400', async () => {
    const result = await processNotificationDispatch({
      channel: 'slack',
      webhookUrl: 'http://169.254.169.254/computeMetadata/v1/',
      message: 'steal credentials'
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'InvalidWebhookUrl');
    assert.match(result.body.message, /insecure URL scheme/i);
  });

  await t.test('should reject internal localhost address with 400', async () => {
    const result = await processNotificationDispatch({
      channel: 'discord',
      webhookUrl: 'https://localhost:8080/api/webhooks/admin',
      message: 'probe internal port'
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'InvalidWebhookUrl');
    assert.match(result.body.message, /non-standard port|internal or private destination/i);
  });

  await t.test('should reject missing webhookUrl for slack channel with 400', async () => {
    const result = await processNotificationDispatch({
      channel: 'slack',
      message: 'Hello world'
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'BadRequest');
  });

  await t.test('should safely dispatch valid Slack webhook with mocked HTTP client', async () => {
    let postedUrl = null;
    let postedPayload = null;
    let postedConfig = null;

    const mockSender = async (url, payload, config) => {
      postedUrl = url;
      postedPayload = payload;
      postedConfig = config;
      return { status: 200, data: 'ok' };
    };

    const result = await processNotificationDispatch(
      {
        channel: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/fixture-team/fixture-channel/fixture-key',
        message: 'Reflection log updated'
      },
      mockSender
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(postedUrl, 'https://hooks.slack.com/services/fixture-team/fixture-channel/fixture-key');
    assert.match(postedPayload.text, /Reflection log updated/);
    assert.equal(postedConfig.maxRedirects, 0);
  });

  await t.test('should safely dispatch valid Discord webhook with mocked HTTP client', async () => {
    let postedUrl = null;

    const mockSender = async (url) => {
      postedUrl = url;
      return { status: 200, data: 'ok' };
    };

    const result = await processNotificationDispatch(
      {
        channel: 'discord',
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
        message: 'Daily check-in'
      },
      mockSender
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(postedUrl, 'https://discord.com/api/webhooks/123/abc');
  });

  await t.test('should safely handle simulated email notification channel', async () => {
    const result = await processNotificationDispatch({
      channel: 'email',
      email: 'user@example.com',
      message: 'Your weekly reflection summary'
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.match(result.body.message, /user@example.com/);
  });
});
