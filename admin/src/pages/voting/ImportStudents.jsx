/* global Set */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from '../../utils/axios';

const ImportStudents = () => {
  const [file, setFile] = useState(null);
  const [previewTotalParsed, setPreviewTotalParsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [previewRows, setPreviewRows] = useState(null);
  const [previewHeaders, setPreviewHeaders] = useState(null);
  const [elections, setElections] = useState([]);
  const [selectedElection, setSelectedElection] = useState('');
  const [importDefaults, setImportDefaults] = useState(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [forceImportUI, setForceImportUI] = useState(false);
  const [rollColSuggestion, setRollColSuggestion] = useState(null);
  const [rollCol, setRollCol] = useState('');
  // auto-send OTP removed per request
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
    setError('');
    // auto-parse file and fetch preview on selection
    const f = e.target.files[0];
    if (f) fetchPreview('500', f);
  };

  const downloadTemplate = () => {
    // Template columns requested by admin: Name, Father's Name, Blood Group, Mobile, Branch, Address, Category, Batch, ID No, Mail ID
    const headers = ['Name', "Father's Name", 'Blood Group', 'Mobile', 'Branch', 'Address', 'Category', 'Batch', 'ID No', 'Mail ID'];
    // Example row values matching the requested column labels
    const example = ['John Doe', "Rahul Kumar", 'A+', '+911234567890', 'CSE', 'MG Road, Bengaluru', 'GEN', '2023-2027', 'ID12345', 'john@example.com'];
    const csv = headers.join(',') + '\n' + example.join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'voters_template.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please choose a file');
      return;
    }
    if (!confirmImport) {
      setError('Please confirm the import by checking the confirmation box');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (forceImportUI) fd.append('force', '1');
    if (rollCol) fd.append('rollCol', rollCol);
    fd.append('electionId', selectedElection);
      // import uses whole file by default (no per-row selection)
      const res = await axios.post('/api/admin/import-students', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      setPreviewRows(null);
      setPreviewHeaders(null);
      setConfirmImport(false);
      setForceImportUI(false);
    } catch (err) {
      // Show detailed error info for network/parsing/backend failures
      const status = err.response?.status;
      const bodyMsg = err.response?.data?.message || err.response?.data || null;
      const clientMsg = err.message || 'Upload failed';
      const composed = bodyMsg ? `${bodyMsg}` : `${clientMsg}`;
      setError(composed + (status ? ` (HTTP ${status})` : ''));
    } finally {
      setLoading(false);
    }
  };

  // central preview fetcher so UI can request first-N or all rows
  const fetchPreview = async (limit, fileParam, rollColParam) => {
    const f = fileParam || file;
    if (!f) return setError('Please choose a file');
    setPreviewing(true); setError(''); setPreviewRows(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('electionId', selectedElection);
      const rc = rollColParam || rollCol;
      if (rc) fd.append('rollCol', rc);
      // include election importConcepts as guidance to backend
      if (importDefaults) fd.append('importConcepts', JSON.stringify(importDefaults));
      fd.append('preview', '1');
      fd.append('previewLimit', limit || 'all');
      if (importDefaults) fd.append('importConcepts', JSON.stringify(importDefaults));
      const res = await axios.post('/api/admin/import-students', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data && res.data.preview) {
        const p = res.data.preview;
        setPreviewHeaders(p.headers || null);
        setPreviewRows(p.rows || []);
        setPreviewTotalParsed(res.data.totalParsed || (p.rows && p.rows.length) || null);
        // clear previous confirmation because preview changed
        setConfirmImport(false);
      } else setError('No preview available');
    } catch (err) {
      const status = err.response?.status;
      const bodyMsg = err.response?.data?.message || err.response?.data || null;
      const clientMsg = err.message || 'Preview failed';
      const composed = bodyMsg ? `${bodyMsg}` : `${clientMsg}`;
      if (!err.response) {
        setError(`${composed} — no response from server. Is the backend running at ${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005'}?`);
      } else {
        setError(composed + (status ? ` (HTTP ${status})` : ''));
      }
    } finally { setPreviewing(false); }
  };

  const handlePreview = async (e) => { e && e.preventDefault(); await fetchPreview('500'); };

  // Guess the roll column from previewRows (simple heuristic)
  const colIndexToLetters = (index) => {
    // 0 -> A, 25 -> Z, 26 -> AA
    let i = index + 1;
    let letters = '';
    while (i > 0) {
      const rem = (i - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      i = Math.floor((i - 1) / 26);
    }
    return letters;
  };

  const guessRollColumn = () => {
    setRollColSuggestion(null);
    if (!previewRows || previewRows.length === 0) return setError('Preview is required to guess roll column. Click Preview first.');
    // determine max columns
    const maxCols = Math.max(...previewRows.map(r => (r.arr || []).length));
    const scores = new Array(maxCols).fill(0);
    previewRows.forEach((r) => {
      const arr = r.arr || [];
      for (let ci = 0; ci < maxCols; ci++) {
        const cell = (arr[ci] || '').toString().trim();
        if (!cell) continue;
        const hasDigits = /\d/.test(cell);
        const digitsOnly = /^\d+$/.test(cell.replace(/\s+/g, ''));
        const digitCount = (cell.match(/\d/g) || []).length;
        const isPhone = digitsOnly && (digitCount >= 10 && digitCount <= 15);
        const isEmail = /\S+@\S+\.\S+/.test(cell);
        const isNameLike = /^[A-Za-z\s\.]+$/.test(cell) && cell.split(' ').length <= 4;
        let sc = 0;
        if (hasDigits) sc += 3;
        if (digitsOnly) sc += 5;
        if (isPhone) sc -= 4;
        if (isEmail) sc -= 3;
        if (isNameLike) sc -= 1;
        // small bonus if cell length between 2 and 20
        if (cell.length >= 2 && cell.length <= 20) sc += 0.5;
        scores[ci] += sc;
      }
    });
    // pick highest score
    let bestIdx = 0; let bestScore = -Infinity;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > bestScore) { bestScore = scores[i]; bestIdx = i; }
    }
    const letter = colIndexToLetters(bestIdx);
    const oneBased = bestIdx + 1;
    setRollColSuggestion({ index: bestIdx, letter, oneBased, score: bestScore });
    return { index: bestIdx, letter, oneBased, score: bestScore };
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get('/api/admin/election');
        if (res.data && mounted) setElections(res.data.elections || []);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  // update import defaults when election changes
  useEffect(() => {
    if (!selectedElection) return setImportDefaults(null);
    const sel = elections.find(ev => ev._id === selectedElection);
    if (sel && sel.importConcepts) setImportDefaults(sel.importConcepts);
    else setImportDefaults(null);
  }, [selectedElection, elections]);

  // read electionId from query params and preselect
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const eid = params.get('electionId');
    if (eid && elections.length > 0) {
      const found = elections.find(ev => ev._id === eid);
      if (found) setSelectedElection(eid);
    }
  }, [location.search, elections]);

  // compute headers to display in preview table
  const computedHeaders = previewHeaders && Array.isArray(previewHeaders)
    ? previewHeaders
    : (previewRows && previewRows[0] && Array.isArray(previewRows[0].arr))
      ? previewRows[0].arr.map((_, i) => `Col ${i + 1}`)
      : [];

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Import Students / Voter Master List</h2>
  <p className="text-sm text-gray-600 mb-4">Upload an Excel (.xlsx), CSV or a ZIP containing a CSV/XLSX plus image files. If you want to import profile images, upload a ZIP with the CSV/XLSX and the image files — the CSV <code>photo</code> column should contain the image filename (e.g. <code>alice.jpg</code>).</p>
  <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Select Election (Optional)</label>
          <select
            data-testid="election-select"
            value={selectedElection}
            onChange={(e) => setSelectedElection(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-cyan-500 focus:border-cyan-500"
          >
            <option value="">-- Global Master List (No specific election) --</option>
            {elections.map((el) => (
              <option key={el._id} value={el._id}>
                {el.title}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {selectedElection 
              ? 'Voters will be associated with the selected election.' 
              : 'Voters will be added to the global master list (available for all elections).'}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">File</label>
          <div className="flex items-center space-x-3">
            <input data-testid="file-input" type="file" accept=".xlsx,.xls,.csv,.tsv,.numbers,.ods,.zip,.pdf" onChange={handleFileChange} className="mt-1" />
            <button type="button" onClick={downloadTemplate} className="px-3 py-1 border rounded text-sm">Download template</button>
          </div>
          <div className="text-sm text-gray-500 mt-1">{file ? file.name : 'No file chosen'} · recommended max 10MB</div>
          <div className="text-xs text-gray-500 mt-1">When uploading images, prefer a ZIP containing: <code>import.csv</code> (or <code>.xlsx</code>) plus image files. Example ZIP layout: <code>/import.csv</code>, <code>/photos/alice.jpg</code> — the CSV should reference <code>alice.jpg</code> in the <code>photo</code> column.</div>
          {file && file.name && file.name.toLowerCase().endsWith('.pdf') && (
            <div className="text-xs text-yellow-700 mt-1">PDF detected — PDF imports require backend OCR/text-extraction. Preview may take longer or be unavailable until OCR completes.</div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            data-testid="import-btn"
            type="submit"
            disabled={loading || !confirmImport}
            className={`px-4 py-2 ${(loading || !confirmImport) ? 'bg-cyan-300' : 'bg-cyan-600'} text-white rounded`}
          >
            {loading ? 'Uploading...' : 'Import to DB'}
          </button>
            <button type="button" onClick={() => { setFile(null); setResult(null); setError(''); setPreviewRows(null); setRollCol(''); setRollColSuggestion(null); }} className="px-3 py-2 border rounded">Reset</button>
            {previewRows && (
              <div className="flex items-center space-x-2">
                <button type="button" onClick={() => { setError(''); guessRollColumn(); }} className="px-3 py-2 border rounded text-sm">Guess roll column</button>
                {rollColSuggestion && (
                  <div className="text-sm text-gray-700">
                    Suggestion: <strong>{rollColSuggestion.letter}</strong> (col {rollColSuggestion.oneBased}) · score {Math.round(rollColSuggestion.score*10)/10}
                    <button type="button" onClick={() => { setRollCol(rollColSuggestion.letter); setRollColSuggestion(null); fetchPreview('500', file, rollColSuggestion.letter); }} className="ml-2 px-2 py-1 text-xs border rounded">Use</button>
                  </div>
                )}
                <div className="flex items-center space-x-1">
                  <label className="text-sm text-gray-600">Manual roll-col:</label>
                  <input value={rollCol} onChange={e => setRollCol(e.target.value)} placeholder="e.g. A or 1" className="px-2 py-1 border rounded text-sm w-20" />
                </div>
              </div>
            )}
        </div>

        
        {importDefaults && (
          <div className="mt-3 text-sm text-gray-600">
            <div><strong>Import defaults:</strong> Roll: {importDefaults.rollField || 'roll'}, Name: {importDefaults.nameField || 'name'}, Email: {importDefaults.emailField || 'email'}, Mobile: {importDefaults.mobileField || 'mobile'}</div>
          </div>
        )}
        
      </form>

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
      <div className="mt-3">
        <div className="flex items-center space-x-4">
          <label className="inline-flex items-center"><input data-testid="confirm-checkbox" type="checkbox" className="mr-2" checked={confirmImport} onChange={e => setConfirmImport(e.target.checked)} /> <span className="font-medium">I confirm I want to import the uploaded file into the master list</span> <span className="text-sm text-gray-500">(this cannot be undone)</span></label>
          <label className="inline-flex items-center text-sm text-gray-700"><input data-testid="force-checkbox" type="checkbox" className="mr-2" checked={forceImportUI} onChange={e => setForceImportUI(e.target.checked)} /> Force import missing fields</label>
        </div>
      </div>
      {result && (
        <div className="mt-4 p-3 bg-green-50 rounded">
          <div className="text-sm text-green-800">
            <strong>✓ Import completed</strong>
            <div>Imported: <strong>{result.imported}</strong> voters</div>
            {result.skipped > 0 && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                <strong>⚠ Skipped: {result.skipped}</strong> rows had validation errors (missing roll or name). 
                {result.skippedRows && result.skippedRows.length > 0 && (
                  <div className="mt-2 text-xs">
                    <strong>First {result.skippedRows.length} skipped rows:</strong>
                    <ul className="list-disc ml-5 mt-1">
                      {result.skippedRows.map((sr, idx) => (
                        <li key={idx}>Row {sr.rowIndex + 1}: {sr.errors.join(', ')}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-2 text-xs">
                  To import rows with missing roll or name numbers, use the <strong>"Force import missing fields"</strong> checkbox and re-upload the file.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {previewRows && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Preview ({previewRows.length} rows with data)</h4>
            <div className="text-xs text-gray-600">Showing {previewRows.length} rows with data · Total parsed: {previewTotalParsed ?? previewRows.length}</div>
          </div>
          <div className="text-sm text-gray-600 mb-2">Showing only rows with data (empty rows filtered out). The preview will fetch automatically when you add a file.</div>
          {previewTotalParsed != null && (
            <div className="text-xs text-gray-600 mb-2">Showing {previewRows.length} of {previewTotalParsed} parsed rows. {previewTotalParsed > previewRows.length && (<button type="button" onClick={() => fetchPreview('all')} className="underline text-sm text-blue-600">Load all</button>)}</div>
          )}
          <div className="overflow-auto border rounded max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                  <tr>
                    {/* show headers if available, else show column indexes */}
                    {computedHeaders && computedHeaders.length > 0 && (
                      computedHeaders.map((h, ci) => (
                        <th key={ci} className="p-2 text-left">{h}</th>
                      ))
                    )}
                    <th className="p-2 text-left">ID No</th>
                    <th className="p-2 text-left">Photo</th>
                    <th className="p-2 text-left">Valid</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, idx) => (
                    <tr key={idx} className={r.valid ? (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50') : 'bg-red-50'}>
                      {(r.arr || []).map((c, ci) => {
                        const cell = c || '';
                        const s = String(cell);
                        const isDataUrl = /^data:image\/.+;base64,/.test(s);
                        const isImageUrl = /^https?:\/\/.+\.(jpg|jpeg|png|gif|svg|webp)(\?.*)?$/i.test(s);
                        if (isDataUrl || isImageUrl) {
                          return (
                            <td key={ci} className="p-2">
                              <img src={s} alt={`cell-img-${ci}`} className="h-8 w-8 object-cover rounded-full border border-gray-200" />
                            </td>
                          );
                        }
                        return <td key={ci} className="p-2 break-words">{s}</td>;
                      })}
                      <td className="p-2 font-medium">{r.extracted?.roll || r.extracted?.id || '—'}</td>
                      <td className="p-2">
                        {r.extracted?.photo ? (
                          <img src={r.extracted.photo} alt={`photo-${idx}`} className="h-8 w-8 object-cover rounded-full border border-gray-200" />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-2">{r.valid ? 'Yes' : (<span className="text-red-600">No: {r.errors?.join(', ')}</span>)}</td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-6">
        <a href="/admin/import" className="text-sm text-gray-500">Refresh or re-open upload to import another file.</a>
      </div>
    </div>
  );
};

export default ImportStudents;
