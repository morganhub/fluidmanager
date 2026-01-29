import fr from "./fr.json";
import en from "./en.json";

export type Locale = "fr" | "en";

const dictionaries = { fr, en };

export function getDictionary(locale: Locale = "fr") {
    return dictionaries[locale] || dictionaries.fr;
}

/**
 * Hook-like function to get translated strings
 * Usage: const t = useTranslation('fr');
 *        t('nav.dashboard') // returns "Tableau de bord"
 */
export function createTranslator(locale: Locale = "fr") {
    const dict = getDictionary(locale);

    return function t(key: string): string {
        const keys = key.split(".");
        let value: unknown = dict;

        for (const k of keys) {
            if (value && typeof value === "object" && k in value) {
                value = (value as Record<string, unknown>)[k];
            } else {
                console.warn(`Translation missing: ${key}`);
                return key;
            }
        }

        return typeof value === "string" ? value : key;
    };
}
