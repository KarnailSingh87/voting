import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from '../../utils/axios';
import Navbar from '../../components/Navbar';
import Sidebar from '../../components/Sidebar';
import { toast } from 'react-toastify';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005';

// Helper to get full image URL (handles absolute, relative, and data: URLs)
const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
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
  const [stats, setStats] = useState({ totalVotes: 0, totalVoters: 0, votedCount: 0 });

  // Edit candidate state
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [candidateForm, setCandidateForm] = useState({ name: '', party: '' });
  const [savingCandidate, setSavingCandidate] = useState(false);

  // Add new candidate state
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [newCandidate, setNewCandidate] = useState({ name: '', party: '', manifesto: '' });
  const [addingCandidate, setAddingCandidate] = useState(false);

  const token = localStorage.getItem('adminToken');

  const fetchDetail = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get(`/api/admin/election/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data && res.data.success) {
        setElection(res.data.election);
        setCandidates(res.data.candidates || []);
        setStats({
          totalVotes: res.data.totalVotes || 0,
          totalVoters: res.data.totalVoters || 0,
          votedCount: res.data.votedCount || 0
        });
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

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

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

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', startTime: '', endTime: '' });
  const [uploading, setUploading] = useState({}); // track photo uploads per candidate id

  // Voters by candidate state
  const [candidateVoters, setCandidateVoters] = useState([]); // array of { id, name, party, voteCount, voters: [] }
  const [expandedCandidate, setExpandedCandidate] = useState(null); // expanded candidate id
  const [loadingCandidateVoters, setLoadingCandidateVoters] = useState(false);

  useEffect(() => {
    if (election) {
      setEditForm({
        title: election.title || '',
        description: election.description || '',
        startTime: election.startTime || election.startDate || '',
        endTime: election.endTime || election.endDate || ''
      });
    }
  }, [election]);

  // Fetch voters grouped by candidate
  const fetchCandidateVoters = useCallback(async () => {
    setLoadingCandidateVoters(true);
    try {
      const res = await axios.get(`/api/admin/election/${id}/candidate-voters`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data && res.data.success) {
        setCandidateVoters(res.data.candidateVoters || []);
      } else {
        toast.error(res.data?.message || 'Failed to load voter data');
      }
    } catch (e) {
      console.error('Failed to fetch candidate voters', e);
      toast.error(e.response?.data?.message || 'Failed to load voters by candidate');
    } finally { setLoadingCandidateVoters(false); }
  }, [id, token]);

  useEffect(() => { fetchCandidateVoters(); }, [fetchCandidateVoters]);

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
                    <div className="text-sm">Total Votes: {stats.totalVotes}</div>
                    <div className="text-sm">Total Voters: {stats.totalVoters}</div>
                    <div className="text-sm">Voted: {stats.votedCount}</div>
                  </div>
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
                              onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                            />
                          ) : null}
                          <div 
                            className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-600"
                            style={c.photoUrl ? { display: 'none' } : {}}
                          >
                            {(c.name || '').split(' ').map(s => s[0]).slice(0,2).join('')}
                          </div>
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

              {/* Voters by Candidate */}
              <div className="bg-white p-4 rounded shadow">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium">Voters by Candidate</h3>
                  <button 
                    onClick={fetchCandidateVoters} 
                    disabled={loadingCandidateVoters}
                    className="px-3 py-1 text-sm bg-cyan-50 text-cyan-700 rounded hover:bg-cyan-100 disabled:opacity-50"
                  >
                    {loadingCandidateVoters ? 'Loading...' : '↻ Refresh'}
                  </button>
                </div>

                {loadingCandidateVoters && candidateVoters.length === 0 ? (
                  <div className="text-center py-6 text-gray-400">Loading voter data...</div>
                ) : candidateVoters.length === 0 ? (
                  <div className="text-center py-6 text-gray-400">No vote data available yet.</div>
                ) : (
                  <div className="space-y-2">
                    {candidateVoters.map(cv => (
                      <div key={cv.id} className="border rounded overflow-hidden">
                        {/* Candidate header (click to expand) */}
                        <button
                          onClick={() => setExpandedCandidate(expandedCandidate === cv.id ? null : cv.id)}
                          className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${cv.voters.length > 0 ? 'bg-green-400' : 'bg-gray-300'}`} />
                            <div>
                              <span className="font-medium">{cv.name}</span>
                              {cv.party && <span className="text-sm text-gray-500 ml-2">({cv.party})</span>}
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className="text-sm font-medium text-cyan-600">{cv.voters.length} voter{cv.voters.length !== 1 ? 's' : ''}</span>
                            <span className={`text-gray-400 transition-transform ${expandedCandidate === cv.id ? 'rotate-180' : ''}`}>▼</span>
                          </div>
                        </button>

                        {/* Expanded voter list */}
                        {expandedCandidate === cv.id && (
                          <div className="border-t bg-gray-50">
                            {cv.voters.length === 0 ? (
                              <div className="p-3 text-sm text-gray-400 text-center">No voters yet</div>
                            ) : (
                              <div className="overflow-auto max-h-64">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Roll</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Voted At</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {cv.voters.map((v, idx) => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-sm text-gray-400">{idx + 1}</td>
                                        <td className="px-3 py-2 text-sm text-gray-700 font-mono">{v.roll || '—'}</td>
                                        <td className="px-3 py-2 text-sm text-gray-700">{v.name}</td>
                                        <td className="px-3 py-2 text-sm text-gray-700">{v.email || '—'}</td>
                                        <td className="px-3 py-2 text-sm text-gray-500">{v.votedAt ? new Date(v.votedAt).toLocaleString() : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
