import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const RevealOnScroll = ({ children, className = '', delay = 0 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Animar solo una vez
        }
      },
      {
        threshold: 0.1, // Disparar cuando el 10% del elemento sea visible
        rootMargin: '0px 0px -50px 0px' // Offset ligero para que no aparezca justo al borde
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, []);

  const baseClasses = 'transition-all duration-700 ease-out transform';
  const visibleClasses = isVisible 
    ? 'opacity-100 translate-y-0' 
    : 'opacity-0 translate-y-8';

  return (
    <div
      ref={ref}
      className={`${baseClasses} ${visibleClasses} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

RevealOnScroll.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  delay: PropTypes.number,
};

export default RevealOnScroll;
