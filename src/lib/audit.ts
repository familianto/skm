import { sheetsService } from './google-sheets';
import { SHEET_NAMES, ID_PREFIXES } from './constants';
import { AuditAksi } from '@/types';
import { nowISO } from './utils';
import { logger } from './logger';

/**
 * Append an audit log entry to the audit_log sheet.
 *
 * Columns (order MUST match SHEET_HEADERS['audit_log']):
 *   id | timestamp | aksi | entitas | entitas_id | detail | user_info |
 *   user_id | ip_address
 *
 * @param aksi       - The action performed (CREATE, UPDATE, DELETE, etc.)
 * @param entitas    - The entity name (sheet/table name)
 * @param entitasId  - The ID of the affected entity
 * @param detail     - Human-readable or JSON detail about the change
 * @param userId     - The authenticated user ID (from session), or 'System'
 * @param userInfo   - Human-readable user label (nama/role), for display
 * @param ipAddress  - Client IP address (from x-forwarded-for header)
 */
export async function logAudit(
  aksi: AuditAksi,
  entitas: string,
  entitasId: string,
  detail: string,
  userId: string = 'System',
  userInfo: string = 'System',
  ipAddress: string = 'unknown'
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
      userId,
      ipAddress,
    ]);
  } catch (error) {
    // Audit logging should not break the main operation
    logger.error({ message: 'Failed to write audit log', error: String(error), entitas, entitasId, aksi });
  }
}
