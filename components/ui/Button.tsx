import Link from 'next/link'
import type { ComponentProps } from 'react'

export type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-[15px] font-medium ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-strong',
  secondary: 'border border-line bg-card text-ink hover:bg-sunk',
  danger: 'border border-danger/40 bg-card text-danger hover:bg-danger-soft',
  ghost: 'text-ink-2 hover:bg-sunk',
}

export function buttonClass(variant: Variant = 'secondary', extra = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${extra}`
}

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />
}

export function LinkButton({
  variant = 'secondary',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />
}
