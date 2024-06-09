"use strict";

import CROP_DEFINITIONS from "./crop_definitions.json";

export type CropDefinition = (typeof CROP_DEFINITIONS)[number];

export enum Season {
  SPRING,
  SUMMER,
  FALL,
  WINTER,
}

export namespace Season {
  export function fromString(s: string): Season {
    switch (s.toUpperCase()) {
      case "SPRING":
        return Season.SPRING;
      case "SUMMER":
        return Season.SUMMER;
      case "FALL":
        return Season.FALL;
      case "WINTER":
        return Season.WINTER;
      default:
        throw new Error(`Unknown season ${s}`);
    }
  }

  export function toString(s: Season): string {
    switch (s) {
      case Season.SPRING:
        return "Spring";
      case Season.SUMMER:
        return "Summer";
      case Season.FALL:
        return "Fall";
      case Season.WINTER:
        return "Winter";
    }
  }

  export function getArray(start: Season, num: number): Season[] {
    const seasons: Season[] = [];
    for (let i = 0; i < num; i++) {
      seasons.push(start.valueOf() + i);
    }
    return seasons;
  }
}

export type ProcessingType = "raw" | "preserves" | "keg" | "oil";

export type CropData = {
  definition: CropDefinition;
  useful_days: number;
  num_harvests: number;
  num_crops: number;
  crop_proceeds: QualityVector<Proceeds>;
  processing_type: ProcessingType;
  proceeds: Proceeds;
  revenue: number;
  profit: number;
};

export type QualityVector<T> = {
  normal: T;
  silver: T;
  gold: T;
  iridium: T;
};

function qualityMap<T, U>(
  q: QualityVector<T>,
  fn: (_: T) => U
): QualityVector<U> {
  return {
    normal: fn(q.normal),
    silver: fn(q.silver),
    gold: fn(q.gold),
    iridium: fn(q.iridium),
  };
}

function qualityZip<T1, T2, U>(
  q1: QualityVector<T1>,
  q2: QualityVector<T2>,
  fn: (_1: T1, _2: T2) => U
): QualityVector<U> {
  return {
    normal: fn(q1.normal, q2.normal),
    silver: fn(q1.silver, q2.silver),
    gold: fn(q1.gold, q2.gold),
    iridium: fn(q1.iridium, q2.iridium),
  };
}

function qualitySum(q: QualityVector<number>): number {
  return q.normal + q.silver + q.gold + q.iridium;
}

export function qualityDot(
  q1: QualityVector<number>,
  q2: QualityVector<number>
): number {
  return qualitySum(qualityZip(q1, q2, (v1, v2) => v1 * v2));
}

export const NO_QUALITY: QualityVector<number> = {
  normal: 1,
  silver: 0,
  gold: 0,
  iridium: 0,
};

export const PRICE_MULTIPLIERS: QualityVector<number> = {
  normal: 1.0,
  silver: 1.25,
  gold: 1.5,
  iridium: 2.0,
};

function multiplyPriceByPercentage(
  base: number,
  percentage: number,
  apply: boolean = true
): number {
  if (apply) {
    // We use (e.g.) 40 instead of 0.4 here, because we can lose precision otherwise.
    // For example, 690 * 1.4 is exactly 966, but JS computes it as 965.99999
    return Math.trunc((base * percentage) / 100);
  } else {
    return base;
  }
}

/// Returns the quality ratios for a given farming level
export function computeQuality(farming_level: number): QualityVector<number> {
  // https://stardewvalleywiki.com/Farming#Complete_Formula_2
  const fertilizer_level = 0;

  // Quality for a crop is determined by a series of weighted coin flips.
  // The probabilities for the coins are computed here.
  const p_gold_coin =
    0.2 * (farming_level / 10.0) +
    0.2 * fertilizer_level * ((farming_level + 2.0) / 12.0) +
    0.01;
  const p_silver_coin = Math.min(2 * p_gold_coin, 0.75);
  let p_iridium_coin = p_gold_coin / 2;

  // TODO: this is only enabled at certain fertilizer levels
  p_iridium_coin = 0;

  // However, these coins are flipped one at a time, so we have slightly more
  // work to do to find out the final probabilities.

  // Chance of iridium is just the local chance of iridium.
  const iridium = p_iridium_coin;
  // To get gold, don't be iridium, and pass the gold coin flip.
  const gold = (1 - iridium) * p_gold_coin;
  // Similarly, for silver, don't be iridum or gold, and pass the
  // silver coin flip.
  const silver = (1 - iridium - gold) * p_silver_coin;
  // Base quality is everything else.
  const normal = 1 - iridium - gold - silver;

  return { normal, silver, gold, iridium };
}

export type Settings = {
  season: Season;
  start_day: number;
  multiseason_enabled: boolean;
  quality_probabilities: QualityVector<number> | null;
  tiller_skill_chosen: boolean;
  artisan_skill_chosen: boolean;
  preserves_jar_enabled: boolean;
  kegs_enabled: boolean;
  oil_maker_enabled: boolean;
};

type Harvests = {
  number: number;
  duration: number;
};

export function getNumberOfHarvests(
  crop: CropDefinition,
  current_season: Season,
  current_day: number,
  multiseason_enabled: boolean
): Harvests | "out-of-season" {
  // When is this crop in-season?
  // Note: Cactus Fruit has no season; watch out for that!
  if (!crop.season) {
    return "out-of-season";
  }

  const seasons: Season[] = Season.getArray(
    Season.fromString(crop.season),
    crop.multiseason ?? 1
  );

  // Bail out if we're out of season
  if (!seasons.includes(current_season)) {
    return "out-of-season";
  }

  // How many days do we have left?
  const seasons_left = multiseason_enabled
    ? seasons.length - seasons.indexOf(current_season)
    : 1;
  const days_left = 28 * seasons_left - current_day;

  // In the number of days remaining, how many harvests do we get?
  if (!crop.special_handling) {
    let num_harvests = 0;
    let useful_days = 0;

    if (days_left >= crop.days_to_grow) {
      num_harvests += 1;
      useful_days += crop.days_to_grow;
      if (crop.regrowth_period) {
        const extra_harvests = Math.floor(
          (days_left - crop.days_to_grow) / crop.regrowth_period
        );
        num_harvests += extra_harvests;
        useful_days += extra_harvests * crop.regrowth_period;
      }
    }

    return {
      number: num_harvests,
      duration: useful_days,
    };
  } else if (crop.special_handling == "tea") {
    // Is this tea? If so, skip all that; compute it differently.

    // First figure out how many we get during the first season.
    const becomes_bush_at = current_day + crop.days_to_grow;
    const leaves_harvested_first_season = Math.max(
      0, // can't go negative!
      28 - Math.max(21, becomes_bush_at) // half-inclusive; tea bush does not produce on first day
    );
    // ^^ TODO: if i plant on the 1st, it becomes a bush on the 21st, and produces on the 2nd.
    // if i plant on the 2nd, it becomes a bush on the 22nd -- it doesn't produce, i think?

    return {
      // The other seasons we get all 7 harvests.
      number: leaves_harvested_first_season + 7 * (seasons_left - 1),
      duration: days_left, // idk
    };
  } else {
    throw new Error("Unrecognized special value: " + crop.special_handling);
  }
}

export function getExpectedCropsPerHarvest(
  crop: CropDefinition,
  q: QualityVector<number>
): QualityVector<number> {
  if (!crop.special_handling) {
    // We can sometimes get multiple crops per harvest, but all the extra crops
    // will be regular quality.
    // TODO: is this true? i see conflicting sources online
    const crop_yield =
      (crop.yield ?? 1) + (crop.percent_chance_extra ?? 0) / 100.0;

    // Make a full copy; no cloning issues!
    let output = qualityMap(q, (x) => x);
    output.normal += crop_yield - 1;
    return output;
  } else if (crop.special_handling == "tea") {
    // Tea has no quality and no multipliers
    return NO_QUALITY;
  } else {
    throw new Error("Unrecognized special " + crop.special_handling);
  }
}

export type Proceeds = {
  name: string;
  price: number;
  quantity: number;
};

export function getCropPrices(
  crop: CropDefinition,
  tiller: boolean
): QualityVector<number> {
  const tiller_applicable =
    crop.type == "fruit" || crop.type == "vegetable" || crop.type == "flower";
  return qualityMap(PRICE_MULTIPLIERS, (multiplier) => {
    // Note: prices are rounded down after each multiplier, and
    // quality is applied first.
    //
    // Proof: Silver Ancient Fruit is 687, and 755 with Tiller.
    //   550 * 1.25 = 687.5 -> 687
    //   687 * 1.1 = 755.7 -> 755
    // but 550 * 1.25 * 1.1 = 756.25, too high
    // and trunc(550 * 1.1) * 1.25 is the same
    return multiplyPriceByPercentage(
      multiplyPriceByPercentage(crop.sell_price, Math.round(100 * multiplier)),
      110,
      tiller && tiller_applicable
    );
  });
}

function getVectorProceedsFromRaw(
  crop: CropDefinition,
  quantity: QualityVector<number>,
  tiller: boolean
): QualityVector<Proceeds> {
  const prices = getCropPrices(crop, tiller);
  return qualityZip(prices, quantity, (price, quantity) => {
    return { name: crop.name, price, quantity };
  });
}

export function getProceedsFromRaw(
  crop: CropDefinition,
  quantity: QualityVector<number>,
  tiller: boolean
): Proceeds {
  const prices = getCropPrices(crop, tiller);

  // Average price is tricky! We can't just average the prices directly,
  // because there will be a non-uniform quantity distribution.
  const total_crops = qualitySum(quantity);
  const total_revenue = qualityDot(prices, quantity);
  const avg_price =
    total_crops === 0 ? crop.sell_price : total_revenue / total_crops;

  return {
    name: crop.name,
    price: avg_price,
    quantity: total_crops,
  };
}

export function getProceedsFromPreservesJar(
  crop: CropDefinition,
  quantity: number,
  artisan: boolean
): Proceeds | null {
  // Only fruits and veggies can be preserved
  let name: string;
  switch (crop.type) {
    case "fruit":
      name = "Jelly";
      break;
    case "vegetable":
      name = "Pickles";
      break;
    default:
      return null;
  }

  // Quality makes no difference! Everything is the same price.
  const base_price = 2 * crop.sell_price + 50;
  const price = multiplyPriceByPercentage(base_price, 140, artisan);
  return { name, price, quantity };
}

function getKeggedGood(crop: CropDefinition): [string, number] | null {
  // First deal with some special cases
  // TODO: more robust than name matching?
  switch (crop.name) {
    case "Wheat":
      return ["Beer", 200]; // beer
    case "Unmilled Rice":
      // technically this only works if you have milled rice...
      return ["Vinegar", 100]; // vinegar
    case "Coffee Bean":
      return ["Coffee", 150]; // coffee
    case "Tea Leaves":
      return ["Green Tea", 100]; // green tea
    case "Hops":
      return ["Pale Ale", 300]; // pale ale
    default:
    // fall through to checking crop type
  }

  switch (crop.type) {
    case "fruit":
      return ["Wine", 3 * crop.sell_price];
    case "vegetable":
      return ["Juice", multiplyPriceByPercentage(crop.sell_price, 225)];
    default:
      return null;
  }
}

export function getProceedsFromKeg(
  crop: CropDefinition,
  quantity: number,
  artisan: boolean
): Proceeds | null {
  const good = getKeggedGood(crop);
  if (good === null) {
    return null;
  }
  const [good_name, base_price] = good;

  switch (good_name) {
    case "Coffee":
      // Coffee is a special case: it takes 5 beans and also it's not an
      // artisan good...
      return {
        name: good_name,
        price: base_price,
        quantity: quantity / 5,
      };
    case "Vinegar":
      // Same with vinegar; produces 2 per rice, and isn't artisan good
      return {
        name: good_name,
        price: base_price,
        quantity: quantity * 2,
      };
    default:
      // Everything else is straightforward
      const price = multiplyPriceByPercentage(base_price, 140, artisan);
      return { name: good_name, price, quantity };
  }
}

function getOilAmount(crop: CropDefinition): number | null {
  switch (crop.name) {
    case "Corn":
      return 1;
    case "Sunflower":
      // Each sunflower harvest gives 1 flower and 0-2 seeds (avg 1).
      // If the sunflower is put into the seed maker first, then that gives
      // two more seeds (avg), for a total of 3.
      return 3;
    default:
      return null;
  }
}

export function getProceedsFromOilMaker(
  crop: CropDefinition,
  quantity: number
): Proceeds | null {
  // Either we make oil or we don't, but the amount we make depends on the
  // crop (because sunflowers have seeds to think about).
  const oil_amount = getOilAmount(crop);
  if (oil_amount === null) {
    return null;
  }

  return {
    name: "Oil",
    price: 100, // no artisan bonus!
    quantity: oil_amount * quantity,
  };
}

export function calculate(
  crop: CropDefinition,
  settings: Settings
): CropData | "out-of-season" {
  // How many harvests do we get, if any?
  const harvests = getNumberOfHarvests(
    crop,
    settings.season,
    settings.start_day,
    settings.multiseason_enabled
  );

  if (harvests == "out-of-season") {
    return "out-of-season";
  }

  // How many crops of each quality do we expect to get, in total.
  const quality_probabilities = settings.quality_probabilities ?? NO_QUALITY;
  const per_harvest = getExpectedCropsPerHarvest(crop, quality_probabilities);
  const total_crops_by_quality = qualityMap(
    per_harvest,
    (x) => x * harvests.number
  );
  const total_crops = qualitySum(total_crops_by_quality);

  // Now we have a bunch of crops. What is the most profitable thing to do with them?
  const raw_proceeds = getProceedsFromRaw(
    crop,
    total_crops_by_quality,
    settings.tiller_skill_chosen
  );
  let other_options: [ProcessingType, Proceeds | null][] = [];
  if (settings.preserves_jar_enabled) {
    other_options.push([
      "preserves",
      getProceedsFromPreservesJar(
        crop,
        total_crops,
        settings.artisan_skill_chosen
      ),
    ]);
  }
  if (settings.kegs_enabled) {
    other_options.push([
      "keg",
      getProceedsFromKeg(crop, total_crops, settings.artisan_skill_chosen),
    ]);
  }
  if (settings.oil_maker_enabled) {
    other_options.push(["oil", getProceedsFromOilMaker(crop, total_crops)]);
  }

  // Which one is the best? Start with raw.
  let best_processing: [ProcessingType, Proceeds, number] = [
    "raw",
    raw_proceeds,
    raw_proceeds.price * raw_proceeds.quantity,
  ];
  for (const [type, proceeds] of other_options) {
    if (proceeds === null) {
      continue;
    }
    const revenue = proceeds.price * proceeds.quantity;
    if (revenue > best_processing[2]) {
      best_processing = [type, proceeds, revenue];
    }
  }

  // So, putting it all together
  return {
    definition: crop,
    useful_days: harvests.duration,
    num_harvests: harvests.number,
    num_crops: total_crops,
    crop_proceeds: getVectorProceedsFromRaw(
      crop,
      total_crops_by_quality,
      settings.tiller_skill_chosen
    ),
    processing_type: best_processing[0],
    proceeds: best_processing[1],
    revenue: best_processing[2],
    profit: best_processing[2] - crop.seed_cost,
  };
}
