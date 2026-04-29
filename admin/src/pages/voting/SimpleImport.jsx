import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';

const SimpleImport = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [elections, setElections] = useState([]);
  const [selectedElection, setSelectedElection] = useState('');
  const [result, setResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const importingRef = useRef(false);

  // Fetch elections on mount
  useEffect(() => {
    const fetchElections = async () => {
      try {
        const res = await axios.get('/api/admin/election');
        if (res.data && res.data.elections) {
          setElections(res.data.elections);
        }
      } catch (e) {
        console.error('Failed to fetch elections', e);
      }
    };
    fetchElections();
  }, []);

  // Pre-select election from URL params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const eid = params.get('electionId');
    if (eid && elections.length > 0) {
      const found = elections.find(ev => ev._id === eid);
      if (found) setSelectedElection(eid);
    }
  }, [location.search, elections]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (selectedFile) => {
    setFile(selectedFile);
    setResult(null);
    setPreviewData(null);
    
    // Auto-preview
    await fetchPreview(selectedFile);
  };

  const fetchPreview = async (fileToPreview) => {
    if (!fileToPreview) return;
    setPreviewing(true);
    try {
      const fd = new FormData();
      fd.append('file', fileToPreview);
      fd.append('preview', '1');
      fd.append('previewLimit', 'all');
      if (selectedElection) fd.append('electionId', selectedElection);

      const res = await axios.post('/api/admin/import-students', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data && res.data.preview) {
        setPreviewData({
          headers: res.data.preview.headers || [],
          rows: res.data.preview.rows || [],
          totalParsed: res.data.totalParsed || 0
        });
      }
    } catch (e) {
      console.error('Preview failed', e);
      toast.error(e.response?.data?.message || 'Failed to preview file');
    } finally {
      setPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Please select a file first');
      return;
    }
    
    // Prevent duplicate import calls
    if (importingRef.current) {
      console.log('Import already in progress');
      return;
    }

    importingRef.current = true;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (selectedElection) fd.append('electionId', selectedElection);

      const res = await axios.post('/api/admin/import-students', fd);

      if (res.data) {
        setResult(res.data);
        const imported = res.data.imported || 0;
        const skipped = res.data.skipped || 0;
        if (imported === 0) {
          toast.warning('No voters were imported. Check that your file has Name and Roll No columns.');
        } else if (skipped > 0) {
          toast.warning(`Imported ${imported} voters, but ${skipped} rows were skipped due to validation errors`);
        } else {
          toast.success(`Successfully imported ${imported} voter${imported !== 1 ? 's' : ''}! Click "View All Voters" to see them.`);
        }
      }
    } catch (e) {
      console.error('Import failed', e);
      toast.error(e.response?.data?.message || 'Import failed');
    } finally {
      setLoading(false);
      importingRef.current = false;
    }
  };

  const downloadTemplate = () => {
    const headers = ['Name', "Father's Name", 'Blood Group', 'Mobile', 'Program', 'Address', 'Category', 'Batch', 'Roll No', 'Photo URL'];
    const example1 = ['John Doe', 'Robert Doe', 'B+', '9876543210', 'B.Tech CSE', 'Vill. Gori PO Kulhera, Tehsil Dhatwal, Distt Hamirpur', 'General', '2023-2027', 'STU001', 'https://example.com/photo1.jpg'];
    const example2 = ['Jane Smith', 'Mark Smith', 'O+', '9876543211', 'B.Tech CSE', 'Vill. Khagal PO Khagal, Teh. Hamirpur, Distt. Hamirpur', 'SC', '2023-2027', 'STU002', 'https://example.com/photo2.jpg'];
    
    // Create worksheet data
    const wsData = [headers, example1, example2];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths for better readability
    ws['!cols'] = [
      { wch: 20 }, // Name
      { wch: 20 }, // Father's Name
      { wch: 15 }, // Blood Group
      { wch: 15 }, // Mobile
      { wch: 15 }, // Program
      { wch: 40 }, // Address
      { wch: 12 }, // Category
      { wch: 12 }, // Batch
      { wch: 12 }, // Roll No
      { wch: 35 }, // Photo URL
    ];
    
    // Style the header row
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '4472C4' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    };
    
    // Apply header style
    headers.forEach((_, idx) => {
      const cellRef = XLSX.utils.encode_col(idx) + '1';
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = headerStyle;
    });
    
    // Create workbook and add worksheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Voters Template');
    
    // Generate and download Excel file
    XLSX.writeFile(wb, 'voters_template.xlsx');
  };

  const resetForm = () => {
    setFile(null);
    setPreviewData(null);
    setResult(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import Voters</h1>
        <p className="text-gray-600 mt-1">Upload a CSV or Excel file to import voters into the system</p>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-lg shadow p-6">
        {/* Election Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Election (Optional)
          </label>
          <select
            value={selectedElection}
            onChange={(e) => setSelectedElection(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          >
            <option value="">-- All Elections (Global List) --</option>
            {elections.map((el) => (
              <option key={el._id} value={el._id}>
                {el.title}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {selectedElection
              ? 'Voters will be linked to this specific election'
              : 'Voters will be added to the global master list'}
          </p>
        </div>

        {/* File Upload Area */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload File
          </label>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-cyan-500 bg-cyan-50'
                : file
                ? 'border-green-400 bg-green-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {file ? (
              <div>
                <div className="text-green-600 text-4xl mb-2">✓</div>
                <p className="text-lg font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
                <button
                  onClick={resetForm}
                  className="mt-3 text-sm text-red-600 hover:text-red-800"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div>
                <div className="text-gray-400 text-4xl mb-2">📁</div>
                <p className="text-gray-600">
                  Drag and drop your file here, or{' '}
                  <label className="text-cyan-600 hover:text-cyan-700 cursor-pointer">
                    browse
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls,.numbers,.ods"
                      onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
                      className="hidden"
                    />
                  </label>
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Supports CSV, Excel (.xlsx, .xls), Numbers, ODS
                </p>
              </div>
            )}
          </div>

          {/* Download Template */}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={downloadTemplate}
              className="text-sm text-cyan-600 hover:text-cyan-700"
            >
              📥 Download template Excel
            </button>
            {previewing && (
              <span className="text-sm text-gray-500">Loading preview...</span>
            )}
          </div>
        </div>

        {/* Preview Table */}
        {previewData && previewData.rows.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">
                Preview ({previewData.rows.length} rows with data)
              </h3>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span>📷 {previewData.rows.filter(r => r.extracted?.photo || r.extracted?.hasPhoto).length} with photos</span>
                <span>·</span>
                <span>Showing {previewData.rows.length} rows · Total parsed: {previewData.totalParsed}</span>
              </div>
            </div>
            <div className="overflow-x-auto border rounded-lg max-h-64">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Photo
                    </th>
                    {previewData.headers.map((h, i) => {
                      // Skip photo/image columns from raw headers since we have a dedicated Photo column
                      const ht = h.trim().toLowerCase();
                      if (/^(photo|photo[_ ]?url|image|image[_ ]?url|avatar|picture|pic)$/.test(ht)) return null;
                      return (
                        <th
                          key={i}
                          className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewData.rows.map((row, idx) => {
                    // Resolve photo: prefer extracted.photo, fallback to scanning arr cells for image URLs/data URIs
                    let photoSrc = row.extracted?.photo || '';
                    const hasPhoto = row.extracted?.hasPhoto || false;
                    if (!photoSrc) {
                      for (let ci = 0; ci < (row.arr || []).length; ci++) {
                        const s = String(row.arr[ci] || '');
                        if (/^data:image\/.+;base64,/.test(s) || /^https?:\/\/.+\.(jpg|jpeg|png|gif|svg|webp)(\?.*)?$/i.test(s) || /^https?:\/\/(?:drive\.google\.com|lh3\.googleusercontent\.com|res\.cloudinary\.com|.*\.dropbox\.com)/i.test(s)) {
                          photoSrc = s;
                          break;
                        }
                      }
                    }
                    return (
                    <tr key={idx} className={row.valid ? '' : 'bg-red-50'}>
                      {/* Dedicated photo column */}
                      <td className="px-3 py-2">
                        {photoSrc && photoSrc.startsWith('data:image/') ? (
                          <img
                            src={photoSrc}
                            alt="photo"
                            className="h-9 w-9 rounded-full object-cover border-2 border-cyan-200 shadow-sm"
                            onError={(e) => { e.target.style.display = 'none'; if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex'; }}
                          />
                        ) : photoSrc && /^https?:\/\//.test(photoSrc) ? (
                          <img
                            src={photoSrc}
                            alt="photo"
                            className="h-9 w-9 rounded-full object-cover border-2 border-cyan-200 shadow-sm"
                            onError={(e) => { e.target.style.display = 'none'; if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex'; }}
                          />
                        ) : hasPhoto ? (
                          <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center text-green-600 border-2 border-green-200" title="Photo detected">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                        )}
                      </td>
                      {(row.arr || []).map((cell, ci) => {
                        // Skip photo columns in raw data (already shown in dedicated column)
                        const headerName = (previewData.headers[ci] || '').trim().toLowerCase();
                        if (/^(photo|photo[_ ]?url|image|image[_ ]?url|avatar|picture|pic)$/.test(headerName)) return null;
                        const s = String(cell || '');
                        // Skip cells that are data URIs, image URLs, or [photo] placeholder
                        if (/^data:image\/.+;base64,/.test(s) || /^https?:\/\/.+\.(jpg|jpeg|png|gif|svg|webp)(\?.*)?$/i.test(s) || /^https?:\/\/(?:drive\.google\.com|lh3\.googleusercontent\.com|res\.cloudinary\.com|.*\.dropbox\.com)/i.test(s) || s === '[photo]') {
                          return <td key={ci} className="px-3 py-2 text-gray-400 text-xs italic">📷 photo</td>;
                        }
                        return (
                          <td key={ci} className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate" title={s}>
                            {s}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.valid ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title={row.errors?.join(', ')}>
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            {row.errors?.join(', ') || 'Invalid'}
                          </span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import Result */}
        {result && (
          <div className={`mb-6 p-4 border rounded-lg ${result.imported > 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
            {result.imported > 0 ? (
              <>
                <h3 className="font-medium text-green-800">✓ Import Complete!</h3>
                <p className="text-green-700 mt-1">
                  Successfully imported <strong>{result.imported}</strong> voter{result.imported !== 1 ? 's' : ''}
                </p>
                <button
                  onClick={() => navigate('/voters')}
                  className="mt-3 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm font-medium"
                >
                  👁 View All Voters
                </button>
              </>
            ) : (
              <>
                <h3 className="font-medium text-yellow-800">⚠ No voters were imported</h3>
                <p className="text-yellow-700 mt-1">
                  All rows were skipped. Make sure your file has a <strong>Name</strong> column and a <strong>Roll No</strong> (or ID No) column.
                </p>
              </>
            )}
            {result.skipped > 0 && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
                <strong>⚠ {result.skipped} rows were skipped</strong> due to missing roll number or name. 
                {result.skippedRows && result.skippedRows.length > 0 && (
                  <div className="mt-2">
                    <strong>Details:</strong>
                    <ul className="list-disc ml-5 mt-1 text-xs">
                      {result.skippedRows.map((sr, idx) => (
                        <li key={idx}>Row {sr.rowIndex + 1}: {sr.errors.join(', ')}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleImport}
            disabled={!file || loading}
            className={`px-6 py-2 rounded-lg font-medium text-white ${
              !file || loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-700'
            }`}
          >
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Importing...
              </span>
            ) : (
              'Import Voters'
            )}
          </button>
          <button
            onClick={resetForm}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Reset
          </button>
          {selectedElection && (
            <button
              onClick={() => navigate(`/elections/${selectedElection}`)}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              ← Back to Election
            </button>
          )}
        </div>
      </div>

      {/* Help Section */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-800 mb-2">📋 File Format Guide</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>Required columns:</strong> Name, Roll No (or ID No)</li>
          <li>• <strong>Optional columns:</strong> Email, Mobile, Branch, Batch, Address, Category</li>
          <li>• First row should contain column headers (title rows above headers are auto-detected)</li>
          <li>• Supported formats: CSV, Excel (.xlsx, .xls), Apple Numbers (.numbers), ODS</li>
          <li>• Maximum recommended file size: 10MB</li>
        </ul>
      </div>
    </div>
  );
};

export default SimpleImport;
