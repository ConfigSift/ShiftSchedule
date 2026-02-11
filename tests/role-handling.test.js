const test = require('node:test');
const assert = require('node:assert/strict');

const baseUrl = process.env.TEST_BASE_URL;
const adminToken = process.env.TEST_ADMIN_TOKEN;
const employeeToken = process.env.TEST_EMPLOYEE_TOKEN;
const targetUserId = process.env.TEST_TARGET_USER_ID;
const organizationId = process.env.TEST_ORG_ID;

const shouldRun = Boolean(baseUrl);

function skipIfMissing(label, value) {
  return !value ? `set ${label} to run this test` : undefined;
}

test('whoami reflects membership role', { skip: !shouldRun || skipIfMissing('TEST_ADMIN_TOKEN', adminToken) }, async () => {
  const res = await fetch(`${baseUrl}/api/debug-whoami`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.memberships));
  assert.ok(json.memberships.length > 0);
});

test('admin actions fail for employee role', { skip: !shouldRun || skipIfMissing('TEST_EMPLOYEE_TOKEN', employeeToken) || skipIfMissing('TEST_TARGET_USER_ID', targetUserId) || skipIfMissing('TEST_ORG_ID', organizationId) }, async () => {
  const res = await fetch(`${baseUrl}/api/admin/set-passcode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${employeeToken}`,
    },
    body: JSON.stringify({
      userId: targetUserId,
      organizationId,
      pinCode: '123456',
    }),
  });
  assert.equal(res.status, 403);
});

test('admin actions succeed for admin role', { skip: !shouldRun || skipIfMissing('TEST_ADMIN_TOKEN', adminToken) || skipIfMissing('TEST_TARGET_USER_ID', targetUserId) || skipIfMissing('TEST_ORG_ID', organizationId) }, async () => {
  const res = await fetch(`${baseUrl}/api/admin/set-passcode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      userId: targetUserId,
      organizationId,
      pinCode: '123456',
    }),
  });
  assert.ok(res.status === 200 || res.status === 409);
});
