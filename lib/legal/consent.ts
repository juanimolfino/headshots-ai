export const LEGAL_TERMS_VERSION = "2026-06-14-draft";
export const LEGAL_PRIVACY_VERSION = "2026-06-14-draft";
export const PHOTO_PROCESSING_CONSENT_VERSION = "2026-06-14-draft";

export type ConsentProfile = {
  acceptedTermsAt?: Date | string | null;
  acceptedPrivacyAt?: Date | string | null;
  legalTermsVersion?: string | null;
  legalPrivacyVersion?: string | null;
  photoProcessingConsentAt?: Date | string | null;
  photoProcessingConsentVersion?: string | null;
};

export function hasCurrentLegalConsent(profile: ConsentProfile | null | undefined) {
  return Boolean(
    profile?.acceptedTermsAt &&
    profile?.acceptedPrivacyAt &&
    profile.legalTermsVersion === LEGAL_TERMS_VERSION &&
    profile.legalPrivacyVersion === LEGAL_PRIVACY_VERSION
  );
}

export function hasCurrentPhotoProcessingConsent(profile: ConsentProfile | null | undefined) {
  return Boolean(
    hasCurrentLegalConsent(profile) &&
    profile?.photoProcessingConsentAt &&
    profile.photoProcessingConsentVersion === PHOTO_PROCESSING_CONSENT_VERSION
  );
}
