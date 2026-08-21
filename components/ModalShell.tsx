/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X } from 'lucide-react';
import { MODAL_CARD, MODAL_OVERLAY } from './uiClasses';

interface ModalShellProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  /** Renders a close affordance in the header when provided. */
  onClose?: () => void;
  /** Tailwind max-width of the card. */
  maxWidthClass?: string;
  /** Separates the header from the body with a rule. */
  dividedHeader?: boolean;
  children: React.ReactNode;
}

/**
 * Dimmed-backdrop dialog frame shared by the audit snapshot viewer, the badge
 * re-auth prompt and the sync conflict resolver.
 */
export default function ModalShell({
  title,
  subtitle,
  icon: Icon,
  iconClassName = 'w-4 h-4 text-blue-600',
  onClose,
  maxWidthClass = 'max-w-sm',
  dividedHeader = false,
  children
}: ModalShellProps) {
  return (
    <div className={MODAL_OVERLAY}>
      <div className={`${MODAL_CARD} ${maxWidthClass}`}>
        <div className={`flex justify-between items-start ${dividedHeader ? 'border-b border-slate-200 pb-3' : ''}`}>
          <div className="space-y-1">
            <h4 className="font-display font-semibold text-sm text-slate-850 flex items-center gap-1.5">
              {Icon && <Icon className={iconClassName} />}
              {title}
            </h4>
            {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition p-1">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
