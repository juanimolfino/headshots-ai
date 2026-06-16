export const legalCompanyInfo = {
  legalEntityName: "Juan Ignacio Molfino",  // tu nombre real
  brandName: "Pic Your AI",                // nombre del producto
  websiteUrl: "https://picyourai.com/",
  effectiveDate: "June 15, 2026",
  businessAddress: "Florida, United State", // tu dirección real
  privacyEmail: "privacy@picyourai.com",
  supportEmail: "support@picyourai.com",
  contactEmail: "juanymolfino@hotmail.com",
  state: "Florida",  // solo si incorporás en EEUU, si no sacalo
  stateCounty: "United States" // solo si incorporás en EEUU, si no sacalo
} as const;

export const legalPlaceholderValues: Record<string, string> = {
  "Juan Ignacio Molfino": legalCompanyInfo.legalEntityName,
  "Pic Your AI": legalCompanyInfo.brandName,
  "https://picyourai.com/": legalCompanyInfo.websiteUrl,
  "June 15, 2026": legalCompanyInfo.effectiveDate,
  "Florida, United State": legalCompanyInfo.businessAddress,
  "privacy@picyourai.com": legalCompanyInfo.privacyEmail,
  "support@picyourai.com": legalCompanyInfo.supportEmail,
  "juanymolfino@hotmail.com": legalCompanyInfo.contactEmail,
  "Florida": legalCompanyInfo.state,
  "United States": legalCompanyInfo.stateCounty
};
