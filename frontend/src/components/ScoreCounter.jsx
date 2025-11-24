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
        ref.current.textContent = Math.round(latest);
      }
    });
  }, [springValue]);

  return <span ref={ref} className={className}>{0}</span>;
};

ScoreCounter.propTypes = {
  value: PropTypes.number.isRequired,
  className: PropTypes.string,
};

export default ScoreCounter;
