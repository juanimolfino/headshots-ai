export const legalCompanyInfo = {
  legalEntityName: "Juan Ignacio Molfino",
  brandName: "Pic Your AI",
  websiteUrl: "https://picyourai.com/",
  effectiveDate: "June 15, 2026",
  businessAddress: "Florida, United State",
  privacyEmail: "privacy@picyourai.com",
  supportEmail: "support@picyourai.com",
  contactEmail: "juanymolfino@hotmail.com",
  state: "Florida",
  stateCounty: "United States"
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
