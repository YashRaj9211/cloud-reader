import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, className = '', ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-400">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-stone-400 pointer-events-none flex items-center">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={`w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 rounded-lg text-sm px-3.5 py-2 transition-all focus:outline-none focus:border-[#fa5d19] focus:ring-2 focus:ring-[#fa5d19]/20 disabled:opacity-50 disabled:bg-stone-50 dark:disabled:bg-stone-950 ${
              leftIcon ? 'pl-9' : ''
            } ${rightIcon ? 'pr-9' : ''} ${
              error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''
            } ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 text-stone-400 pointer-events-none flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-500 dark:text-red-400 font-medium">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
