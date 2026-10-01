/**
 * The material and treasure catalogue, and how deep you have to go for each.
 *
 * Like balance.ts and items.ts, this is the one place to tune what exists,
 * what it is worth and where it falls. Systems and screens read from here;
 * nothing hardcodes a material name, a price or a drop chance.
 *
 * The tiers are the whole of the progression for now. A tier-10 run pays in
 * common stuff worth a handful of coins; the deep runs pay in the things
 * recipes actually ask for. That is what makes a deeper dungeon worth the
 * risk beyond the experience — you cannot buy your way to a Totem out of
 * the shallows, however many times you clear them.
 */

import type { MaterialDef, MaterialId } from '@/domain/material'
import type { DungeonTierId } from './balance'

const defs: MaterialDef[] = [
  // ---- Tier 10: what the shallows give up -------------------------------
  {
    id: 'river_pebble',
    name: '강돌',
    icon: '🪨',
    description: '용궁 어귀에 차고 넘치는 매끈한 돌. 흔하지만 어디에나 쓰입니다.',
    kind: 'material',
    value: 3,
    tiers: ['tier10'],
    dropWeight: 10,
  },
  {
    id: 'shell_shard',
    name: '조개 껍데기 조각',
    icon: '🐚',
    description: '얕은 물가에서 부서진 껍데기. 갈아서 광을 냅니다.',
    kind: 'material',
    value: 4,
    tiers: ['tier10'],
    dropWeight: 8,
  },
  {
    id: 'damp_moss',
    name: '젖은 이끼',
    icon: '🌿',
    description: '돌 틈에서 걷어낸 이끼. 불에 올리면 질긴 실이 됩니다.',
    kind: 'material',
    value: 3,
    tiers: ['tier10'],
    dropWeight: 8,
  },
  {
    id: 'copper_coin_old',
    name: '오래된 엽전',
    icon: '🪙',
    description: '누구의 것이었는지 모를 엽전 한 닢. 팔 것 말고는 쓸모가 없습니다.',
    kind: 'treasure',
    value: 12,
    tiers: ['tier10'],
    dropWeight: 5,
  },

  // ---- Tier 25: the middle depths ---------------------------------------
  {
    id: 'dragon_scale',
    name: '용 비늘',
    icon: '🐉',
    description: '손바닥만 한 비늘 한 장. 두드리면 쇠처럼 울립니다.',
    kind: 'material',
    value: 14,
    tiers: ['tier25'],
    dropWeight: 9,
  },
  {
    id: 'coral_core',
    name: '산호 심',
    icon: '🪸',
    description: '산호 한가운데서 굳은 속. 열을 오래 머금습니다.',
    kind: 'material',
    value: 12,
    tiers: ['tier25'],
    dropWeight: 8,
  },
  {
    id: 'rusted_ingot',
    name: '녹슨 쇳덩이',
    icon: '⛓️',
    description: '바닥에 가라앉아 있던 쇳덩이. 녹을 벗기면 아직 쓸 만합니다.',
    kind: 'material',
    value: 11,
    tiers: ['tier25'],
    dropWeight: 8,
  },
  {
    id: 'jade_seal',
    name: '옥 도장',
    icon: '🟩',
    description: '이름이 닳아 없어진 옥 도장. 값은 제법 나갑니다.',
    kind: 'treasure',
    value: 46,
    tiers: ['tier25'],
    dropWeight: 4,
  },

  // ---- Tier 50: the deep ------------------------------------------------
  {
    id: 'abyss_pearl',
    name: '심해 진주',
    icon: '🔮',
    description: '빛이 닿은 적 없는 곳에서 자란 진주. 손에 쥐면 서늘합니다.',
    kind: 'material',
    value: 40,
    tiers: ['tier50'],
    dropWeight: 7,
  },
  {
    id: 'dragon_horn',
    name: '용왕의 뿔',
    icon: '🦌',
    description: '부러진 뿔 한 토막. 이것 없이는 만들 수 없는 것들이 있습니다.',
    kind: 'material',
    value: 55,
    tiers: ['tier50'],
    dropWeight: 4,
  },
  {
    id: 'sky_steel',
    name: '하늘빛 강철',
    icon: '⚙️',
    description: '떨어진 별에서 나온 쇠. 식은 뒤에도 푸른빛이 남습니다.',
    kind: 'material',
    value: 48,
    tiers: ['tier50'],
    dropWeight: 5,
  },
  {
    id: 'crown_fragment',
    name: '금관 조각',
    icon: '👑',
    description: '누군가의 관에서 떨어져 나온 금붙이. 그대로 값이 됩니다.',
    kind: 'treasure',
    value: 130,
    tiers: ['tier50'],
    dropWeight: 3,
  },

  // ---- The crafting line -------------------------------------------------
  // What a Totem is actually made of. These are not graded by depth the way
  // the selling stock above is: a recipe asks for more of them rather than
  // for rarer ones, so they fall at every tier and the difference between a
  // slime and a Ryu is how long you have to keep at it.
  {
    id: 'meteor_iron',
    name: '운철',
    icon: '☄️',
    description: '하늘에서 떨어진 쇠. 토템의 뼈대가 되는 금속입니다.',
    kind: 'material',
    value: 26,
    tiers: ['tier10', 'tier25', 'tier50'],
    dropWeight: 7,
  },
  {
    id: 'hanji',
    name: '한지',
    icon: '📜',
    description: '닥나무로 뜬 종이. 말을 받아 적어 토템의 몸에 붙입니다.',
    kind: 'material',
    value: 18,
    tiers: ['tier10', 'tier25', 'tier50'],
    dropWeight: 7,
  },
  {
    id: 'red_ink',
    name: '붉은 먹',
    icon: '🖌️',
    description: '주칠 합에 갈아 둔 붉은 먹. 한지에 적힌 말을 지워지지 않게 합니다.',
    kind: 'material',
    value: 14,
    tiers: ['tier10', 'tier25', 'tier50'],
    dropWeight: 8,
  },
  {
    id: 'memory_dragon_king_palace',
    name: '세계의 기억 · 용왕의 단지',
    icon: '🏺',
    description: '용궁에서만 건져 올릴 수 있는 단지. 그 세계의 기억이 담겨 있어, 용궁의 토템에는 반드시 들어갑니다.',
    kind: 'material',
    value: 60,
    tiers: ['tier10', 'tier25', 'tier50'],
    worlds: ['dragon-king-palace'],
    dropWeight: 5,
  },
  {
    id: 'core_lantern_of_ryu',
    name: '핵심 기억 · 류의 등불',
    icon: '🏮',
    description: '물의 용 류가 꺼뜨리지 않던 등불. 류를 벼리려면 류에게서 받아야 합니다.',
    kind: 'material',
    value: 220,
    tiers: ['tier25'],
    worlds: ['dragon-king-palace'],
    // Never in the ordinary table: this is what Ryu leaves behind, and the
    // only way to get one is to put Ryu down.
    fromBoss: 'waterDragonRyu',
    dropWeight: 0,
    // And never over the counter either. Beating Ryu again is the only way
    // to replace one.
    sellable: false,
  },
]

export const materialDefs: Record<MaterialId, MaterialDef> = Object.fromEntries(
  defs.map((d) => [d.id, d]),
)

export const allMaterialDefs: readonly MaterialDef[] = defs

export function isMaterialId(id: string): boolean {
  return id in materialDefs
}

/**
 * Looks a material up, or returns undefined for an id this build does not
 * know. A save written against a later catalogue can hold one, and an
 * unknown stack should sit there harmlessly rather than crash the bag.
 */
export function findMaterialDef(id: MaterialId): MaterialDef | undefined {
  return materialDefs[id]
}

/**
 * Throws for an unknown id. For the places that have already established
 * the id is real — a recipe's ingredient list, a bag entry that was
 * filtered — where an optional type would only add noise.
 */
export function getMaterialDef(id: MaterialId): MaterialDef {
  const def = materialDefs[id]
  if (!def) throw new Error(`unknown material: ${id}`)
  return def
}

/**
 * What can fall at this tier, in this world.
 *
 * `worldId` is optional so a caller with no world in hand — a test, a
 * screen listing the catalogue — still gets a sensible table; passing one
 * narrows it to what that place actually yields. A material tied to a boss
 * is never here: it is not a roll.
 */
export function materialsForTier(tierId: DungeonTierId, worldId?: string): readonly MaterialDef[] {
  return defs.filter(
    (d) =>
      d.dropWeight > 0 &&
      !d.fromBoss &&
      d.tiers.includes(tierId) &&
      (!d.worlds || !worldId || d.worlds.includes(worldId)),
  )
}

/** What this boss leaves behind, beyond the ordinary drops. */
export function materialsFromBoss(bossSlot: string): readonly MaterialDef[] {
  return defs.filter((d) => d.fromBoss === bossSlot)
}

export const materialBalance = {
  /** Chance an opened chest also gives up a material or a treasure. */
  treasureDropChance: 0.7,
  /** Chance a Magic Room's hoard includes one. */
  magicRoomDropChance: 0.9,
  /** Chance a defeated ordinary enemy leaves one behind. */
  enemyDropChance: 0.22,
  /** Chance a defeated Mimic does. Mimics are chests; they carry chest loot. */
  mimicDropChance: 0.8,
  /** How many a boss always drops. */
  bossDropCount: 3,
}
