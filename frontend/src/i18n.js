import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import locale JSON files so translators can edit files under src/locales
import en from './locales/en/translation.json';
import es from './locales/es/translation.json';
import fr from './locales/fr/translation.json';
import de from './locales/de/translation.json';
import pt from './locales/pt/translation.json';
import ru from './locales/ru/translation.json';
import ar from './locales/ar/translation.json';
import bn from './locales/bn/translation.json';
import ur from './locales/ur/translation.json';
import ja from './locales/ja/translation.json';
import ko from './locales/ko/translation.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  ru: { translation: ru },
  ar: { translation: ar },
  bn: { translation: bn },
  ur: { translation: ur },
  ja: { translation: ja }
  ,ko: { translation: ko }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
