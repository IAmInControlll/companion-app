import type { ImageProps } from '@expo/ui/swift-ui';

/**
 * Everything an iOS widget draws, already formatted by the app. The widget runtime can't import
 * our helpers or fetch anything, so cards carry plain strings and colours (see present.ts).
 */
export type CardLine = {
  text: string;
  size: number;
  color: string;
  weight?: 'regular' | 'semibold' | 'bold' | 'heavy';
  /** Chalky rounded face, standing in for the app's hand-drawn font. */
  hand?: boolean;
  symbol?: ImageProps['systemName'];
  maxLines?: number;
  /** Only shown on medium and larger widgets. */
  roomy?: boolean;
};

export type CardRow = { left: string; right?: string; color?: string };

export type Card = {
  url: string;
  bg: string;
  /** Two colours for a diagonal gradient instead of `bg`. */
  gradient?: [string, string];
  /** file:// URI in the shared widgets directory. */
  image?: string;
  /** `fill` crops to the widget (photos); otherwise it's fitted on `bg` (boards). */
  imageMode?: 'fit' | 'fill';
  tag?: string;
  lines: CardLine[];
  /** List layout for several people; small widgets fall back to `lines`. */
  rows?: CardRow[];
  /** A row of buttons, each opening its own link; small widgets fall back to `lines` + `url`. */
  actions?: { title: string; footer: string; buttons: { emoji: string; url: string }[] };
};
