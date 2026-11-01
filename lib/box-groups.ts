import type { BoxConfig } from "@/types/boxes";
import type { BoxGroupRecord } from "@/types/participants";

export interface BoxGroup {
  id: string;
  letter: string;
  label: string;
  names: readonly string[];
}

export const BOX_GROUPS: readonly BoxGroup[] = [
  {
    id: "group-a-1000",
    letter: "A",
    label: "Gruppe A: 10:00 Uhr",
    names: [
      "Mohammed Ali",
      "Maryam El",
      "Maryam",
      "Oussama A",
      "Oussama B",
      "Marwan A",
      "Marwan B",
      "Nacer",
      "Douae",
      "Nadia",
      "Khadija A",
      "Khadija B",
      "Aya",
      "Salma",
      "Imad",
      "Tarik",
      "Mohammed",
      "Layla",
      "Sanae",
      "Rachid",
      "Yassin",
      "MohamedB",
      "Azzedin",
    ],
  },
  {
    id: "group-b-1300",
    letter: "B",
    label: "Gruppe B: 13:00 Uhr",
    names: [
      "Anwar",
      "Karim",
      "Soukaina",
      "Hajar",
      "Touda",
      "Maria",
      "Oumayma",
      "Bassma",
      "Fayza",
      "Adam",
      "Walid",
      "Mohammed",
      "Nourdine",
      "Hamza A",
      "Hamza B",
      "Haytham",
      "Mouhssine",
      "Amine",
      "Lahsen",
      "Manal",
      "Nour",
      "Abdlmounim",
      "Hanane",
      "Khalid",
    ],
  },
  {
    id: "group-c-1600",
    letter: "C",
    label: "Gruppe C: 16:00 Uhr",
    names: [
      "Asmae",
      "Smahane",
      "Saad",
      "Hajar",
      "Amina",
      "Ayoub",
      "Omar",
      "Rida",
      "Hamid",
      "Zine Eddine",
      "Souad",
      "Roa",
      "Farah",
      "Abdeljalil",
      "Mohammed",
      "Driss",
      "Fatim Zahrae",
      "Fati",
      "Soukaina",
    ],
  },
  {
    id: "group-d-1830",
    letter: "D",
    label: "Gruppe D: 18:30 Uhr",
    names: [
      "Fatima Zahra El",
      "Mohammed 1",
      "Mohammed 2",
      "Mohammed 3",
      "Mohammed 4",
      "Issam",
      "Youssef",
      "Zakaria 1",
      "Zakaria 2",
      "Oumayma",
      "Jamal",
      "Houssam",
      "Fatima Zahra",
      "Fati 3",
      "Fati 4",
      "Meriem",
      "Rabab",
      "Hamza",
      "Nasser",
    ],
  },
  {
    id: "group-e-1600",
    letter: "E",
    label: "Gruppe E: 16.00 Uhr",
    names: [
      "Soufiane Soga",
      "Noufal Kouita",
      "Aya Blutmizguida",
      "Imad Chibane",
      "Moslih Zineb",
      "Saida Zaikaoumi",
      "Ghita Bouzeggar",
      "Hossam El Adel",
      "Amine Ajloca",
    ],
  },
];

export const BOX_GROUP_IDS: ReadonlySet<string> = new Set(BOX_GROUPS.map((group) => group.id));

export const GROUP_BOX_COUNT = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function boxGroupLabel(name: string, time: string): string {
  const cleanName = name.trim();
  const cleanTime = time.trim();
  return cleanTime ? `${cleanName}: ${cleanTime}` : cleanName;
}

export function boxGroupLetter(name: string): string {
  const cleanName = name.trim();
  const match = cleanName.match(/^gruppe\s+(.+)$/i);
  const rest = (match ? match[1] : cleanName).trim();
  return rest.split(":")[0]?.trim() || "?";
}

export function boxGroupFromRecord(
  record: BoxGroupRecord,
  names: readonly string[] = [],
): BoxGroup {
  return {
    id: record.id,
    letter: boxGroupLetter(record.name),
    label: boxGroupLabel(record.name, record.time),
    names: [...names],
  };
}

export function sanitizeBoxGroupRecords(
  input: unknown,
  now: number = Date.now(),
): BoxGroupRecord[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const records: BoxGroupRecord[] = [];

  for (const entry of input) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const time = typeof entry.time === "string" ? entry.time.trim() : "";
    if (!id || !name || BOX_GROUP_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    const createdAt =
      typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt)
        ? entry.createdAt
        : now;
    records.push({
      id,
      name,
      time,
      createdAt,
      updatedAt:
        typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt)
          ? entry.updatedAt
          : createdAt,
    });
  }

  return records;
}

function emptyGroupContents(group: BoxGroup, count: number): BoxConfig["contents"] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${group.id}-box-${index + 1}`,
    type: "text",
    text: "",
  }));
}

export function createGroupConfig(
  group: BoxGroup,
  createdAt = Date.now(),
  participants: readonly string[] = group.names,
): BoxConfig {
  const now = Date.now();
  return {
    id: group.id,
    name: group.label,
    boxCount: GROUP_BOX_COUNT,
    participants: [...participants],
    contents: emptyGroupContents(group, GROUP_BOX_COUNT),
    createdAt,
    updatedAt: now,
    saveState: "draft",
    savedAt: null,
    draftUpdatedAt: now,
  };
}

export function withGroupParticipants(
  config: BoxConfig,
  group: BoxGroup,
  participants: readonly string[] = group.names,
): BoxConfig {
  const participantsChanged =
    config.participants.length !== participants.length ||
    config.participants.some((name, index) => name !== participants[index]);

  let boxCount = config.boxCount;
  let contents = config.contents;
  let cleanedLegacy = false;
  const legacyShape =
    config.boxCount === group.names.length && config.contents.length === group.names.length;

  if (legacyShape) {
    const hasManualQuestions = config.contents.some(
      (content, index) => content.text.trim() !== "" && content.text !== group.names[index],
    );

    if (!hasManualQuestions) {
      boxCount = GROUP_BOX_COUNT;
      contents = emptyGroupContents(group, GROUP_BOX_COUNT);
      cleanedLegacy = true;
    } else {
      const cleaned = config.contents.map((content, index) =>
        content.text === group.names[index] ? { ...content, text: "" } : content,
      );
      if (cleaned.some((content, index) => content.text !== config.contents[index].text)) {
        contents = cleaned;
        cleanedLegacy = true;
      }
    }
  }

  if (!participantsChanged && !cleanedLegacy) return config;

  const now = Date.now();
  return {
    ...config,
    participants: [...participants],
    boxCount,
    contents,
    updatedAt: now,
    ...(config.saveState === "draft" ? { draftUpdatedAt: now } : {}),
  };
}
