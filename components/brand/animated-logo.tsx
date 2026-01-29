'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface AnimatedLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function AnimatedLogo({ size = 'md', showText = false, className = '' }: AnimatedLogoProps) {
  const sizes = {
    sm: { logo: 'h-10 w-28', text: 'text-lg', font: 'text-sm' },
    md: { logo: 'h-12 w-32', text: 'text-xl', font: 'text-base' },
    lg: { logo: 'h-16 w-44', text: 'text-2xl', font: 'text-lg' },
  };

  const s = sizes[size];
  const [logoSrc, setLogoSrc] = useState('/voxa-logo.png');
  const handleLogoError = () => setLogoSrc('/voxa-logo.svg');

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <motion.div
        className={`${s.logo} rounded-2xl overflow-hidden bg-[#060B27] ring-1 ring-white/10 shadow-voxa`}
        whileHover={{ scale: 1.02, rotate: 0.5 }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <motion.img
          src={logoSrc}
          alt="Voxa logo"
          className="h-full w-full object-contain"
          onError={handleLogoError}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        />
      </motion.div>
      
      {showText && (
        <motion.span
          className={`font-semibold ${s.text} text-gray-900 dark:text-white`}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          Imaginevoxa
        </motion.span>
      )}
    </div>
  );
}

// Simple version without animation for static contexts
export function Logo({ size = 'md', showText = false, className = '' }: AnimatedLogoProps) {
  const sizes = {
    sm: { logo: 'h-10 w-28', text: 'text-lg', font: 'text-sm' },
    md: { logo: 'h-12 w-32', text: 'text-xl', font: 'text-base' },
    lg: { logo: 'h-16 w-44', text: 'text-2xl', font: 'text-lg' },
  };

  const s = sizes[size];
  const [logoSrc, setLogoSrc] = useState('/voxa-logo.png');
  const handleLogoError = () => setLogoSrc('/voxa-logo.svg');

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`${s.logo} rounded-2xl overflow-hidden bg-[#060B27] ring-1 ring-white/10 shadow-voxa`}>
        <img
          src={logoSrc}
          alt="Voxa logo"
          className="h-full w-full object-contain"
          onError={handleLogoError}
        />
      </div>
      {showText && (
        <span className={`font-semibold ${s.text} text-gray-900 dark:text-white`}>
          Imaginevoxa
        </span>
      )}
    </div>
  );
}
