import React from 'react';
import PropTypes from 'prop-types';

const GlitchTitle = ({ 
  text, 
  className = '', 
  intensity = 'subtle', 
  hoverOnly = false 
}) => {
  // Determine the base class for glitch effect
  const glitchClass = intensity === 'subtle' ? 'hw-glitch' : 'glitch';
  
  // Wrapper class for hover functionality
  const wrapperClass = hoverOnly ? 'hw-glitch-hover' : '';

  return (
    <span className={`${wrapperClass} inline-block`}>
      <h1 
        className={`${glitchClass} relative inline-block text-white ${className}`} 
        data-text={text}
      >
        {text}
      </h1>
    </span>
  );
};

GlitchTitle.propTypes = {
  text: PropTypes.string.isRequired,
  className: PropTypes.string,
  intensity: PropTypes.oneOf(['subtle', 'medium']),
  hoverOnly: PropTypes.bool,
};

export default GlitchTitle;
