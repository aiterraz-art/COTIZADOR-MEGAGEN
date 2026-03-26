import type {
  CommissionCompanyConfig,
  CommissionCompanyKey,
  CommissionProductClass,
} from '../types/commissions';

export interface CommissionCompanyDefinition {
  companyKey: CommissionCompanyKey;
  companyLabel: string;
  requiresProductClass: boolean;
  availableClasses: CommissionProductClass[];
  summaryLayout: 'single' | 'dual';
}

export const COMMISSION_COMPANY_DEFINITIONS: Record<CommissionCompanyKey, CommissionCompanyDefinition> = {
  megagen: {
    companyKey: 'megagen',
    companyLabel: 'MegaGen',
    requiresProductClass: false,
    availableClasses: ['MEGAGEN'],
    summaryLayout: 'single',
  },
  '3dental': {
    companyKey: '3dental',
    companyLabel: '3Dental',
    requiresProductClass: true,
    availableClasses: ['IMPLANTES', '3DENTAL'],
    summaryLayout: 'dual',
  },
};

export const createDefaultCommissionConfig = (companyKey: CommissionCompanyKey): CommissionCompanyConfig => ({
  companyKey,
  globalRatePercent: null,
  implantRatePercent: null,
  threeDentalRatePercent: null,
  exclusionRules: [],
});
