import React from 'react';
import { History, ExternalLink } from 'lucide-react';
import PropTypes from 'prop-types';

const HistoryPanel = ({ history, onSelect }) => {
  if (!history || history.length === 0) {
      return (
          <div className="p-4 text-center text-gray-400 text-xs">
              No hay historial reciente.
          </div>
      );
  }

  return (
    <div className="w-72 max-h-96 overflow-y-auto py-2">
      <div className="flex items-center gap-2 px-4 py-2 text-gray-400 border-b border-gray-700/50 mb-1">
        <History className="w-3 h-3" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">Recientes</span>
      </div>
      
      <div className="flex flex-col">
        {history.map((item, index) => (
          <button
            key={item.id || index}
            onClick={() => onSelect(item)}
            className="flex items-start gap-3 px-4 py-3 hover:bg-[#0f2e53] transition-colors text-left group border-b border-gray-800/50 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-medium text-gray-200 truncate group-hover:text-white">
                {item.title || item.query}
              </h4>
              <div className="flex items-center gap-1 mt-0.5">
                 <span className="text-[10px] text-gray-500 truncate group-hover:text-gray-400">
                   {(() => {
                     try {
                       const urlStr = item.url || item.query;
                       return new URL(urlStr).hostname.replace('www.', '');
                     } catch (e) {
                       return 'ID: ' + item.query.substring(0, 8) + '...';
                     }
                   })()}
                 </span>
                 <span className="text-[10px] text-gray-600 group-hover:text-gray-500">• {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            </div>
            <ExternalLink className="w-3 h-3 text-gray-600 group-hover:text-lima opacity-0 group-hover:opacity-100 transition-all mt-1" />
          </button>
        ))}
      </div>
    </div>
  );
};

HistoryPanel.propTypes = {
  history: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      query: PropTypes.string.isRequired,
      title: PropTypes.string,
      timestamp: PropTypes.number
    })
  ).isRequired,
  onSelect: PropTypes.func.isRequired
};

export default HistoryPanel;
