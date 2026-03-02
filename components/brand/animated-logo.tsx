'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface AnimatedLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export function AnimatedLogo({ size = 'md', showText = false, className = '' }: AnimatedLogoProps) {
  const sizes = {
    sm: { logo: 'h-10 w-auto', text: 'text-lg', font: 'text-sm' },
    md: { logo: 'h-12 w-auto', text: 'text-xl', font: 'text-base' },
    lg: { logo: 'h-16 w-auto', text: 'text-2xl', font: 'text-lg' },
    xl: { logo: 'h-20 w-auto', text: 'text-3xl', font: 'text-xl' },
  };

  const s = sizes[size as keyof typeof sizes] || sizes.md;
  const [logoSrc] = useState('/voxa-logo.png');

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <motion.div
        className={`${s.logo} overflow-hidden bg-transparent`}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <motion.img
          src={logoSrc}
          alt="Voxa logo"
          className="h-full w-auto object-contain drop-shadow-[0_0_16px_rgba(34,211,238,0.3)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        />
      </motion.div>
      
      {showText && (
        <motion.span
          className={`font-semibold ${s.text} text-gradient`}
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
    sm: { logo: 'h-10 w-auto', text: 'text-lg', font: 'text-sm' },
    md: { logo: 'h-12 w-auto', text: 'text-xl', font: 'text-base' },
    lg: { logo: 'h-16 w-auto', text: 'text-2xl', font: 'text-lg' },
    xl: { logo: 'h-20 w-auto', text: 'text-3xl', font: 'text-xl' },
  };

  const s = sizes[size as keyof typeof sizes] || sizes.md;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`${s.logo} overflow-hidden bg-transparent`}>
        <img
          src="/voxa-logo.png"
          alt="Voxa logo"
          className="h-full w-auto object-contain drop-shadow-[0_0_16px_rgba(34,211,238,0.3)]"
        />
      </div>
      {showText && (
        <span className={`font-semibold ${s.text} text-gradient`}>
          Imaginevoxa
        </span>
      )}
    </div>
  );
}
