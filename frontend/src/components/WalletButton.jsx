/**
 * WalletButton — MetaMask connect/status component
 *
 * Shows:
 *   • "Connect Wallet" button when disconnected
 *   • Wallet address + chain badge when connected
 *   • "Wrong Network" warning + switch button
 */

import { useWeb3 } from '../context/Web3Context';

export default function WalletButton() {
  const {
    account,
    isConnected,
    isCorrectChain,
    connecting,
    error,
    hasMetaMask,
    networkName,
    connectWallet,
    disconnect,
    switchChain,
    shortenAddress,
  } = useWeb3();

  if (!hasMetaMask) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
      >
        <span aria-hidden="true">🦊</span> Install MetaMask
      </a>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={connectWallet}
          disabled={connecting}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-md hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50"
        >
          {connecting ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Connecting…
            </>
          ) : (
            <><span aria-hidden="true">🦊</span> Connect Wallet</>
          )}
        </button>
        {error && <span className="text-[10px] text-red-500 max-w-[200px] text-right">{error}</span>}
      </div>
    );
  }

  // Connected but wrong chain
  if (!isCorrectChain) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full">
          <span aria-hidden="true">⚠️</span> Wrong Network
        </span>
        <button
          onClick={switchChain}
          className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
        >
          Switch to {networkName}
        </button>
      </div>
    );
  }

  // Connected + correct chain
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        {shortenAddress(account)}
      </span>
      <span className="inline-flex items-center px-2 py-1 text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full">
        {networkName}
      </span>
      <button
        onClick={disconnect}
        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
        title="Disconnect wallet"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      </button>
    </div>
  );
}
