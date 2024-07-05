"use strict";

export function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

export function titleCase(word: string): string {
  return word.substring(0, 1).toUpperCase() + word.substring(1).toLowerCase();
}
