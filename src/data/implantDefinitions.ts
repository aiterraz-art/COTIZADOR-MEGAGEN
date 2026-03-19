export type ImplantModelKey = 'AR' | 'AO' | 'ST' | 'BD' | 'MN' | 'ARiE';

export interface ImplantDefinition {
  key: ImplantModelKey;
  name: string;
  aliases: string[];
}

export const normalizeImplantText = (text: string): string => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

// Edit this list when new implant names or aliases need to be recognized.
export const IMPLANT_DEFINITIONS: ImplantDefinition[] = [
  {
    key: 'AR',
    name: 'XPEED AnyRidge Internal Fixture [AR]',
    aliases: [
      'xpeed anyridge internal fixture [ar]',
      'anyridge internal fixture [ar]',
    ],
  },
  {
    key: 'AO',
    name: 'AnyOne Internal Fixture [AO]',
    aliases: [
      'anyone internal fixture [ao]',
    ],
  },
  {
    key: 'ST',
    name: 'ST Internal Fixture [ST]',
    aliases: [
      'st internal fixture [st]',
    ],
  },
  {
    key: 'BD',
    name: 'BLUEDIAMOND IMPLANT [BD]',
    aliases: [
      'bluediamond implant [bd]',
    ],
  },
  {
    key: 'MN',
    name: 'Mini Internal Fixture [MN]',
    aliases: [
      'mini internal fixture [mn]',
    ],
  },
  {
    key: 'ARiE',
    name: 'ARi ExCon Implant [ARiE]',
    aliases: [
      'ari excon implant [arie]',
      'ari excon implant',
    ],
  },
];

export const createEmptyImplantCountMap = (): Record<ImplantModelKey, number> => ({
  AR: 0,
  AO: 0,
  ST: 0,
  BD: 0,
  MN: 0,
  ARiE: 0,
});

export const findImplantDefinition = (text: string): ImplantDefinition | null => {
  const normalized = normalizeImplantText(text);
  if (!normalized) return null;

  return IMPLANT_DEFINITIONS.find((implant) =>
    implant.aliases.some((alias) => normalized.includes(normalizeImplantText(alias))),
  ) ?? null;
};
