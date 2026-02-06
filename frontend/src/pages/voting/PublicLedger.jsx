import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from '../../utils/axios';

const PublicLedger = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ledger, setLedger] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true); setError('');
      try {
        const res = await axios.get(`/api/ledger/${id}?page=${page}&limit=25`);
        if (res.data && res.data.success) {
          setLedger(res.data.ledger || []);
          setTotal(res.data.total || 0);
        } else {
          setError(res.data?.message || 'Failed to load ledger');
        }
      } catch (e) {
        console.error('Failed to fetch ledger', e);
        setError(e.response?.data?.message || 'Failed to load ledger');
      } finally { setLoading(false); }
    };
    if (id) fetch();
  }, [id, page]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Vote Ledger</h2>
        <Link to={`/public/election/${id}`} className="text-sm text-indigo-600">Back to results</Link>
      </div>
      <div className="mt-4 bg-white shadow rounded p-4">
        {loading ? <div>Loading...</div> : error ? <div className="text-red-600">{error}</div> : (
          <div>
            <div className="text-sm text-gray-600 mb-2">Showing page {page} — total votes: {total}</div>
            <div className="space-y-2">
              {ledger.length === 0 && <div className="text-sm text-gray-500">No votes found</div>}
              {ledger.map(entry => (
                <div key={entry._id} className="p-2 border rounded flex items-center justify-between">
                  <div className="text-xs text-gray-700">{entry.voteHash}</div>
                  <div className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-4">
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p-1))} className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50">Prev</button>
              <div className="text-sm text-gray-600">Page {page}</div>
              <button disabled={ledger.length === 0} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicLedger;
