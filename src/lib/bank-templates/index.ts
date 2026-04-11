import { muamalatTemplate } from './muamalat';
import type { BankTemplate } from './types';

export type {
  BankTemplate,
  ParsedBankRow,
  CategorizedRow,
  ImportRow,
  ImportStatus,
  SplitParentInfo,
  SplitDraftRow,
} from './types';

const templates: Record<string, BankTemplate> = {
  muamalat: muamalatTemplate,
};

export function getBankTemplate(bankId: string): BankTemplate | null {
  return templates[bankId] || null;
}

export function getAvailableBanks(): { id: string; name: string }[] {
  return Object.values(templates).map((t) => ({ id: t.bankId, name: t.bankName }));
}
