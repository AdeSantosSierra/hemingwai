import React from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { History, ExternalLink } from 'lucide-react';
import PropTypes from 'prop-types';

const HistoryPanel = ({ history, onSelect }) => {
  if (!history || history.length === 0) return null;

  return (
    <div className="w-full max-w-5xl mx-auto mt-6 mb-4">
      <div className="flex items-center gap-2 mb-2 text-gray-300 px-1">
        <History className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Historial de sesión</span>
      </div>
      
      <div className="flex overflow-x-auto pb-2 gap-3 scrollbar-hide px-1">
        {history.map((item, index) => (
          <motion.button
            key={item.id || index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(item)}
            className="flex-shrink-0 flex items-center gap-3 bg-[#0f2e53] border border-gray-700 hover:border-lima/50 
                       rounded-lg py-2 px-3 min-w-[200px] max-w-[260px] text-left group transition-colors shadow-lg"
          >
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-medium text-gray-100 truncate group-hover:text-white">
                {item.title || item.query}
              </h4>
              <div className="flex items-center gap-1 mt-0.5">
                 <span className="text-[10px] text-gray-400 truncate">
                   {new URL(item.query).hostname.replace('www.', '')}
                 </span>
                 <span className="text-[10px] text-gray-500">• {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            </div>
            <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-lima transition-colors" />
          </motion.button>
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
