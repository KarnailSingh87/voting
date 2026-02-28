import React from 'react';

const Modal = ({ show, onClose, children }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded shadow-lg p-6 min-w-[250px] max-w-xs">
        <div className="mb-4">{children}</div>
        <button onClick={onClose} className="mt-2 px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700">Close</button>
      </div>
    </div>
  );
};

export default Modal;
