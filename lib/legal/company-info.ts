export const legalCompanyInfo = {
  legalEntityName: "[LEGAL ENTITY NAME]",
  brandName: "[BRAND NAME]",
  websiteUrl: "[WEBSITE URL]",
  effectiveDate: "[EFFECTIVE DATE]",
  businessAddress: "[BUSINESS ADDRESS]",
  privacyEmail: "[PRIVACY EMAIL]",
  supportEmail: "[SUPPORT EMAIL]",
  contactEmail: "[CONTACT EMAIL]",
  state: "[STATE]",
  stateCounty: "[STATE/COUNTY]"
} as const;

export const legalPlaceholderValues: Record<string, string> = {
  "[LEGAL ENTITY NAME]": legalCompanyInfo.legalEntityName,
  "[BRAND NAME]": legalCompanyInfo.brandName,
  "[WEBSITE URL]": legalCompanyInfo.websiteUrl,
  "[EFFECTIVE DATE]": legalCompanyInfo.effectiveDate,
  "[BUSINESS ADDRESS]": legalCompanyInfo.businessAddress,
  "[PRIVACY EMAIL]": legalCompanyInfo.privacyEmail,
  "[SUPPORT EMAIL]": legalCompanyInfo.supportEmail,
  "[CONTACT EMAIL]": legalCompanyInfo.contactEmail,
  "[STATE]": legalCompanyInfo.state,
  "[STATE/COUNTY]": legalCompanyInfo.stateCounty
};
