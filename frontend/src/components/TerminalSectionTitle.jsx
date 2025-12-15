import React from 'react';
import PropTypes from 'prop-types';

const TerminalSectionTitle = ({ children, className = '' }) => {
  return (
    <div className={`hw-terminal-title font-mono text-white ${className}`}>
      {/* Vertical bar on the left */}
      <div className="hw-terminal-bar"></div>
      
      {/* Scanline overlay */}
      <div className="hw-terminal-scanline"></div>
      
      {/* Content */}
      <span className="relative z-10 block pl-4">
        {children}
      </span>
    </div>
  );
};

TerminalSectionTitle.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export default TerminalSectionTitle;
