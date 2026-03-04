import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from '../../utils/axios';
import Navbar from '../../components/Navbar';
import Sidebar from '../../components/Sidebar';
import { toast } from 'react-toastify';
import Modal from '../../components/Modal';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005';

// Helper to get full image URL (handles both absolute and relative URLs)
const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${backendUrl}${url}`;
};

// Photo Modal Component
const PhotoModal = ({ photoUrl, name, onClose }) => {
  if (!photoUrl) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={onClose}>
      <div className="relative max-w-3xl max-h-[90vh] p-2">
        <button 
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-3xl font-bold hover:text-gray-300"
        >
          ×
        </button>
        <img 
          src={photoUrl} 
          alt={name} 
          className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        <p className="text-white text-center mt-2 text-lg font-medium">{name}</p>
      </div>
    </div>
  );
};

const ElectionDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [election, setElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState('');
  const [photoModal, setPhotoModal] = useState({ show: false, url: null, name: '' });

  // Edit candidate state
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [candidateForm, setCandidateForm] = useState({ name: '', party: '' });
  const [savingCandidate, setSavingCandidate] = useState(false);

  // Add new candidate state
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [newCandidate, setNewCandidate] = useState({ name: '', party: '', manifesto: '' });
  const [addingCandidate, setAddingCandidate] = useState(false);

  // voters pagination
  const [voters, setVoters] = useState({ total: 0, items: [] });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [, setVotersLoading] = useState(false);

  const token = localStorage.getItem('adminToken');

  const fetchDetail = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get(`/api/admin/election/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data && res.data.success) {
        setElection(res.data.election);
        setCandidates(res.data.candidates || []);
      }
    } catch (e) {
      console.error('Failed to load election', e);
      setError(e.response?.data?.message || 'Failed to load election');
    } finally { setLoading(false); }
  }, [id, token]);

  // Start editing a candidate
  const handleEditCandidate = (candidate) => {
    setEditingCandidate(candidate.id);
    setCandidateForm({ name: candidate.name, party: candidate.party || '' });
  };

  // Save candidate changes
  const handleSaveCandidate = async (candidateId) => {
    if (!candidateForm.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSavingCandidate(true);
    try {
      const res = await axios.put(`/api/admin/candidate/${candidateId}`, candidateForm, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data && res.data.success) {
        setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, name: candidateForm.name, party: candidateForm.party } : c));
        setEditingCandidate(null);
        toast.success('Candidate updated');
      } else {
        toast.error(res.data?.message || 'Failed to update');
      }
    } catch (e) {
      console.error('Failed to update candidate', e);
      toast.error(e.response?.data?.message || 'Failed to update candidate');
    } finally {
      setSavingCandidate(false);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingCandidate(null);
    setCandidateForm({ name: '', party: '' });
  };

  // Add new candidate
  const handleAddCandidate = async () => {
    if (!newCandidate.name.trim()) {
      toast.error('Candidate name is required');
      return;
    }
    setAddingCandidate(true);
    try {
      const res = await axios.post('/api/admin/candidate', {
        electionId: id,
        name: newCandidate.name.trim(),
        party: newCandidate.party.trim(),
        manifesto: newCandidate.manifesto.trim()
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      if (res.data && res.data.candidate) {
        setCandidates(prev => [...prev, { ...res.data.candidate, voteCount: 0 }]);
        setNewCandidate({ name: '', party: '', manifesto: '' });
        setShowAddCandidate(false);
        toast.success('Candidate added successfully');
      } else {
        toast.error(res.data?.message || 'Failed to add candidate');
      }
    } catch (e) {
      console.error('Failed to add candidate', e);
      toast.error(e.response?.data?.message || 'Failed to add candidate');
    } finally {
      setAddingCandidate(false);
    }
  };

  const fetchVoters = useCallback(async (p = page, lim = limit) => {
    setVotersLoading(true);
    try {
      const res = await axios.get('/api/admin/students', { params: { electionId: id, page: p, limit: lim }, headers: { Authorization: `Bearer ${token}` } });
      if (res.data && res.data.success) {
        setVoters({ total: res.data.total, items: res.data.items });
      }
    } catch (e) {
      console.error('Failed to fetch voters', e);
      setError(e.response?.data?.message || 'Failed to fetch voters');
    } finally { setVotersLoading(false); }
  }, [id, page, limit, token]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);
  useEffect(() => { fetchVoters(page, limit); }, [fetchVoters, page, limit]);

  // Defensive date formatter that returns a readable datetime when possible.
  const formatDateTime = (d) => {
    try {
      if (!d) return '—';
      // handle numeric epoch (seconds or milliseconds)
      if (typeof d === 'number' || /^\d+$/.test(String(d).trim())) {
        const s = String(d).trim();
        const asNum = Number(s);
        // if seconds (10 digits) convert to ms
        const ms = s.length <= 10 ? asNum * 1000 : asNum;
        const dt = new Date(ms);
        if (!Number.isNaN(dt.getTime())) return dt.toLocaleString();
      }
      const parsed = Date.parse(String(d));
      if (!Number.isNaN(parsed)) return new Date(parsed).toLocaleString();
      // fallback: return the raw value so admin can inspect stored string
      return String(d);
    } catch (e) { return String(d || '—'); }
  };

  // realtime updates
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5005');
    const onVote = (payload) => {
      try {
        const { candidateId, voteCount } = payload || {};
        if (!candidateId) return;
        setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, voteCount } : c));
      } catch (e) { console.warn(e); }
    };
    const onStatus = () => { fetchDetail(); };
    socket.on('vote_cast', onVote);
    socket.on('election_status', onStatus);
    return () => socket.disconnect();
  }, [fetchDetail]);

  const handleRemoveAssociation = async ({ deleteOrphans = false } = {}) => {
    // replaced native confirm/alert with modal/toast flow handled via state
    // actual deletion is handled in confirm modal callback below
    try {
      const res = await axios.delete(`/api/admin/students/by-election/${id}`, { params: { mode: 'remove', deleteOrphans: deleteOrphans ? '1' : '0' }, headers: { Authorization: `Bearer ${token}` } });
      if (res.data && res.data.success) {
        toast.success(`Updated ${res.data.updated || 0} students, deleted ${res.data.orphanDeleted || 0} orphans`);
        fetchVoters(1, limit); fetchDetail();
      }
    } catch (e) { console.error(e); toast.error(e.response?.data?.message || 'Failed to remove association'); }
  };

  const handleDeleteByElection = async () => {
    try {
      const res = await axios.delete(`/api/admin/students/by-election/${id}`, { params: { mode: 'delete' }, headers: { Authorization: `Bearer ${token}` } });
      if (res.data && res.data.success) {
        toast.success(`Deleted ${res.data.deleted || 0} students`);
        navigate('/elections');
      }
    } catch (e) { console.error(e); toast.error(e.response?.data?.message || 'Failed to delete students'); }
  };

  // modal states
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeDeleteOrphans, setRemoveDeleteOrphans] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // importConcepts editing
  const [importSettings, setImportSettings] = useState(null);
  const [savingImportSettings, setSavingImportSettings] = useState(false);
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', startTime: '', endTime: '' });
  const [uploading, setUploading] = useState({}); // track photo uploads per candidate id

  useEffect(() => {
    if (election && election.importConcepts) setImportSettings(election.importConcepts);
    if (election) {
      setEditForm({
        title: election.title || '',
        description: election.description || '',
        startTime: election.startTime || election.startDate || '',
        endTime: election.endTime || election.endDate || ''
      });
    }
  }, [election]);

  const handleSaveImportSettings = async () => {
    if (!importSettings) return toast.error('No import settings to save');
    setSavingImportSettings(true);
    try {
      const res = await axios.patch(`/api/admin/election/${id}`, { importConcepts: importSettings }, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data && res.data.success) {
        toast.success('Import settings saved');
        // refresh detail
        fetchDetail();
      } else {
        toast.error(res.data?.message || 'Failed to save import settings');
      }
    } catch (e) {
      console.error('Failed to save import settings', e);
      toast.error(e.response?.data?.message || 'Failed to save import settings');
    } finally { setSavingImportSettings(false); }
  };

  const totalPages = Math.max(1, Math.ceil((voters.total || 0) / limit));

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Election Details</h1>
              <p className="mt-1 text-sm text-gray-500">{election?.title || ''}</p>
            </div>
            <div className="space-x-2">
                <button onClick={() => navigate('/elections')} className="px-3 py-1 bg-gray-100 rounded">Back to elections</button>
                <button onClick={() => setEditMode(true)} className="px-3 py-1 bg-blue-600 text-white rounded">Edit</button>
            </div>
          </div>

          {loading ? <div>Loading...</div> : (
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-white p-4 rounded shadow">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="font-bold">{election?.title}</h2>
                    <p className="text-sm text-gray-600">{election?.description}</p>
                    <div className="text-sm text-gray-500">
                      {editMode ? (
                        <div className="space-y-2">
                          <div>
                            <label className="block text-sm text-gray-600">Title</label>
                            <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="mt-1 block w-full border rounded px-2 py-1" />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600">Description</label>
                            <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} className="mt-1 block w-full border rounded px-2 py-1" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-sm text-gray-600">Start</label>
                              <input type="datetime-local" value={editForm.startTime} onChange={e => setEditForm(f => ({ ...f, startTime: e.target.value }))} className="mt-1 block w-full border rounded px-2 py-1" />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-600">End</label>
                              <input type="datetime-local" value={editForm.endTime} onChange={e => setEditForm(f => ({ ...f, endTime: e.target.value }))} className="mt-1 block w-full border rounded px-2 py-1" />
                            </div>
                          </div>
                          <div className="flex space-x-2 mt-2">
                            <button onClick={async () => {
                              try {
                                const res = await axios.patch(`/api/admin/election/${id}`, { title: editForm.title, description: editForm.description, startTime: editForm.startTime, endTime: editForm.endTime }, { headers: { Authorization: `Bearer ${token}` } });
                                if (res.data && res.data.success) {
                                  setEditMode(false);
                                  fetchDetail();
                                  toast.success('Election updated');
                                }
                              } catch (e) { console.error(e); toast.error(e.response?.data?.message || 'Failed to save'); }
                            }} className="px-3 py-1 bg-green-600 text-white rounded">Save</button>
                            <button onClick={() => { setEditMode(false); setEditForm({ title: election?.title || '', description: election?.description || '', startTime: election?.startTime || election?.startDate || '', endTime: election?.endTime || election?.endDate || '' }); }} className="px-3 py-1 bg-gray-100 rounded">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        `${formatDateTime(election?.startTime || election?.startDate)} - ${formatDateTime(election?.endTime || election?.endDate)}`
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {election?.status && (
                      <div className="mb-2">Status: <strong>{election.status}</strong></div>
                    )}
                    <div className="text-sm">Total Votes: {election?.totalVotes || 0}</div>
                    <div className="text-sm">Total Voters: {election?.totalVoters || 0}</div>
                  </div>
                </div>
              </div>

                <div className="bg-white p-4 rounded shadow">
                  <h3 className="font-medium mb-2">Import Settings</h3>
                  <div className="text-sm text-gray-600 mb-3">These defaults are used by the Import Students flow when this election is selected.</div>
                  <div className="mb-3">
                    <button data-testid="toggle-import-settings" onClick={() => setImportPanelOpen(p => !p)} className="px-2 py-1 border rounded text-sm">{importPanelOpen ? 'Hide' : 'Edit'} import settings</button>
                  </div>
                  {importPanelOpen && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm text-gray-700">Roll field</label>
                      <input value={importSettings?.rollField || ''} onChange={(e)=> setImportSettings(s => ({ ...(s||{}), rollField: e.target.value }))} className="mt-1 block w-full border rounded px-2 py-1" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">Name field</label>
                      <input value={importSettings?.nameField || ''} onChange={(e)=> setImportSettings(s => ({ ...(s||{}), nameField: e.target.value }))} className="mt-1 block w-full border rounded px-2 py-1" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">Email field</label>
                      <input value={importSettings?.emailField || ''} onChange={(e)=> setImportSettings(s => ({ ...(s||{}), emailField: e.target.value }))} className="mt-1 block w-full border rounded px-2 py-1" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">Mobile field</label>
                      <input value={importSettings?.mobileField || ''} onChange={(e)=> setImportSettings(s => ({ ...(s||{}), mobileField: e.target.value }))} className="mt-1 block w-full border rounded px-2 py-1" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700">Photo field (optional)</label>
                      <input value={importSettings?.photoField || ''} onChange={(e)=> setImportSettings(s => ({ ...(s||{}), photoField: e.target.value }))} className="mt-1 block w-full border rounded px-2 py-1" />
                    </div>
                  </div>
                  )}
                  <div className="mt-3 space-x-2">
                    <button data-testid="save-import-settings" onClick={handleSaveImportSettings} disabled={savingImportSettings} className="px-3 py-1 bg-cyan-600 text-white rounded">{savingImportSettings ? 'Saving...' : 'Save Import Settings'}</button>
                    <button data-testid="import-to-election" onClick={() => navigate(`/import?electionId=${id}`)} className="px-3 py-1 bg-yellow-600 text-white rounded">Import students into this election</button>
                  </div>
                </div>

              <div className="bg-white p-4 rounded shadow">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium">Candidates ({candidates.length})</h3>
                  <button
                    onClick={() => setShowAddCandidate(true)}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center"
                  >
                    <span className="mr-1">+</span> Add Candidate
                  </button>
                </div>

                {/* Add Candidate Form */}
                {showAddCandidate && (
                  <div className="mb-4 p-4 border-2 border-dashed border-green-300 rounded-lg bg-green-50">
                    <h4 className="font-medium text-green-800 mb-3">New Candidate</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <input
                          type="text"
                          value={newCandidate.name}
                          onChange={(e) => setNewCandidate(f => ({ ...f, name: e.target.value }))}
                          placeholder="Enter candidate name"
                          className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-green-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Party</label>
                        <input
                          type="text"
                          value={newCandidate.party}
                          onChange={(e) => setNewCandidate(f => ({ ...f, party: e.target.value }))}
                          placeholder="Enter party name (optional)"
                          className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-green-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Manifesto</label>
                        <textarea
                          value={newCandidate.manifesto}
                          onChange={(e) => setNewCandidate(f => ({ ...f, manifesto: e.target.value }))}
                          placeholder="Enter candidate manifesto (optional)"
                          rows={3}
                          className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-green-400 focus:outline-none"
                        />
                      </div>
                      <div className="flex space-x-2 pt-2">
                        <button
                          onClick={handleAddCandidate}
                          disabled={addingCandidate}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {addingCandidate ? 'Adding...' : 'Add Candidate'}
                        </button>
                        <button
                          onClick={() => {
                            setShowAddCandidate(false);
                            setNewCandidate({ name: '', party: '', manifesto: '' });
                          }}
                          className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2">
                  {candidates.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>No candidates yet.</p>
                      <p className="text-sm mt-1">Click "Add Candidate" to add one.</p>
                    </div>
                  ) : candidates.map(c => (
                    <div key={c.id} className="flex justify-between items-center p-3 border rounded">
                      <div className="flex items-center flex-1">
                        {/* Photo with upload option */}
                        <div className="relative group">
                          {c.photoUrl ? (
                            <img 
                              src={getImageUrl(c.photoUrl)} 
                              alt={c.name} 
                              className="w-14 h-14 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-cyan-400 transition-all"
                              onClick={() => setPhotoModal({ show: true, url: getImageUrl(c.photoUrl), name: c.name })}
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-600">
                              {(c.name || '').split(' ').map(s => s[0]).slice(0,2).join('')}
                            </div>
                          )}
                          {/* Photo upload overlay */}
                          <label 
                            htmlFor={`file-${c.id}`} 
                            className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <span className="text-white text-xs">📷</span>
                          </label>
                          <input 
                            id={`file-${c.id}`} 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={async (e) => {
                              const file = e.target.files && e.target.files[0];
                              if (!file) return;
                              try {
                                setUploading(u => ({ ...u, [c.id]: true }));
                                const fd = new FormData();
                                fd.append('photo', file);
                                const res = await axios.post(`/api/admin/candidate/${c.id}/photo`, fd, { headers: { Authorization: `Bearer ${token}` } });
                                if (res.data && res.data.success) {
                                  setCandidates(prev => prev.map(item => item.id === c.id ? { ...item, photoUrl: res.data.photoUrl } : item));
                                  toast.success('Photo uploaded');
                                } else {
                                  toast.error(res.data?.message || 'Upload failed');
                                }
                              } catch (err) {
                                console.error('photo upload failed', err);
                                toast.error(err.response?.data?.message || 'Upload failed');
                              } finally {
                                setUploading(u => ({ ...u, [c.id]: false }));
                                e.target.value = '';
                              }
                            }} 
                          />
                          {uploading[c.id] && (
                            <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs">...</span>
                            </div>
                          )}
                        </div>

                        {/* Name and Party - Editable */}
                        <div className="ml-4 flex-1">
                          {editingCandidate === c.id ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={candidateForm.name}
                                onChange={(e) => setCandidateForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Candidate name"
                                className="w-full px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                              />
                              <input
                                type="text"
                                value={candidateForm.party}
                                onChange={(e) => setCandidateForm(f => ({ ...f, party: e.target.value }))}
                                placeholder="Party name"
                                className="w-full px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                              />
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleSaveCandidate(c.id)}
                                  disabled={savingCandidate}
                                  className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                                >
                                  {savingCandidate ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-3 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div 
                              className="cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors"
                              onClick={() => handleEditCandidate(c)}
                              title="Click to edit"
                            >
                              <div className="font-medium flex items-center">
                                {c.name}
                                <span className="ml-2 text-gray-400 text-xs">✏️</span>
                              </div>
                              <div className="text-sm text-gray-500">{c.party || <span className="italic text-gray-400">No party</span>}</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Vote count */}
                      <div className="text-right ml-4">
                        <div className="text-lg font-bold text-cyan-600">{c.voteCount}</div>
                        <div className="text-xs text-gray-500">votes</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-4 rounded shadow">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium">Voters</h3>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm">Per page</label>
                    <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className="border rounded p-1">
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-auto max-h-96 border rounded">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Roll</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Voted</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {voters.items.map(it => (
                        <tr key={it._id}>
                          <td className="px-3 py-2 text-sm text-gray-700">{it.roll}</td>
                          <td className="px-3 py-2 text-sm text-gray-700">{it.name}</td>
                          <td className="px-3 py-2 text-sm text-gray-700">{it.email}</td>
                          <td className="px-3 py-2 text-sm text-gray-700">{it.voted ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm text-gray-600">Showing page {page} of {totalPages}, {voters.total} voters</div>
                  <div className="space-x-2">
                    <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p-1))} className="px-3 py-1 bg-gray-100 rounded">Prev</button>
                    <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p+1))} className="px-3 py-1 bg-gray-100 rounded">Next</button>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded shadow">
                <h3 className="font-medium mb-2">Manage Voters</h3>
                <div className="space-x-2">
                  <button onClick={() => { setRemoveDeleteOrphans(false); setShowRemoveModal(true); }} className="px-3 py-1 bg-yellow-100 rounded">Remove association</button>
                  <button onClick={() => { setRemoveDeleteOrphans(true); setShowRemoveModal(true); }} className="px-3 py-1 bg-red-100 rounded">Remove & delete orphans</button>
                  <button onClick={() => setShowDeleteModal(true)} className="px-3 py-1 bg-red-600 text-white rounded">Delete voters (danger)</button>
                </div>
              </div>
              
              <Modal open={showRemoveModal} title="Remove association" onClose={() => setShowRemoveModal(false)} onConfirm={() => { setShowRemoveModal(false); handleRemoveAssociation({ deleteOrphans: removeDeleteOrphans }); }} confirmLabel="Proceed" confirmClass="bg-yellow-600 text-white">
                <div>Are you sure you want to remove the association of voters from this election?{removeDeleteOrphans ? ' This will also delete students without any elections.' : ''}</div>
              </Modal>

              <Modal open={showDeleteModal} title="Delete voters" onClose={() => setShowDeleteModal(false)} onConfirm={() => { setShowDeleteModal(false); handleDeleteByElection(); }} confirmLabel="Delete" confirmClass="bg-red-600 text-white">
                <div>Permanently delete all student records associated with this election? This cannot be undone.</div>
              </Modal>
            </div>
          )}
        </main>
      </div>

      {/* Photo Modal */}
      {photoModal.show && (
        <PhotoModal 
          photoUrl={photoModal.url} 
          name={photoModal.name} 
          onClose={() => setPhotoModal({ show: false, url: null, name: '' })} 
        />
      )}
    </div>
  );
};

export default ElectionDetail;
