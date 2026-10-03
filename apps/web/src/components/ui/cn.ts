import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The type scale lives in the theme (--text-*), so tailwind-merge must know those names are sizes, not colours.
const merge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['display-md', 'headline', 'card-title', 'subhead', 'body-lg', 'body', 'body-sm', 'caption'] }] } },
})

export const cn = (...inputs: ClassValue[]) => merge(clsx(inputs))
