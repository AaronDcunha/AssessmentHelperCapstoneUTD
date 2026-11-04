import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === 'server-only'
    ? { url: 'data:text/javascript,export{}', shortCircuit: true }
    : nextResolve(specifier, context);
} });
await import('../configuration-loader.mjs');
const { emailMessage } = await import('../../src/server/email/transport.ts');
const input = { id: 'template-test', to: 'faculty@example.invalid', title: 'Observer invitation', message: 'Your invitation is ready.\n\nPlease review your available times.' };

test('existing email calls automatically receive the shared template and retain delivery metadata', () => {
  const mail = emailMessage(input);
  assert.match(mail.html, /Assessment Helper/);
  assert.match(mail.html, /<h1[^>]*>Observer invitation<\/h1>/);
  assert.ok(mail.html.includes('Your invitation is ready.<br><br>Please review your available times.'));
  assert.equal(mail.subject, input.title);
  assert.equal(mail.to.address, input.to);
  assert.equal(mail.messageId, '<notification-template-test@assessmenthelper.edu>');
  assert.equal(mail.text, `${input.title}\n\n${input.message}\n\nAssessment Helper\nThis is an automated notification. Please do not reply.`);
});

test('HTML content stays inert while all newline formats remain readable', () => {
  const mail = emailMessage({ ...input, title: '<script>\r\nInjected', message: '<img src="x" onerror="alert(1)"> & \'quoted\'\r\nNext\rLast\nEnd' });
  assert.ok(!mail.html.includes('<script>'));
  assert.ok(!mail.html.includes('<img'));
  assert.ok(mail.html.includes('&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;<br>Next<br>Last<br>End'));
  assert.equal(mail.subject, '<script> Injected');
  assert.throws(() => emailMessage(input, 'sender\r\nInjected'), /Invalid MAIL_FROM/);
});
