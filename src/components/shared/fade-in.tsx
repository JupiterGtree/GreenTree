"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}

export function FadeIn({ children, className, delay = 0, y = 16, once = true }: FadeInProps) {
  const shouldReduceMotion = useReducedMotion();

  const variants: Variants = shouldReduceMotion
    ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y },
        visible: { opacity: 1, y: 0 },
      };

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}
