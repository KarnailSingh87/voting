import { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import PropTypes from 'prop-types';
import { useParams, Link } from 'react-router-dom';
import axios from '../../utils/axios';

const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.PROD ? '' : 'http://localhost:5005');

// Helper to get full image URL (handles both absolute and relative URLs)
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

PhotoModal.propTypes = {
  photoUrl: PropTypes.string,
  name: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};

const PAGE_SIZE = 20;

const PublicElection = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [election, setElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [page, setPage] = useState(1);
  const [socketConnected, setSocketConnected] = useState(false);
  const [photoModal, setPhotoModal] = useState({ show: false, url: null, name: '' });

  useEffect(() => {
    const fetch = async () => {
      setLoading(true); setError('');
      try {
        const res = await axios.get(`/api/election/${id}`);
        if (res.data && res.data.success) {
          setElection(res.data.election);
          setCandidates(res.data.candidates || []);
          setTotalVotes(res.data.totalVotes || (res.data.candidates||[]).reduce((s,c)=>s+(c.voteCount||0),0));
        } else {
          setError(res.data?.message || 'Failed to load election');
        }
      } catch (e) {
        console.error('Failed to fetch public election', e);
        setError(e.response?.data?.message || 'Failed to load election');
      } finally { setLoading(false); }
    };
    if (id) fetch();
  }, [id]);

  // sort and paginate candidates — keep hooks stable by calling on every render
  const sorted = useMemo(() => [...candidates].sort((a,b)=> (b.voteCount||0) - (a.voteCount||0)), [candidates]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const winnerId = sorted[0]?.id;

  // live updates when election is ongoing
  useEffect(() => {
    if (!election || election.status !== 'ongoing') return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || (import.meta.env.PROD ? undefined : 'http://localhost:5005'));
    const onVote = (payload) => {
      try {
        const { candidateId, voteCount } = payload || {};
        if (!candidateId) return;
        setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, voteCount } : c));
        // recompute total votes from candidates for robustness
        setTotalVotes(prev => {
          // best-effort increment if candidate found, fallback to recompute
          const found = candidates.find(c => c.id === candidateId);
          if (found) return prev + 1;
          return [...candidates].reduce((s, c) => s + (c.voteCount || 0), 0);
        });
      } catch (e) { console.warn('live update error', e); }
    };
    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('vote_cast', onVote);
    return () => socket.disconnect();
  }, [election, id, candidates]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!election) return <div className="p-6">Election not found</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">{election.title}</h2>
          <p className="text-sm text-gray-600">{election.description}</p>
          <div className="mt-2 text-sm text-gray-700">Status: <strong>{election.status}</strong></div>
        </div>
        <div className="text-right">
          <Link to="/public" className="px-3 py-2 bg-gray-100 rounded">Back to list</Link>
        </div>
      </div>

      <div className="bg-white shadow rounded p-4 mt-6">
        <h3 className="font-medium mb-4">
          {election.status === 'ongoing' ? (
            <span className="flex items-center space-x-2">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span>Live overview {socketConnected ? '(connected)' : '(connecting...)'}</span>
            </span>
          ) : (
            'Results'
          )}
        </h3>
        {candidates.length === 0 ? (
          <div className="text-sm text-gray-500">No candidates</div>
        ) : (
          <div className="space-y-4">
            {/* compact summary header */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">Showing {paged.length} of {candidates.length} candidates</div>
              <div className="text-sm font-semibold">Total votes: {totalVotes}</div>
            </div>

            {/* candidate list */}
            <div className="grid gap-4 md:grid-cols-2">
              {paged.map(c => {
                const count = c.voteCount || 0;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
                const isWinner = c.id === winnerId;
                return (
                  <div key={c.id} className={`p-3 rounded border ${isWinner ? 'bg-green-50 border-green-300' : 'bg-white'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        {c.photoUrl ? (
                          <img 
                            src={getImageUrl(c.photoUrl)} 
                            alt={c.name} 
                            className="w-12 h-12 rounded-full object-cover mr-3 cursor-pointer hover:ring-2 hover:ring-cyan-400 transition-all"
                            onClick={() => setPhotoModal({ show: true, url: getImageUrl(c.photoUrl), name: c.name })}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-200 mr-3 flex items-center justify-center text-sm text-gray-600">{(c.name || '').split(' ').map(s => s[0]).slice(0,2).join('')}</div>
                        )}
                        <div>
                          <div className="font-medium text-lg">{c.name} {isWinner && <span className="text-sm text-green-700 ml-2">(Leading)</span>}</div>
                          <div className="text-xs text-gray-500">{c.party}</div>
                        </div>
                      </div>
                      <div className="text-2xl font-bold">{count}</div>
                    </div>

                    {/* simple spark / bar using inline SVG */}
                    <div className="mt-3">
                      <svg width="100%" height="24" viewBox="0 0 100 10" preserveAspectRatio="none" className="rounded overflow-hidden">
                        <rect x="0" y="0" width="100" height="10" fill="#f3f4f6" />
                        <rect x="0" y="0" width={`${pct}`} height="10" fill={isWinner ? '#10b981' : '#6366f1'} />
                      </svg>
                      <div className="mt-1 text-xs text-gray-600">{pct}% of votes</div>
                    </div>

                    <div className="mt-3 text-right">
                      <Link to={`/public/election/${id}/ledger?candidate=${c.id}`} className="text-sm text-indigo-600">View candidate ledger</Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center space-x-2 mt-4">
                <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>Prev</button>
                <div className="text-sm">Page {page} of {totalPages}</div>
                <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>Next</button>
              </div>
            )}

            <div className="text-right mt-2">
              <Link to={`/public/election/${id}/ledger`} className="text-sm text-indigo-600">View full vote ledger & audit trail</Link>
            </div>
          </div>
        )}
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

export default PublicElection;
