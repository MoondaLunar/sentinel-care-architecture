/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface StatusPillProps {
  /** Palette classes, typically from `statusStyles.ts`. */
  className: string;
  icon?: React.ComponentType<{ className?: string }> | null;
  iconClassName?: string;
  label: React.ReactNode;
  title?: string;
  id?: string;
}

/**
 * Compact bordered status badge (sync outcomes, chain integrity, GDPR
 * lifecycle). Only the palette varies between call sites.
 */
export default function StatusPill({
  className,
  icon: Icon,
  iconClassName = 'w-2.5 h-2.5',
  label,
  title,
  id
}: StatusPillProps) {
  return (
    <span
      id={id}
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border select-none ${className}`}
    >
      {Icon && <Icon className={iconClassName} />}
      {label}
    </span>
  );
}
