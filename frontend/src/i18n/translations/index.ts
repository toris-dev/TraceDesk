import type { Locale } from "../types";
import { en } from "./en";
import { ko, type TranslationTree } from "./ko";

const catalogs: Record<Locale, TranslationTree> = { ko, en };

export function getCatalog(locale: Locale): TranslationTree {
  return catalogs[locale];
}

export type { TranslationTree };
