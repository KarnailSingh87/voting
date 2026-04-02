import { useEffect, useState, useRef } from 'react';
import i18n from '../i18n';
import { useTranslation } from 'react-i18next';

const ALL_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'ur', label: 'اردو' },
  { code: 'ja', label: '日本語' }
  ,{ code: 'ko', label: '한국어' }
];

export default function LanguageSelector() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => {
    try {
      const stored = localStorage.getItem('voterLangPrefs');
      return stored ? JSON.parse(stored) : [i18n.language || 'en'];
    } catch (e) {
      return [i18n.language || 'en'];
    }
  });
  const [working, setWorking] = useState(selected);
  const ref = useRef();

  useEffect(() => {
    // apply active language/fallbacks whenever selected changes
    if (!selected || selected.length === 0) return;
    i18n.options.fallbackLng = selected;
    i18n.changeLanguage(selected[0]);
    try { localStorage.setItem('voterLangPrefs', JSON.stringify(selected)); } catch (e) {}
  }, [selected]);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function toggleLang(code) {
    setWorking(prev => {
      if (prev.includes(code)) return prev.filter(p => p !== code);
      return [...prev, code];
    });
  }

  function save() {
    setSelected(working.length ? working : [i18n.language || 'en']);
    setOpen(false);
  }

  function cancel() {
    setWorking(selected);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="px-3 py-1 rounded bg-cyan-600 text-white text-sm"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {ALL_LANGS.find(l => selected.includes(l.code))?.label || 'Lang'}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white border rounded shadow z-50 p-3">
          <div className="mb-2 text-sm font-medium">{t('choose_language') || 'Choose language'}</div>
          <div className="max-h-48 overflow-auto mb-3">
            {ALL_LANGS.map(l => (
              <label key={l.code} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                <input
                  type="checkbox"
                  checked={working.includes(l.code)}
                  onChange={() => toggleLang(l.code)}
                  className="w-4 h-4"
                />
                <span className="text-sm">{l.label}</span>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={cancel} className="px-2 py-1 text-sm border rounded">Cancel</button>
            <button onClick={save} className="px-3 py-1 text-sm bg-cyan-600 text-white rounded">Save</button>
          </div>

          <div className="mt-2 text-xs text-gray-500">First selected = active; others = fallbacks</div>
        </div>
      )}
    </div>
  );
}
