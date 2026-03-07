const FALLBACK_LANGUAGE_NAMES = {
  en: { en: "English", es: "Spanish", pt: "Portuguese", de: "German", fr: "French", nl: "Dutch" },
  es: { en: "Inglés", es: "Español", pt: "Portugués", de: "Alemán", fr: "Francés", nl: "Neerlandés" },
  pt: { en: "Inglês", es: "Espanhol", pt: "Português", de: "Alemão", fr: "Francês", nl: "Neerlandês" },
  de: { en: "Englisch", es: "Spanisch", pt: "Portugiesisch", de: "Deutsch", fr: "Französisch", nl: "Niederländisch" },
  fr: { en: "Anglais", es: "Espagnol", pt: "Portugais", de: "Allemand", fr: "Français", nl: "Néerlandais" },
  nl: { en: "Engels", es: "Spaans", pt: "Portugees", de: "Duits", fr: "Frans", nl: "Nederlands" },
};

export function getLocalizedLanguageName(code, activeLanguage) {
  const normalizedCode = String(code || "").toLowerCase();
  const normalizedActiveLanguage = String(activeLanguage || "en").toLowerCase();

  try {
    if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
      const display = new Intl.DisplayNames([normalizedActiveLanguage], { type: "language" });
      const intlName = display.of(normalizedCode);
      if (intlName) {
        return intlName.charAt(0).toUpperCase() + intlName.slice(1);
      }
    }
  } catch (error) {
    // fall through to static table
  }

  return (
    FALLBACK_LANGUAGE_NAMES[normalizedActiveLanguage]?.[normalizedCode] ||
    FALLBACK_LANGUAGE_NAMES.en?.[normalizedCode] ||
    normalizedCode.toUpperCase()
  );
}
