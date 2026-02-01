/**
 * Type declarations for the stopword package
 * @see https://github.com/fergiemcdowall/stopword
 */

declare module "stopword" {
  /**
   * Removes stopwords from an array of strings
   * @param tokens - Array of words to filter
   * @param stopwords - Array of stopwords to remove (defaults to English)
   * @returns Array with stopwords removed
   */
  export function removeStopwords(
    tokens: string[],
    stopwords?: string[],
  ): string[];

  /**
   * English stopwords list
   */
  export const eng: string[];

  /**
   * Additional language stopword lists
   */
  export const afr: string[];
  export const ara: string[];
  export const hye: string[];
  export const eus: string[];
  export const ben: string[];
  export const bre: string[];
  export const bul: string[];
  export const cat: string[];
  export const zho: string[];
  export const hrv: string[];
  export const ces: string[];
  export const dan: string[];
  export const nld: string[];
  export const epo: string[];
  export const est: string[];
  export const fin: string[];
  export const fra: string[];
  export const glg: string[];
  export const deu: string[];
  export const ell: string[];
  export const guj: string[];
  export const hau: string[];
  export const heb: string[];
  export const hin: string[];
  export const hun: string[];
  export const ind: string[];
  export const gle: string[];
  export const ita: string[];
  export const jpn: string[];
  export const kor: string[];
  export const kur: string[];
  export const lat: string[];
  export const lav: string[];
  export const lit: string[];
  export const lgg: string[];
  export const lggNd: string[];
  export const msa: string[];
  export const mar: string[];
  export const mya: string[];
  export const nob: string[];
  export const fas: string[];
  export const pol: string[];
  export const por: string[];
  export const porBr: string[];
  export const panGu: string[];
  export const ron: string[];
  export const rus: string[];
  export const slk: string[];
  export const slv: string[];
  export const som: string[];
  export const sot: string[];
  export const spa: string[];
  export const swa: string[];
  export const swe: string[];
  export const tgl: string[];
  export const tam: string[];
  export const tha: string[];
  export const tur: string[];
  export const ukr: string[];
  export const urd: string[];
  export const vie: string[];
  export const yor: string[];
  export const zul: string[];
}
