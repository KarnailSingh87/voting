import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';

const StudentDetail = () => {
  const { roll } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await axios.post('/api/student-lookup', { roll });
        if (res.data?.success) setStudent(res.data.student || null);
        else setError(res.data?.message || 'Not found');
      } catch (e) {
        setError(e.response?.data?.message || 'Failed to fetch student');
      } finally { setLoading(false); }
    }
    if (roll) load();
  }, [roll]);

  const onPrint = () => window.print();
  const onExport = () => {
    const blob = new Blob([JSON.stringify(student || {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${roll}_student.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!student) return <div className="p-4">No student data</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded shadow mt-6">
      <div className="flex justify-between items-start">
        <h2 className="text-xl font-semibold">Student Details — {student.name || roll}</h2>
        <div className="space-x-2">
          <button onClick={() => navigate(-1)} className="px-3 py-1 bg-gray-200 rounded">Back</button>
          <button onClick={onExport} className="px-3 py-1 bg-cyan-600 text-white rounded">Export JSON</button>
          <button onClick={onPrint} className="px-3 py-1 bg-green-600 text-white rounded">Print</button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1">
          {student.photo ? (
            <img src={student.photo} alt="student" className="w-full h-56 object-cover rounded border" />
          ) : (
            <div className="w-full h-56 flex items-center justify-center bg-gray-100 rounded">No photo</div>
          )}
        </div>
        <div className="col-span-2">
          <p><strong>Roll:</strong> {student.roll}</p>
          <p><strong>Name:</strong> {student.name}</p>
          {student.fatherName && <p><strong>Father Name:</strong> {student.fatherName}</p>}
          {student.address && <p><strong>Address:</strong> {student.address}</p>}
          {student.email && <p><strong>Email:</strong> {student.email}</p>}
          {student.mobile && <p><strong>Mobile:</strong> {student.mobile}</p>}
          {typeof student.voted !== 'undefined' && <p><strong>Voted:</strong> {student.voted ? 'Yes' : 'No'}</p>}
          {student.registeredAt && <p><strong>Registered:</strong> {new Date(student.registeredAt).toLocaleString()}</p>}

          {student.originalHeaders && student.originalHeaders.length > 0 && (
            <div className="mt-4">
              <h4 className="font-semibold">Original upload columns</h4>
              <div className="text-sm text-gray-700">
                {student.originalHeaders.map((h,i) => (
                  <p key={i}><strong>{h}:</strong> {student.originalArr && student.originalArr[i] ? String(student.originalArr[i]) : ''}</p>
                ))}
              </div>
            </div>
          )}

          {student.originalObj && (
            <div className="mt-4">
              <h4 className="font-semibold">All additional fields</h4>
              <div className="text-sm text-gray-700">
                {Object.entries(student.originalObj).map(([k,v]) => (
                  <p key={k}><strong>{k}:</strong> {String(v)}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentDetail;
