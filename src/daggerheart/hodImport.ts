// Import a Heart of Daggers export ("Old Gus' Unofficial Daggerheart Character Sheet", AcroForm PDF)
// into the DaggerheartCharacter model. Pure mapping from a field map, so it is testable without a PDF.
import { PDFDocument, PDFCheckBox, PDFRadioGroup, PDFTextField } from 'pdf-lib';
import {
  TRAITS, emptyState,
  type DaggerheartCharacter, type DaggerheartBuild, type DaggerheartState,
  type DomainCard, type Trait, type Weapon,
} from './model';

/** Field name -> text value, or true/false for checkboxes, or the chosen option for radio groups. */
export type FieldMap = Record<string, string | boolean | undefined>;

export async function readPdfFields(bytes: ArrayBuffer | Uint8Array): Promise<FieldMap> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out: FieldMap = {};
  for (const field of doc.getForm().getFields()) {
    const name = field.getName();
    if (field instanceof PDFTextField) out[name] = field.getText() ?? '';
    else if (field instanceof PDFCheckBox) out[name] = field.isChecked();
    else if (field instanceof PDFRadioGroup) out[name] = field.getSelected() ?? undefined;
  }
  return out;
}

const text = (f: FieldMap, k: string): string => { const v = f[k]; return typeof v === 'string' ? v.trim() : ''; };
const checked = (f: FieldMap, k: string): boolean => f[k] === true;
const num = (s: string, fallback = 0): number => {
  const m = s.replace(/\s/g, '').match(/^[+-]?\d+/);
  return m ? parseInt(m[0], 10) : fallback;
};
/** Count checked boxes in a family "Prefix 1".."Prefix n". */
const countChecked = (f: FieldMap, prefix: string, max: number): number => {
  let n = 0;
  for (let i = 1; i <= max; i++) if (checked(f, `${prefix} ${i}`)) n++;
  return n;
};
/** "HP Max" etc. are exported as checkbox-like buttons whose value is the number ("/6"). */
const maxValue = (f: FieldMap, k: string, fallback: number): number => {
  const v = f[k];
  if (typeof v === 'string') return num(v.replace('/', ''), fallback);
  return fallback;
};

function parseTrait(s: string): Trait | undefined {
  const t = s.trim().toLowerCase();
  return (TRAITS as readonly string[]).includes(t) ? (t as Trait) : undefined;
}

function parseWeapon(f: FieldMap, i: number): Weapon | undefined {
  const name = text(f, `Weapon ${i} Label`);
  if (!name) return undefined;
  const [trait = '', range = ''] = text(f, `Weapon ${i} Trait and Range`).split('/').map((p) => p.trim());
  const dmg = text(f, `Weapon ${i} Damage and Type`);
  const m = dmg.match(/^(\S+)\s*(.*)$/);
  const typeWord = (m?.[2] ?? '').toLowerCase();
  const slotRaw = String(f[`Weapon ${i} Type`] ?? '').replace('/', '').toLowerCase();
  return {
    name,
    slot: slotRaw === 'secondary' ? 'secondary' : 'primary',
    trait, range,
    damage: m?.[1] ?? dmg,
    damageType: typeWord.startsWith('mag') ? 'magic' : typeWord.startsWith('phy') ? 'physical' : typeWord,
    feature: text(f, `Weapon ${i} Feature`) || undefined,
    active: checked(f, `Weapon ${i} Active`),
  };
}

function parseDomainCards(f: FieldMap): DomainCard[] {
  const cards: DomainCard[] = [];
  for (let i = 1; i <= 18; i++) {
    const name = text(f, `Domain Card ${i}, Name`);
    if (!name) continue;
    cards.push({
      name,
      level: num(text(f, `Domain Card ${i}, Level`), 1),
      domain: text(f, `Domain Card ${i}, Domain`),
      type: text(f, `Domain Card ${i}, Type`),
      recall: num(text(f, `Domain Card ${i}, Recall Cost`), 0),
      effect: text(f, `Domain Card ${i}, Effects`),
      location: checked(f, `Domain Card ${i}, Loadout`) ? 'loadout' : 'vault',
    });
  }
  return cards;
}

export function mapHeartOfDaggers(f: FieldMap): { build: DaggerheartBuild; pdfState: DaggerheartState } {
  const traits = Object.fromEntries(
    TRAITS.map((t) => [t, num(text(f, t.charAt(0).toUpperCase() + t.slice(1)))]),
  ) as Record<Trait, number>;

  const experiences = [];
  for (let i = 1; i <= 5; i++) {
    const name = text(f, `Experience ${i}`);
    if (name) experiences.push({ name, bonus: num(text(f, `Experience ${i} Bonus`), 2) });
  }

  const weapons = [1, 2, 3, 4].map((i) => parseWeapon(f, i)).filter((w): w is Weapon => !!w);

  const armorName = text(f, 'Armor Label');
  const baseTh = text(f, 'Armor Base Thresholds').split('/').map((s) => num(s));

  const build: DaggerheartBuild = {
    name: text(f, 'Name'),
    pronouns: text(f, 'Pronouns') || undefined,
    level: num(text(f, 'Level'), 1),
    tier: num(text(f, 'Tier'), 1),
    ancestry: text(f, 'Ancestry'),
    community: text(f, 'Community'),
    class: text(f, 'Class'),
    subclass: text(f, 'Subclass'),
    domains: text(f, 'Domains').split(/[,&]/).map((s) => s.trim()).filter(Boolean),
    spellcastTrait: parseTrait(text(f, 'Spellcast Trait')),
    traits,
    evasion: num(text(f, 'Evasion'), 10),
    armorScore: num(text(f, 'Armor')),
    thresholds: { major: num(text(f, 'Major Damage Threshold')), severe: num(text(f, 'Severe Damage Threshold')) },
    proficiency: Math.max(1, countChecked(f, 'Proficiency', 6)),
    maxHp: maxValue(f, 'HP Max', 6),
    maxStress: maxValue(f, 'Stress Max', 6),
    maxHope: maxValue(f, 'Hope Max', 6),
    experiences,
    weapons,
    armor: armorName
      ? {
          name: armorName,
          baseThresholds: baseTh.length === 2 ? [baseTh[0] ?? 0, baseTh[1] ?? 0] : undefined,
          score: num(text(f, 'Base Armor Score')),
          feature: text(f, 'Armor Feature') || undefined,
        }
      : undefined,
    domainCards: parseDomainCards(f),
    features: {
      hope: text(f, 'Class Hope Feature') || undefined,
      classAndSubclass: text(f, 'Class and Subclass Features') || undefined,
      heritage: text(f, 'Heritage Features') || undefined,
    },
    inventory: [text(f, 'Inventory'), text(f, 'Inventory (Continued)')]
      .join('\n').split('\n').map((s) => s.trim()).filter(Boolean),
    gold: {
      handfuls: num(text(f, 'Gold, Handfuls')),
      bags: num(text(f, 'Gold, Bags')),
      chests: num(text(f, 'Gold, Chests')),
      coins: num(text(f, 'Gold, Coins')),
      stashed: num(text(f, 'Gold, Stashed')),
    },
  };

  const pdfState: DaggerheartState = {
    ...emptyState(),
    hp: countChecked(f, 'HP', 12),
    stress: countChecked(f, 'Stress', 12),
    hope: countChecked(f, 'Hope', 6),
    armorSlots: countChecked(f, 'Armor Slot', 12),
  };
  return { build, pdfState };
}

/**
 * Merge an import into an existing character. The build is replaced; live state is kept unless
 * the note has none yet (first import), in which case the PDF's marks seed it.
 */
export function applyImport(
  existing: DaggerheartCharacter | undefined,
  fields: FieldMap,
  file?: string,
): DaggerheartCharacter {
  const { build, pdfState } = mapHeartOfDaggers(fields);
  const prevArt = new Map((existing?.build.domainCards ?? []).map((c) => [c.name, c.art]));
  build.domainCards = build.domainCards.map((c) => ({ ...c, art: c.art ?? prevArt.get(c.name) }));
  return {
    'dh-character': 1,
    source: { kind: 'heart-of-daggers-pdf', file, imported: new Date().toISOString() },
    player: existing?.player,
    token: existing?.token,
    build,
    state: existing?.state ?? pdfState,
  };
}
