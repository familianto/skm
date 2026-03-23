import { sheetsService } from './google-sheets';
import { SHEET_NAMES, ID_PREFIXES } from './constants';
import { AuditAksi } from '@/types';
import { nowISO } from './utils';

/**
 * Append an audit log entry to the audit_log sheet
 */
export async function logAudit(
  aksi: AuditAksi,
  entitas: string,
  entitasId: string,
  detail: string,
  userInfo: string = 'System'
): Promise<void> {
  try {
    const id = await sheetsService.getNextId(ID_PREFIXES.AUDIT_LOG);
    const timestamp = nowISO();

    await sheetsService.appendRow(SHEET_NAMES.AUDIT_LOG, [
      id,
      timestamp,
      aksi,
      entitas,
      entitasId,
      detail,
      userInfo,
    ]);
  } catch (error) {
    // Audit logging should not break the main operation
    console.error('Failed to write audit log:', error);
  }
}
