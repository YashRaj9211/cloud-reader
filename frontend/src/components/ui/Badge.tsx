import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'outline';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-0.5 text-xs',
  };

  const variantClasses = {
    default:
      'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium',
    primary:
      'bg-[#fa5d19]/10 text-[#fa5d19] dark:bg-[#fa5d19]/20 dark:text-[#ff8c42] font-semibold border border-[#fa5d19]/20',
    success:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-medium border border-emerald-200 dark:border-emerald-800/40',
    warning:
      'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-medium border border-amber-200 dark:border-amber-800/40',
    error:
      'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 font-medium border border-rose-200 dark:border-rose-800/40',
    outline:
      'border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 font-normal',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md tracking-tight select-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
