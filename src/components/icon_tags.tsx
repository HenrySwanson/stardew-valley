/** Components that let us display some text next to an icon. */

"use strict";

import { QualityVector } from "../crops";
import { ReactNode } from "react";

export const QUALITY_STAR_ICONS: QualityVector<string> = {
  normal: "Base_Quality.png",
  silver: "Silver_Quality.png",
  gold: "Gold_Quality.png",
  iridium: "Iridium_Quality.png",
};

export function getIconPath(name: string): string {
  // NOTE: replace(string, string) only replaces the first one
  return name.replace(/ /g, "_") + ".png";
}

// Just the icon image
export function InlineIcon({ src }: { src: string }) {
  const fullPath = import.meta.env.BASE_URL + "/img/" + src;
  return <img className="inline-icon" src={fullPath} />;
}

// General-purpose text-with-icon component
export function IconTag({
  src,
  children,
}: {
  src: string;
  children: ReactNode;
}) {
  return (
    <>
      <InlineIcon src={src} />
      <span className="after-inline-icon">{children}</span>
    </>
  );
}

export function GoldTag({
  amount,
  fractionalDigits = 2,
}: {
  amount: number;
  fractionalDigits?: number;
}) {
  return <IconTag src="Gold.png">{amount.toFixed(fractionalDigits)}g</IconTag>;
}

export function TimeTag({ days }: { days: number }) {
  return <IconTag src="Time.png">{days.toString()}d</IconTag>;
}

export function GoodTag({ name }: { name: string }) {
  return <IconTag src={getIconPath(name)}>{name}</IconTag>;
}
