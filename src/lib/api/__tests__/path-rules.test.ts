import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPathAllowedForRole } from '../path-rules';

// F1 strict rules cover only /pengaturan/anggota — every other path falls
// through with session-only auth (returns true).

test('SUPER_ADMIN can access /pengaturan/anggota and subroutes', () => {
  assert.equal(isPathAllowedForRole('/pengaturan/anggota', 'SUPER_ADMIN'), true);
  assert.equal(isPathAllowedForRole('/pengaturan/anggota/baru', 'SUPER_ADMIN'), true);
  assert.equal(isPathAllowedForRole('/pengaturan/anggota/ANG-1', 'SUPER_ADMIN'), true);
  assert.equal(isPathAllowedForRole('/pengaturan/anggota/ANG-1/edit', 'SUPER_ADMIN'), true);
});

test('SUPER_ADMIN can access /api/pengaturan/anggota endpoints', () => {
  assert.equal(isPathAllowedForRole('/api/pengaturan/anggota', 'SUPER_ADMIN'), true);
  assert.equal(isPathAllowedForRole('/api/pengaturan/anggota/ANG-1', 'SUPER_ADMIN'), true);
  assert.equal(isPathAllowedForRole('/api/pengaturan/anggota/ANG-1/reset-pin', 'SUPER_ADMIN'), true);
  assert.equal(isPathAllowedForRole('/api/pengaturan/anggota/roles', 'SUPER_ADMIN'), true);
});

test('BENDAHARA blocked from /pengaturan/anggota', () => {
  assert.equal(isPathAllowedForRole('/pengaturan/anggota', 'BENDAHARA'), false);
  assert.equal(isPathAllowedForRole('/pengaturan/anggota/baru', 'BENDAHARA'), false);
  assert.equal(isPathAllowedForRole('/api/pengaturan/anggota', 'BENDAHARA'), false);
});

test('ADMIN_QURBAN / PENDAFTARAN / DISTRIBUSI blocked from anggota routes', () => {
  for (const peran of ['ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI']) {
    assert.equal(
      isPathAllowedForRole('/pengaturan/anggota', peran),
      false,
      `${peran} should be blocked`
    );
    assert.equal(
      isPathAllowedForRole('/api/pengaturan/anggota/ANG-1/deactivate', peran),
      false,
      `${peran} should be blocked from API`
    );
  }
});

test('existing SKM routes fall through (no rule = allowed) for every role', () => {
  const skmRoutes = [
    '/',
    '/transaksi',
    '/transaksi/baru',
    '/kategori',
    '/rekening',
    '/donatur',
    '/laporan',
    '/import-csv',
    '/rekonsiliasi',
    '/pengaturan',                    // bare /pengaturan, NOT /pengaturan/anggota
    '/pengaturan/kategori',
    '/pengaturan/reminder',
    '/api/transaksi',
    '/api/kategori',
    '/api/master',
  ];
  const peran = ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI'];
  for (const path of skmRoutes) {
    for (const p of peran) {
      assert.equal(
        isPathAllowedForRole(path, p),
        true,
        `${path} should be allowed for ${p} (no strict rule applies in F1)`
      );
    }
  }
});

test('partial-prefix tricks do NOT bypass the gate', () => {
  // /pengaturan/anggotasnone-of-your-business looks similar but the regex
  // requires a path separator or end-of-string after `anggota`.
  assert.equal(isPathAllowedForRole('/pengaturan/anggotalain', 'BENDAHARA'), true);
  assert.equal(isPathAllowedForRole('/pengaturan/anggotalain', 'SUPER_ADMIN'), true);
  // Exact match — gate fires
  assert.equal(isPathAllowedForRole('/pengaturan/anggota', 'BENDAHARA'), false);
});

test('unknown peran value blocked from gated paths', () => {
  // Defense-in-depth: if a malformed token somehow ships a bogus peran,
  // strict gates still reject.
  assert.equal(isPathAllowedForRole('/pengaturan/anggota', 'HACKER'), false);
  assert.equal(isPathAllowedForRole('/pengaturan/anggota', ''), false);
});
