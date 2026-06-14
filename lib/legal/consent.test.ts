import { describe, expect, it } from "vitest";
import {
  hasCurrentLegalConsent,
  hasCurrentPhotoProcessingConsent,
  LEGAL_PRIVACY_VERSION,
  LEGAL_TERMS_VERSION,
  PHOTO_PROCESSING_CONSENT_VERSION
} from "@/lib/legal/consent";

describe("legal consent helpers", () => {
  it("requires current legal document versions", () => {
    expect(hasCurrentLegalConsent({
      acceptedTermsAt: new Date(),
      acceptedPrivacyAt: new Date(),
      legalTermsVersion: LEGAL_TERMS_VERSION,
      legalPrivacyVersion: LEGAL_PRIVACY_VERSION
    })).toBe(true);

    expect(hasCurrentLegalConsent({
      acceptedTermsAt: new Date(),
      acceptedPrivacyAt: new Date(),
      legalTermsVersion: "old",
      legalPrivacyVersion: LEGAL_PRIVACY_VERSION
    })).toBe(false);
  });

  it("requires legal and facial-photo processing consent for training uploads", () => {
    expect(hasCurrentPhotoProcessingConsent({
      acceptedTermsAt: new Date(),
      acceptedPrivacyAt: new Date(),
      legalTermsVersion: LEGAL_TERMS_VERSION,
      legalPrivacyVersion: LEGAL_PRIVACY_VERSION,
      photoProcessingConsentAt: new Date(),
      photoProcessingConsentVersion: PHOTO_PROCESSING_CONSENT_VERSION
    })).toBe(true);

    expect(hasCurrentPhotoProcessingConsent({
      acceptedTermsAt: new Date(),
      acceptedPrivacyAt: new Date(),
      legalTermsVersion: LEGAL_TERMS_VERSION,
      legalPrivacyVersion: LEGAL_PRIVACY_VERSION
    })).toBe(false);
  });
});
