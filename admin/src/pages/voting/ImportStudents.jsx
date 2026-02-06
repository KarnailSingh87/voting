/* global Set */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from '../../utils/axios';

const ImportStudents = () => {
  const [file, setFile] = useState(null);
  const [previewLimit, setPreviewLimit] = useState('500');
  const [previewTotalParsed, setPreviewTotalParsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [previewRows, setPreviewRows] = useState(null);
  const [selectedPreviewRows, setSelectedPreviewRows] = useState(new Set());
  const [previewHeaders, setPreviewHeaders] = useState(null);
  const [elections, setElections] = useState([]);
  const [selectedElection, setSelectedElection] = useState('');
  const [importDefaults, setImportDefaults] = useState(null);
  const [confirmImport, setConfirmImport] = useState(false);
  // auto-send OTP removed per request
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
    setError('');
  };

  const downloadTemplate = () => {
    // Template columns in requested sequence: id_number, name, father_name, email, blood_group, mobile, photo, branch, category, batch, sequence
    const headers = ['id_number', 'name', 'father_name', 'email', 'blood_group', 'mobile', 'photo', 'branch', 'category', 'batch'];
    // Example row values: id_number, name, father's name, email, blood group, mobile, photo (filename or base64), branch, category, batch, sequence
    const example = ['ID12345', 'John Doe', 'Rahul Kumar', 'john@example.com', 'A+', '+911234567890', 'photo.jpg', 'CSE', 'GEN', '2023-2027'];
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
    // If a preview exists, require at least one preview row selected
    if (previewRows && previewRows.length > 0 && (!selectedPreviewRows || selectedPreviewRows.size === 0)) {
      setError('Please select at least one preview row to import');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
  fd.append('electionId', selectedElection);
      // include selected preview rows (if user previewed and selected a subset)
      if (selectedPreviewRows && selectedPreviewRows.size > 0) {
        fd.append('selectedRows', JSON.stringify(Array.from(selectedPreviewRows)));
      }
      const res = await axios.post('/api/admin/import-students', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      setPreviewRows(null);
      setPreviewHeaders(null);
      setConfirmImport(false);
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
  const fetchPreview = async (limit) => {
    if (!file) return setError('Please choose a file');
    setPreviewing(true); setError(''); setPreviewRows(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('electionId', selectedElection);
  // include election importConcepts as guidance to backend
  if (importDefaults) fd.append('importConcepts', JSON.stringify(importDefaults));
      fd.append('preview', '1');
      fd.append('previewLimit', limit || previewLimit);
  if (importDefaults) fd.append('importConcepts', JSON.stringify(importDefaults));
      const res = await axios.post('/api/admin/import-students', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data && res.data.preview) {
        const p = res.data.preview;
        setPreviewHeaders(p.headers || null);
        setPreviewRows(p.rows || []);
        setPreviewTotalParsed(res.data.totalParsed || (p.rows && p.rows.length) || null);
        // clear previous confirmation because preview changed
        setConfirmImport(false);
        // default select all preview rows when preview is loaded
        const allIdx = new Set();
        (p.rows || []).forEach((_, i) => allIdx.add(i));
        setSelectedPreviewRows(allIdx);
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

  const handlePreview = async (e) => { e && e.preventDefault(); await fetchPreview(); };

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

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Import Students / Voter Master List</h2>
  <p className="text-sm text-gray-600 mb-4">Upload an Excel (.xlsx), CSV or a ZIP containing a CSV/XLSX plus image files. If you want to import profile images, upload a ZIP with the CSV/XLSX and the image files — the CSV <code>photo</code> column should contain the image filename (e.g. <code>alice.jpg</code>).</p>
  <form onSubmit={handleSubmit} className="space-y-4">
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
          <button data-testid="preview-btn" type="button" onClick={handlePreview} disabled={previewing} className="px-4 py-2 bg-yellow-600 text-white rounded">
            {previewing ? 'Previewing...' : 'Preview'}
          </button>
          <button
            data-testid="import-btn"
            type="submit"
            disabled={loading || !confirmImport || (previewRows && previewRows.length > 0 && selectedPreviewRows.size === 0)}
            className={`px-4 py-2 ${(loading || !confirmImport || (previewRows && previewRows.length > 0 && selectedPreviewRows.size === 0)) ? 'bg-cyan-300' : 'bg-cyan-600'} text-white rounded`}
          >
            {loading ? 'Uploading...' : 'Import to DB'}
          </button>
          <button type="button" onClick={() => { setFile(null); setResult(null); setError(''); }} className="px-3 py-2 border rounded">Reset</button>
        </div>

  <div className="flex items-center space-x-4">
          <div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Election (optional)</label>
            <select value={selectedElection} onChange={e => setSelectedElection(e.target.value)} className="mt-1 block w-56 px-3 py-2 border rounded">
              <option value="">(None - import to master list)</option>
              {elections.map(ev => (
                <option key={ev._id} value={ev._id}>{ev.title}</option>
              ))}
            </select>
          </div>
        </div>
        {importDefaults && (
          <div className="mt-3 text-sm text-gray-600">
            <div><strong>Import defaults:</strong> Roll: {importDefaults.rollField || 'roll'}, Name: {importDefaults.nameField || 'name'}, Email: {importDefaults.emailField || 'email'}, Mobile: {importDefaults.mobileField || 'mobile'}</div>
          </div>
        )}
          <div className="mt-3 flex items-center space-x-3">
          <div className="text-sm text-gray-600">Election selection is optional. Leave blank to import students into the global master voter list. OTP sending has been disabled.</div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Preview rows</label>
            <select value={previewLimit} onChange={e => setPreviewLimit(e.target.value)} className="mt-1 block w-36 px-3 py-2 border rounded">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="pt-6">
            <button type="button" onClick={() => fetchPreview(previewLimit)} className="px-3 py-2 bg-yellow-600 text-white rounded">Preview</button>
          </div>
        </div>
      </form>

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
      <div className="mt-3">
        <label className="inline-flex items-center"><input data-testid="confirm-checkbox" type="checkbox" className="mr-2" checked={confirmImport} onChange={e => setConfirmImport(e.target.checked)} /> <span className="font-medium">I confirm I want to import the uploaded file into the master list</span> <span className="text-sm text-gray-500">(this cannot be undone)</span></label>
      </div>
      {result && (
        <div className="mt-4 p-3 bg-green-50 rounded">
          <div className="text-sm text-green-800">Imported: {result.imported}</div>
        </div>
      )}
      {previewRows && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Preview (first {previewRows.length} rows)</h4>
            <div className="text-xs text-gray-600">Preview showing {previewRows.length} rows · Parsed {previewTotalParsed ?? previewRows.length}</div>
          </div>
          <div className="text-xs text-gray-600 mb-2">Valid: {previewRows.filter(r => r.valid).length} · Invalid: {previewRows.filter(r => !r.valid).length}</div>
          <div className="text-sm text-gray-600 mb-2">Select which rows to import into the DB / election. By default all previewed rows are selected.</div>
          <div className="text-xs text-gray-600 mb-2">Showing parsed rows and all columns found in the file. Rows flagged in red have missing required fields.</div>
          {previewTotalParsed != null && (
            <div className="text-xs text-gray-600 mb-2">Showing {previewRows.length} of {previewTotalParsed} parsed rows. {previewTotalParsed > previewRows.length && (<button type="button" onClick={() => fetchPreview('all')} className="underline text-sm text-blue-600">Load all</button>)}</div>
          )}
          <div className="overflow-auto border rounded max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                    <th className="p-2">
                    <input type="checkbox" checked={previewRows.length>0 && selectedPreviewRows.size===previewRows.length} onChange={(ev)=>{
                      if (ev.target.checked) {
                        const all = new Set(); previewRows.forEach((_,i)=>all.add(i)); setSelectedPreviewRows(all);
                      } else setSelectedPreviewRows(new Set());
                    }} />
                  </th>
                  {/* show headers if available, else show column indexes */}
                  {(previewHeaders || (previewRows[0] && previewRows[0].arr)) && (
                    (previewHeaders || previewRows[0].arr).map((h, ci) => (
                      <th key={ci} className="p-2 text-left">{h ? h : `Col ${ci+1}`}</th>
                    ))
                  )}
                  <th className="p-2 text-left">Extracted Roll</th>
                  <th className="p-2 text-left">Extracted Name</th>
                  <th className="p-2 text-left">Photo</th>
                  <th className="p-2 text-left">Valid</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, idx) => (
                  <tr key={idx} className={r.valid ? (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50') : 'bg-red-50'}>
                    <td className="p-2">
                      <input type="checkbox" checked={selectedPreviewRows.has(idx)} onChange={() => {
                        setSelectedPreviewRows(s => {
                          const ns = new Set(Array.from(s));
                          if (ns.has(idx)) ns.delete(idx); else ns.add(idx);
                          return ns;
                        });
                      }} />
                    </td>
                    {(r.arr || []).map((c, ci) => {
                      const cell = c || '';
                      const s = String(cell);
                      const isDataUrl = /^data:image\/.+;base64,/.test(s);
                      const isImageUrl = /^https?:\/\/.+\.(jpg|jpeg|png|gif|svg)(\?.*)?$/i.test(s);
                      if (isDataUrl || isImageUrl) {
                        return (
                          <td key={ci} className="p-2">
                            <img src={s} alt={`cell-img-${ci}`} className="h-12 w-12 object-cover rounded" />
                          </td>
                        );
                      }
                      return <td key={ci} className="p-2 break-words">{s}</td>;
                    })}
                    <td className="p-2 font-medium">{r.extracted?.roll}</td>
                    <td className="p-2">{r.extracted?.name}</td>
                    <td className="p-2">
                      {r.extracted?.photo ? (
                        <img src={r.extracted.photo} alt={`photo-${idx}`} className="h-12 w-12 object-cover rounded" />
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
