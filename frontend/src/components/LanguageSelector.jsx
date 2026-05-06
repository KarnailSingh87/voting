import { useEffect, useState, useRef } from 'react';
import i18n from '../i18n';
import { useTranslation } from 'react-i18next';

const ALL_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'zh', label: '中文' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'mr', label: 'मराठी' },
  { code: 'gu', label: 'ગુજરાતી' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'ur', label: 'اردو' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' }
];

export default function LanguageSelector() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // single language selection (string). Stored value is a string like 'en' or 'hi'.
  const [selected, setSelected] = useState(() => {
    try {
      // prefer new key, fallback to legacy prefs
      const stored = localStorage.getItem('voterLang') || localStorage.getItem('voterLangPrefs');
      return stored ? (typeof stored === 'string' ? stored : stored) : (i18n.language || 'en');
    } catch (e) {
      return i18n.language || 'en';
    }
  });
  const ref = useRef();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // apply active language whenever selected changes
    if (!selected) return;
    i18n.options.fallbackLng = [selected];
    i18n.changeLanguage(selected);
    try { localStorage.setItem('voterLang', selected); } catch (e) {}

    // Synchronize Google Translate to translate backend-generated data
    try {
      document.cookie = `googtrans=/en/${selected}; path=/`;
      // domain cookie may throw on localhost or unusual domains; keep it best-effort
      try {
        document.cookie = `googtrans=/en/${selected}; domain=.${document.domain}; path=/`;
      } catch (_) {}
    } catch (_) {}

    const triggerTranslate = () => {
      if (!mountedRef.current) return;
      try {
        const googleSelect = document.querySelector('.goog-te-combo');
        if (!googleSelect) return;
        if (googleSelect.value !== selected) {
          googleSelect.value = selected;
          // Dispatching change can cause 3rd-party code to mutate DOM; wrap safely.
          try { googleSelect.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
        }
      } catch (_) {
        // ignore DOM mutation errors from 3rd-party translate widget
      }
    };

    // Defer until after React commits and the 3rd-party widget is mounted
    const rafId = window.requestAnimationFrame(triggerTranslate);
    const t1 = window.setTimeout(triggerTranslate, 300);
    const t2 = window.setTimeout(triggerTranslate, 800);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [selected]);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function toggleLang(code) {
    // single-select: apply immediately and close
    setSelected(code);
    setOpen(false);
  }

  return (
    <div className="relative notranslate" translate="no" ref={ref}>
      <button
        className="px-2 py-0.5 rounded bg-cyan-600 text-white text-sm"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
  {ALL_LANGS.find(l => l.code === selected)?.label || 'Lang'}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded shadow z-50 p-2">
          <div className="mb-1 text-sm font-medium">{t('choose_language') || 'Choose language'}</div>
          <div className="mb-2">
            {ALL_LANGS.map(l => (
              <label
                key={l.code}
                className="flex items-center justify-between gap-1 p-1 hover:bg-gray-100 rounded transition transform duration-100 ease-in-out hover:translate-x-1"
              >
                <div className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="voter-lang"
                    checked={selected === l.code}
                    onChange={() => toggleLang(l.code)}
                    className="sr-only"
                  />
                  <span className="text-sm">{l.label}</span>
                </div>
                <svg
                  className={`w-3 h-3 text-green-600 transform transition duration-200 ease-out pointer-events-none ${selected === l.code ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                >
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.071 7.071a1 1 0 01-1.414 0l-3.182-3.182a1 1 0 011.414-1.414L9 11.586l6.364-6.364a1 1 0 011.343-.929z" clipRule="evenodd" />
                </svg>
              </label>
            ))}
          </div>
          {/* solid i-box, no scrollbar, no transparency */}
        </div>
      )}
    </div>
  );
}
