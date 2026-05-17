import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError, Link } from 'react-router-dom';

export default function RouteErrorBoundary() {
  const err = useRouteError();

  const title = isRouteErrorResponse(err)
    ? `${err.status} ${err.statusText}`
    : 'Something went wrong';

  const message = isRouteErrorResponse(err)
    ? (err.data?.message || err.data || 'A routing error occurred.')
    : (err?.message || String(err || 'Unknown error'));

  useEffect(() => {
    const msg = message.toLowerCase();
    if (msg.includes('module script failed') || msg.includes('dynamically imported module') || msg.includes('failed to fetch')) {
      if (!sessionStorage.getItem('chunk_load_error')) {
        sessionStorage.setItem('chunk_load_error', 'true');
        window.location.reload(true);
      } else {
        sessionStorage.removeItem('chunk_load_error');
      }
    }
  }, [message]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white shadow p-6">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-600">
          The app hit an error while rendering this page.
        </p>

        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3">
          <div className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-words">
            {message}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-md bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700"
          >
            Reload
          </button>
          <Link
            to="/"
            className="px-4 py-2 rounded-md bg-white border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Go Home
          </Link>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Tip: if this keeps happening, try disabling browser translate extensions or switching language again.
        </p>
      </div>
    </div>
  );
}
