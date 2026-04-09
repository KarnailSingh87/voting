import React, { useState } from 'react';
import axios from '../../utils/axios';

const QueryForm = () => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = localStorage.getItem('voterToken');
      const res = await axios.post('/api/voter/query', { subject, message }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess('Query submitted successfully!');
      setSubject('');
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit query');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Raise a Query</h2>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="block mb-1 font-medium">Subject</label>
          <input
            type="text"
            className="w-full border px-3 py-2 rounded"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            required
          />
        </div>
        <div className="mb-3">
          <label className="block mb-1 font-medium">Message</label>
          <textarea
            className="w-full border px-3 py-2 rounded"
            value={message}
            onChange={e => setMessage(e.target.value)}
            required
            rows={4}
          />
        </div>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        {success && <div className="text-green-600 mb-2">{success}</div>}
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded"
          disabled={loading}
        >
          {loading ? 'Submitting...' : 'Submit Query'}
        </button>
      </form>
    </div>
  );
};

export default QueryForm;
