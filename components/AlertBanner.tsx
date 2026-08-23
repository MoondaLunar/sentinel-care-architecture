/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

export type AlertVariant = 'error' | 'warning' | 'success' | 'info';

interface AlertBannerProps {
  variant: AlertVariant;
  /** Overrides the variant's default icon. Pass `null` to render no icon. */
  icon?: React.ComponentType<{ className?: string }> | null;
  /** Tint of the icon; defaults to the variant colour. */
  iconClassName?: string;
  iconSizeClass?: string;
  title?: React.ReactNode;
  className?: string;
  id?: string;
  children?: React.ReactNode;
}

const VARIANT_SURFACE: Record<AlertVariant, string> = {
  error: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  info: 'bg-blue-50 border-blue-200 text-blue-700'
};

const VARIANT_ICON: Record<AlertVariant, React.ComponentType<{ className?: string }>> = {
  error: XCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info
};

const VARIANT_ICON_TINT: Record<AlertVariant, string> = {
  error: 'text-red-500',
  warning: 'text-amber-600',
  success: 'text-emerald-600',
  info: 'text-blue-600'
};

/**
 * Inline status banner shared by every workspace (form errors, compliance
 * notices, tamper alerts). Layout and palette live here so the panels only
 * declare intent.
 */
export default function AlertBanner({
  variant,
  icon,
  iconClassName,
  iconSizeClass = 'w-4 h-4',
  title,
  className = '',
  id,
  children
}: AlertBannerProps) {
  const Icon = icon === undefined ? VARIANT_ICON[variant] : icon;

  return (
    <div
      id={id}
      className={`border p-3 rounded-lg flex items-start gap-2 text-xs ${VARIANT_SURFACE[variant]} ${className}`}
    >
      {Icon && <Icon className={`${iconSizeClass} shrink-0 mt-0.5 ${iconClassName || VARIANT_ICON_TINT[variant]}`} />}
      <div className="space-y-1 flex-1 min-w-0">
        {title && <strong className="block font-semibold">{title}</strong>}
        {children}
      </div>
    </div>
  );
}
