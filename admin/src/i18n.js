import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Reuse frontend locale files so translators only maintain one copy
import en from '../../frontend/src/locales/en/translation.json';
import es from '../../frontend/src/locales/es/translation.json';
import fr from '../../frontend/src/locales/fr/translation.json';
import de from '../../frontend/src/locales/de/translation.json';
import pt from '../../frontend/src/locales/pt/translation.json';
import ru from '../../frontend/src/locales/ru/translation.json';
import ar from '../../frontend/src/locales/ar/translation.json';
import bn from '../../frontend/src/locales/bn/translation.json';
import ur from '../../frontend/src/locales/ur/translation.json';
import ja from '../../frontend/src/locales/ja/translation.json';
import ko from '../../frontend/src/locales/ko/translation.json';
import hi from '../../frontend/src/locales/hi/translation.json';
import zh from '../../frontend/src/locales/zh/translation.json';
import pa from '../../frontend/src/locales/pa/translation.json';
import ta from '../../frontend/src/locales/ta/translation.json';
import mr from '../../frontend/src/locales/mr/translation.json';
import gu from '../../frontend/src/locales/gu/translation.json';

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
  ja: { translation: ja },
  ko: { translation: ko }
  ,hi: { translation: hi }
  ,zh: { translation: zh }
  ,pa: { translation: pa }
  ,ta: { translation: ta }
  ,mr: { translation: mr }
  ,gu: { translation: gu }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,
    interpolation: { escapeValue: false }
  });

export default i18n;
