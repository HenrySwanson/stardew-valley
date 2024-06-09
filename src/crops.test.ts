import CROP_DEFINITIONS from "./crop_definitions.json";
import {
  CropData,
  CropDefinition,
  Season,
  Settings,
  getNumberOfHarvests,
  getExpectedCropsPerHarvest,
  NO_QUALITY,
  QualityVector,
  getProceedsFromPreservesJar,
  getProceedsFromKeg,
  getProceedsFromRaw,
  Proceeds,
} from "./crops";

function getCrop(name: string): CropDefinition {
  const crop = CROP_DEFINITIONS.find((c) => c.name == name);
  if (crop === undefined) {
    throw new Error("Crop " + name + " not found!");
  }
  return crop;
}

describe("number of harvests", () => {
  function expectHelper(
    crop: CropDefinition,
    season: Season,
    day: number,
    multiseason_enabled: boolean,
    num_harvests: number,
    duration: number
  ) {
    expect(
      getNumberOfHarvests(crop, season, day, multiseason_enabled)
    ).toStrictEqual({
      number: num_harvests,
      duration,
    });
  }

  test("cauliflower", () => {
    const cauliflower = getCrop("Cauliflower");

    expectHelper(cauliflower, Season.SPRING, 1, false, 1, 12);
    expectHelper(cauliflower, Season.SPRING, 10, false, 1, 12);
    expectHelper(cauliflower, Season.SPRING, 16, false, 1, 12);
    expectHelper(cauliflower, Season.SPRING, 17, false, 0, 0);
    expect(getNumberOfHarvests(cauliflower, Season.SUMMER, 1, false)).toBe(
      "out-of-season"
    );
  });

  test("strawberry", () => {
    const strawberry = getCrop("Strawberry");

    // Days 9, 13, 17, 21, 25
    expectHelper(strawberry, Season.SPRING, 1, false, 5, 24);
    // Days 12, 16, 20, 24, 28
    expectHelper(strawberry, Season.SPRING, 4, false, 5, 24);
    // Days 13, 17, 21, 25
    expectHelper(strawberry, Season.SPRING, 5, false, 4, 20);
    // Day 25, not quite enough time to get another harvest
    expectHelper(strawberry, Season.SPRING, 17, false, 1, 8);
    // Day 28
    expectHelper(strawberry, Season.SPRING, 20, false, 1, 8);
    // No harvest
    expectHelper(strawberry, Season.SPRING, 21, false, 0, 0);
    // Out of season (different from no harvest!)
    expect(getNumberOfHarvests(strawberry, Season.SUMMER, 1, false)).toBe(
      "out-of-season"
    );
  });

  test("multiseason", () => {
    // Single-crop
    const sunflower = getCrop("Sunflower");
    // Multi-crop
    const corn = getCrop("Corn");

    // Tea is just weird always, test it in its own thing

    // Will it grow in the first season, as normal?
    expectHelper(sunflower, Season.SUMMER, 1, false, 1, 8);
    expectHelper(sunflower, Season.SUMMER, 20, false, 1, 8);
    expectHelper(sunflower, Season.SUMMER, 21, false, 0, 0);
    expectHelper(corn, Season.SUMMER, 1, false, 4, 26);
    expectHelper(corn, Season.SUMMER, 3, false, 3, 22);
    expectHelper(corn, Season.SUMMER, 14, false, 1, 14);
    expectHelper(corn, Season.SUMMER, 15, false, 0, 0);

    // What about the second season?
    expectHelper(sunflower, Season.FALL, 1, false, 1, 8);
    expectHelper(sunflower, Season.FALL, 20, false, 1, 8);
    expectHelper(sunflower, Season.FALL, 21, false, 0, 0);
    expectHelper(corn, Season.FALL, 1, false, 4, 26);
    expectHelper(corn, Season.FALL, 14, false, 1, 14);
    expectHelper(corn, Season.FALL, 15, false, 0, 0);

    // Can it cross over when the flag is set?
    expectHelper(sunflower, Season.SUMMER, 21, true, 1, 8);
    expectHelper(sunflower, Season.SUMMER, 28, true, 1, 8);
    expectHelper(corn, Season.SUMMER, 1, true, 4 + 7, 26 + 28);
    expectHelper(corn, Season.SUMMER, 2, true, 4 + 7, 26 + 28);
    expectHelper(corn, Season.SUMMER, 3, true, 3 + 7, 22 + 28);

    // It will not cross over into the wrong season
    expectHelper(sunflower, Season.FALL, 21, true, 0, 0);
    expectHelper(corn, Season.FALL, 25, true, 0, 0);

    // It also won't grow in the wrong season at all
    expect(getNumberOfHarvests(sunflower, Season.SPRING, 1, true)).toBe(
      "out-of-season"
    );
    expect(getNumberOfHarvests(sunflower, Season.SPRING, 28, true)).toBe(
      "out-of-season"
    );
    expect(getNumberOfHarvests(corn, Season.SPRING, 1, true)).toBe(
      "out-of-season"
    );
    expect(getNumberOfHarvests(corn, Season.SPRING, 28, true)).toBe(
      "out-of-season"
    );
  });

  test("tea", () => {
    const tea = getCrop("Tea Leaves");

    expectHelper(tea, Season.SPRING, 1, false, 7, 27);
    expectHelper(tea, Season.SPRING, 2, false, 6, 26);
    expectHelper(tea, Season.SPRING, 3, false, 5, 25);
    expectHelper(tea, Season.SPRING, 7, false, 1, 21);
    expectHelper(tea, Season.SPRING, 8, false, 0, 20);
  });
});

describe("expected crops", () => {
  function expectHelper(
    crop_name: string,
    quality_probabilities: QualityVector<number>,
    expected_crops: QualityVector<number>
  ) {
    const crop = getCrop(crop_name);
    const output = getExpectedCropsPerHarvest(crop, quality_probabilities);
    expect(output.normal).toBeCloseTo(expected_crops.normal);
    expect(output.silver).toBeCloseTo(expected_crops.silver);
    expect(output.gold).toBeCloseTo(expected_crops.gold);
    expect(output.iridium).toBeCloseTo(expected_crops.iridium);
  }

  test("no quality", () => {
    expectHelper("Cauliflower", NO_QUALITY, {
      normal: 1.0,
      silver: 0.0,
      gold: 0.0,
      iridium: 0.0,
    });

    expectHelper("Potato", NO_QUALITY, {
      normal: 1.25, // there's a 25% chance of extras
      silver: 0.0,
      gold: 0.0,
      iridium: 0.0,
    });

    expectHelper("Coffee Bean", NO_QUALITY, {
      normal: 4.02, // there's a 2% chance of extras
      silver: 0.0,
      gold: 0.0,
      iridium: 0.0,
    });

    expectHelper("Tea Leaves", NO_QUALITY, {
      normal: 1.0,
      silver: 0.0,
      gold: 0.0,
      iridium: 0.0,
    });
  });

  test("with quality", () => {
    const quality = {
      normal: 0.4,
      silver: 0.3,
      gold: 0.2,
      iridium: 0.1,
    };

    expectHelper("Cauliflower", quality, {
      normal: 0.4,
      silver: 0.3,
      gold: 0.2,
      iridium: 0.1,
    });

    expectHelper("Potato", quality, {
      normal: 0.4 + 0.25, // there's a 25% chance of extras
      silver: 0.3,
      gold: 0.2,
      iridium: 0.1,
    });

    expectHelper("Coffee Bean", quality, {
      normal: 3.4 + 0.02, // 3 extra beans, with a 2% chance of extras
      silver: 0.3,
      gold: 0.2,
      iridium: 0.1,
    });

    // tea doesn't have quality!
    expectHelper("Tea Leaves", quality, {
      normal: 1.0,
      silver: 0.0,
      gold: 0.0,
      iridium: 0.0,
    });
  });
});

describe("revenue", () => {
  function expectProceeds(
    actual: Proceeds,
    expected_quantity: number,
    expected_price: number
  ) {
    expect(actual.quantity).toBe(expected_quantity);
    expect(actual.price).toBe(expected_price);
  }

  test("raw crops", () => {
    // This is mostly just testing quality multipliers and tiller,
    // since all crops are treated the same.
    const strawberry = getCrop("Strawberry");
    expect(strawberry.sell_price).toBe(120);

    // Check single prices
    const expected_prices: [keyof QualityVector<number>, boolean, number][] = [
      ["normal", false, 120],
      ["silver", false, 150],
      ["gold", false, 180],
      ["iridium", false, 240],
      ["normal", true, 132],
      ["silver", true, 165],
      ["gold", true, 198],
      ["iridium", true, 264],
    ];
    for (const [quality_type, tiller, expected_price] of expected_prices) {
      let quality = { normal: 0, silver: 0, gold: 0, iridium: 0 };
      quality[quality_type] = 1;
      expectProceeds(
        getProceedsFromRaw(strawberry, quality, tiller),
        1,
        expected_price
      );
    }

    // Check scaling
    expectProceeds(
      getProceedsFromRaw(
        strawberry,
        {
          normal: 5,
          silver: 0,
          gold: 0,
          iridium: 0,
        },
        true
      ),
      5,
      132
    );
    expectProceeds(
      getProceedsFromRaw(
        strawberry,
        {
          normal: 1,
          silver: 2,
          gold: 3,
          iridium: 4,
        },
        false
      ),
      10,
      (120 + 2 * 150 + 3 * 180 + 4 * 240) / 10
    );
  });

  test("preserves jar", () => {
    // Fruit
    const strawberry = getCrop("Strawberry");
    expect(strawberry.sell_price).toBe(120);
    expectProceeds(getProceedsFromPreservesJar(strawberry, 1, false)!, 1, 290);
    expectProceeds(
      getProceedsFromPreservesJar(strawberry, 10, false)!,
      10,
      290
    );
    expectProceeds(getProceedsFromPreservesJar(strawberry, 1, true)!, 1, 406);

    // Different fruit
    const blueberry = getCrop("Blueberry");
    expect(blueberry.sell_price).toBe(50);
    expectProceeds(getProceedsFromPreservesJar(blueberry, 1, false)!, 1, 150);

    // Vegetable
    const pumpkin = getCrop("Pumpkin");
    expect(pumpkin.sell_price).toBe(320);
    expectProceeds(getProceedsFromPreservesJar(pumpkin, 1, false)!, 1, 690);
    expectProceeds(getProceedsFromPreservesJar(pumpkin, 1, true)!, 1, 966);

    // Neither
    const poppy = getCrop("Poppy");
    expect(getProceedsFromPreservesJar(poppy, 1, false)).toBeNull();
  });

  test("keg", () => {
    // Special ones
    const wheat = getCrop("Wheat"); // beer
    expectProceeds(getProceedsFromKeg(wheat, 1, false)!, 1, 200);
    expectProceeds(getProceedsFromKeg(wheat, 1, true)!, 1, 280);

    const rice = getCrop("Unmilled Rice"); // vinegar x2
    expectProceeds(getProceedsFromKeg(rice, 1, false)!, 2, 100);
    expectProceeds(getProceedsFromKeg(rice, 1, true)!, 2, 100);

    const coffee = getCrop("Coffee Bean"); // coffee
    expectProceeds(getProceedsFromKeg(coffee, 5, false)!, 1, 150);
    expectProceeds(getProceedsFromKeg(coffee, 5, true)!, 1, 150);

    const tea = getCrop("Tea Leaves"); // tea
    expectProceeds(getProceedsFromKeg(tea, 1, false)!, 1, 100);
    expectProceeds(getProceedsFromKeg(tea, 1, true)!, 1, 140);

    const hops = getCrop("Hops"); // pale ale
    expectProceeds(getProceedsFromKeg(hops, 1, false)!, 1, 300);
    expectProceeds(getProceedsFromKeg(hops, 1, true)!, 1, 420);

    // Fruits into Wines
    const strawberry = getCrop("Strawberry");
    expectProceeds(getProceedsFromKeg(strawberry, 1, false)!, 1, 360);
    expectProceeds(getProceedsFromKeg(strawberry, 1, true)!, 1, 504);
    const blueberry = getCrop("Blueberry");
    expectProceeds(getProceedsFromKeg(blueberry, 1, false)!, 1, 150);
    expectProceeds(getProceedsFromKeg(blueberry, 1, true)!, 1, 210);

    // Vegetables into Juice
    const pumpkin = getCrop("Pumpkin");
    expectProceeds(getProceedsFromKeg(pumpkin, 1, false)!, 1, 720);
    expectProceeds(getProceedsFromKeg(pumpkin, 1, true)!, 1, 1008);
    const carrot = getCrop("Carrot");
    expectProceeds(getProceedsFromKeg(carrot, 1, false)!, 1, 78);
    expectProceeds(getProceedsFromKeg(carrot, 1, true)!, 1, 109);
  });
});
