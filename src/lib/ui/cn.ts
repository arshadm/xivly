import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-style class merging (later classes win over earlier Tailwind utilities). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
