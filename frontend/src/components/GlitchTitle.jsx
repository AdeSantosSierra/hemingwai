import React from 'react';
import PropTypes from 'prop-types';

const GlitchTitle = ({ text, className = '' }) => {
  return (
    <h1 
      className={`glitch relative inline-block text-white ${className}`} 
      data-text={text}
    >
      {text}
    </h1>
  );
};

GlitchTitle.propTypes = {
  text: PropTypes.string.isRequired,
  className: PropTypes.string,
};

export default GlitchTitle;
