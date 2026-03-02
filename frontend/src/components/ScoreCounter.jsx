import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";
import PropTypes from "prop-types";

const ScoreCounter = ({ value, className = "" }) => {
  const ref = useRef(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { damping: 20, stiffness: 50, duration: 2000 });
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) {
      motionValue.set(value);
    }
  }, [motionValue, value, isInView]);

  useEffect(() => {
    return springValue.on("change", (latest) => {
      if (ref.current) {
        const safeValue = Number.isFinite(latest) ? latest : 0;
        ref.current.textContent = safeValue.toFixed(2);
      }
    });
  }, [springValue]);

  return <span ref={ref} className={className}>{(0).toFixed(2)}</span>;
};

ScoreCounter.propTypes = {
  value: PropTypes.number.isRequired,
  className: PropTypes.string,
};

export default ScoreCounter;
