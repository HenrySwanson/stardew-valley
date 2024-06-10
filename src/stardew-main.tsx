"use strict";

import {
  CropData,
  Season,
  computeQuality,
  calculate,
  Settings,
  ProcessingType,
  QualityVector,
  Level10Profession,
  Fertilizer,
  QualityFertilizer,
  SpeedGro,
  Quality,
} from "./crops";
import "./stardew.scss";

import { ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";

// should i pull this from a JSON like i'm doing now? or should i just
// hard-code it inline (might be more readable)
import CROP_DEFINITIONS from "./crop_definitions.json";

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

function toFixedOrInteger(n: number, fractionDigits?: number): string {
  if (Number.isInteger(n)) {
    return n.toString();
  }
  return n.toFixed(fractionDigits);
}

function titleCase(word: string): string {
  return word.substring(0, 1).toUpperCase() + word.substring(1).toLowerCase();
}

// Sorts
function compareNumbers(x: number, y: number): number {
  return x - y;
}

function compareNullableNumbers(
  x: number | null,
  y: number | null,
  nullIs: "min" | "max" = "min"
): number {
  if (x === null && y === null) {
    return 0;
  }
  if (x === null) {
    return nullIs === "min" ? -1 : 1;
  }
  if (y === null) {
    return nullIs === "min" ? 1 : -1;
  }
  return x - y;
}

const QUALITIES: Quality[] = ["normal", "silver", "gold", "iridium"];

const QUALITY_STAR_ICONS: QualityVector<string> = {
  normal: "Base_Quality.png",
  silver: "Silver_Quality.png",
  gold: "Gold_Quality.png",
  iridium: "Iridium_Quality.png",
};

// Some GUI helper stuff
function InlineIcon({ src }: { src: string }) {
  const fullPath = import.meta.env.BASE_URL + "/img/" + src;
  return <img className="inline-icon" src={fullPath} />;
}

function IconTag({ src, children }: { src: string; children: ReactNode }) {
  return (
    <>
      <InlineIcon src={src} />
      <span className="after-inline-icon">{children}</span>
    </>
  );
}

function GoldTag({
  amount,
  fractionalDigits = 2,
}: {
  amount: number;
  fractionalDigits?: number;
}) {
  return <IconTag src="Gold.png">{amount.toFixed(fractionalDigits)}g</IconTag>;
}

function TimeTag({ days }: { days: number }) {
  return <IconTag src="Time.png">{days.toString()}d</IconTag>;
}

function GoodTag({ name }: { name: string }) {
  return <IconTag src={getIconPath(name)}>{name}</IconTag>;
}

function enableIf(enabled: boolean) {
  return enabled ? undefined : "disabled";
}

function getIconPath(name: string): string {
  // NOTE: replace(string, string) only replaces the first one
  return name.replace(/ /g, "_") + ".png";
}

// Defines the set of columns for the whole table.
type Column = {
  name: string;
  cellText: (crop: CropData) => string | JSX.Element;
  compare: (a: CropData, b: CropData) => number;
};

function makeColumn<T>(
  name: string,
  keyFn: (crop: CropData) => T,
  cellText: (key: T) => string | JSX.Element,
  compare: (keyA: T, keyB: T) => number
): Column {
  return {
    name,
    cellText: (crop: CropData) => {
      const key = keyFn(crop);
      return cellText(key);
    },
    compare: (a: CropData, b: CropData) => {
      const keyA = keyFn(a);
      const keyB = keyFn(b);
      return compare(keyA, keyB);
    },
  };
}

const COLUMNS: Column[] = [
  makeColumn(
    "Name",
    (crop: CropData) => crop.definition.name,
    (name: string) => {
      return <IconTag src={getIconPath(name)}>{name}</IconTag>;
    },
    (a: string, b: string) => a.localeCompare(b)
  ),
  makeColumn(
    "Num Crops",
    (crop: CropData) => crop.num_crops,
    (n: number) => toFixedOrInteger(n, 2),
    compareNumbers
  ),
  makeColumn(
    "Duration",
    (crop: CropData) => crop.useful_days,
    (n: number) => <TimeTag days={n} />,
    compareNumbers
  ),
  makeColumn(
    "Processing",
    (crop: CropData) => crop.processing_type,
    (type: ProcessingType) => {
      switch (type) {
        case "raw":
          return "-";
        case "preserves":
          return "Preserves Jar";
        case "keg":
          return "Keg";
        case "oil":
          return "Oil Maker";
      }
    },
    (a, b) => a.localeCompare(b)
  ),
  makeColumn(
    "Num Produced",
    (crop: CropData) => crop.proceeds.quantity,
    (quantity: number) => {
      return quantity.toFixed(2);
    },
    compareNumbers
  ),
  makeColumn(
    "Revenue",
    (crop: CropData) => crop.revenue,
    (revenue: number) => {
      return <GoldTag amount={revenue} />;
    },
    compareNumbers
  ),
  makeColumn(
    "Profit",
    (crop: CropData) => crop.profit,
    (profit: number) => {
      return <GoldTag amount={profit} />;
    },
    compareNumbers
  ),
  makeColumn(
    "Daily Profit",
    (crop: CropData) =>
      crop.useful_days !== 0 ? crop.profit / crop.useful_days : null,
    (daily_profit: number | null) => {
      if (daily_profit === null) {
        return "-";
      }
      return <GoldTag amount={daily_profit} />;
    },
    compareNullableNumbers
  ),
];

function CropRow({
  crop_data,
  on_click,
}: {
  crop_data: CropData;
  on_click: (crop_name: string) => void;
}) {
  const cells = [];
  for (const col of COLUMNS) {
    const value = col.cellText(crop_data);
    cells.push(<td key={col.name}>{value}</td>);
  }

  // Disable a row if it can't be harvested this season
  return (
    <tr
      className={enableIf(crop_data.num_harvests > 0)}
      onClick={() => on_click(crop_data.definition.name)}
    >
      {cells}
    </tr>
  );
}

type SortDirection = "ascending" | "descending";
function flipDirection(x: SortDirection): SortDirection {
  switch (x) {
    case "ascending":
      return "descending";
    case "descending":
      return "ascending";
  }
}

function CropTable({
  crop_data,
  on_row_click,
}: {
  crop_data: CropData[];
  on_row_click: (crop_name: string) => void;
}) {
  const [currentSort, setCurrentSort] = useState<
    [number, SortDirection] | null
  >(null);

  function handleClick(idx: number) {
    // Which way do we sort?
    let dir: SortDirection;
    if (currentSort !== null && currentSort[0] === idx) {
      dir = flipDirection(currentSort[1]);
    } else {
      dir = "ascending";
    }
    setCurrentSort([idx, dir]);
  }

  function sortCropData(): CropData[] {
    // If no sort selected, default is to sort by name
    const [idx, dir] = currentSort === null ? [0, "ascending"] : currentSort;

    // We first sort our own collection, then use that to re-insert
    // our row elements.
    crop_data.sort((a, b) => {
      const compare = COLUMNS[idx].compare(a, b);
      return dir === "ascending" ? compare : -compare;
    });
    return crop_data;
  }

  // Create table header
  const header_cells = COLUMNS.map((col, idx) => {
    const aria_sort = currentSort?.[0] == idx ? currentSort[1] : undefined;
    return (
      <th key={col.name} onClick={() => handleClick(idx)} aria-sort={aria_sort}>
        {col.name}
      </th>
    );
  });

  // Create the rows
  const rows = sortCropData().map((data) => (
    <CropRow
      key={data.definition.name}
      crop_data={data}
      on_click={on_row_click}
    ></CropRow>
  ));

  return (
    <table className="sortable">
      <thead>
        <tr>{header_cells}</tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}

type Inputs = {
  season: Season;
  start_day: number;
  multiseason_checked: boolean;
  quality_checkbox: boolean;
  farming_level: number;
  tiller_checkbox: boolean;
  level_10_profession: Level10Profession | null;
  fertilizer: Fertilizer;
  preserves_jar_checkbox: boolean;
  kegs_checkbox: boolean;
  oil_checkbox: boolean;
};

function InputPanel({
  inputs,
  changeInputs,
}: {
  inputs: Inputs;
  changeInputs: (inputs: Inputs) => void;
}) {
  // Compute some values for things
  const quality = computeQuality(
    inputs.farming_level,
    inputs.fertilizer.quality
  );

  const season_options = [
    Season.SPRING,
    Season.SUMMER,
    Season.FALL,
    Season.WINTER,
  ].map((s) => {
    const season_name = Season.toString(s);
    return <option value={season_name.toLowerCase()}>{season_name}</option>;
  });
  const season_select = (
    <select
      value={Season[inputs.season].toLowerCase()}
      onChange={(e) => {
        changeInputs({ ...inputs, season: Season.fromString(e.target.value) });
      }}
    >
      {season_options}
    </select>
  );

  const day_input = (
    <input
      type="number"
      value={inputs.start_day}
      onChange={(e) => {
        changeInputs({ ...inputs, start_day: e.target.valueAsNumber });
      }}
    />
  );

  const multiseason_checkbox = (
    <input
      type="checkbox"
      checked={inputs.multiseason_checked}
      onChange={(e) => {
        changeInputs({ ...inputs, multiseason_checked: e.target.checked });
      }}
    />
  );

  const quality_checkbox = (
    <input
      type="checkbox"
      checked={inputs.quality_checkbox}
      onChange={(e) => {
        changeInputs({ ...inputs, quality_checkbox: e.target.checked });
      }}
    />
  );

  const farmer_level_input = (
    <input
      type="number"
      value={inputs.farming_level}
      onChange={(e) => {
        changeInputs({ ...inputs, farming_level: e.target.valueAsNumber });
      }}
    />
  );

  const tiller_checkbox = (
    <input
      type="checkbox"
      disabled={inputs.farming_level < 5}
      checked={inputs.tiller_checkbox}
      onChange={(e) => {
        changeInputs({ ...inputs, tiller_checkbox: e.target.checked });
      }}
    />
  );

  function makeLvl10Radio(
    profession: Level10Profession,
    icon_src?: string
  ): JSX.Element {
    const titleCaseName = titleCase(profession);
    return (
      <label className="settings-optionbox">
        <input
          type="radio"
          name="level-10-profession"
          value={profession}
          disabled={inputs.farming_level < 10}
          checked={inputs.level_10_profession == profession}
          onChange={() => {
            changeInputs({ ...inputs, level_10_profession: profession });
          }}
        />
        <IconTag src={icon_src ?? getIconPath(titleCaseName)}>
          {titleCaseName}
        </IconTag>
      </label>
    );
  }

  function makeFertilizerRadioButton(
    name: string,
    quality: QualityFertilizer | null,
    speedgro: SpeedGro | null,
    icon_src?: string
  ): JSX.Element {
    return (
      <label className="settings-optionbox">
        <input
          type="radio"
          name="fertilizer"
          value={quality + "-" + speedgro}
          checked={
            inputs.fertilizer.quality === quality &&
            inputs.fertilizer.speedgro === speedgro
          }
          onChange={() => {
            changeInputs({
              ...inputs,
              fertilizer: {
                quality,
                speedgro,
              },
            });
          }}
        />
        <IconTag src={icon_src ?? getIconPath(name)}>{name}</IconTag>
      </label>
    );
  }

  const preserves_checkbox = (
    <input
      type="checkbox"
      checked={inputs.preserves_jar_checkbox}
      onChange={(e) => {
        changeInputs({ ...inputs, preserves_jar_checkbox: e.target.checked });
      }}
    />
  );

  const kegs_checkbox = (
    <input
      type="checkbox"
      checked={inputs.kegs_checkbox}
      onChange={(e) => {
        changeInputs({ ...inputs, kegs_checkbox: e.target.checked });
      }}
    />
  );

  const oil_checkbox = (
    <input
      type="checkbox"
      checked={inputs.oil_checkbox}
      onChange={(e) => {
        changeInputs({ ...inputs, oil_checkbox: e.target.checked });
      }}
    />
  );

  return (
    <>
      <h2>Settings</h2>
      <hr />
      <div className="settings-clump">
        <label>
          <span className="settings-label">Season</span>
          {season_select}
        </label>
      </div>
      <div className="settings-clump">
        <label>
          <span className="settings-label">Day (1-28)</span>
          {day_input}
        </label>
      </div>
      <hr />
      <div className="settings-clump">
        <label className="settings-clump">
          <span className="settings-label">Farming Level</span>
          {farmer_level_input}
        </label>
      </div>
      <div className="settings-clump">
        <span className="settings-label">Level 5 Profession</span>
        <label className="settings-optionbox">
          {tiller_checkbox} <IconTag src="Tiller.png">Tiller</IconTag>
        </label>
      </div>
      <div className="settings-clump">
        <span className="settings-label">Level 10 Profession</span>
        {makeLvl10Radio("agriculturist", "Agriculturist.png")}
        {makeLvl10Radio("artisan", "Artisan.png")}
        {makeLvl10Radio("other", "Question.png")}
      </div>
      <hr />
      <div className="settings-clump">
        <span className="settings-label">Fertilizer</span>
        {makeFertilizerRadioButton("None", null, null, "Blank.png")}
        {makeFertilizerRadioButton("Basic Fertilizer", "basic", null)}
        {makeFertilizerRadioButton("Quality Fertilizer", "quality", null)}
        {makeFertilizerRadioButton("Deluxe Fertilizer", "deluxe", null)}
        {makeFertilizerRadioButton("Speed-Gro", null, "basic")}
        {makeFertilizerRadioButton("Deluxe Speed-Gro", null, "deluxe")}
        {makeFertilizerRadioButton("Hyper Speed-Gro", null, "hyper")}
      </div>
      <hr />
      <div className="settings-clump">
        <span className="settings-label">Processing</span>
        <label className="settings-optionbox">
          {preserves_checkbox}{" "}
          <IconTag src="Preserves_Jar.png">Preserves Jar</IconTag>
        </label>
        <label className="settings-optionbox">
          {kegs_checkbox} <IconTag src="Keg.png">Keg</IconTag>
        </label>
        <label className="settings-optionbox">
          {oil_checkbox} <IconTag src="Oil_Maker.png">Oil Maker</IconTag>
        </label>
      </div>
      <hr />
      <div className="settings-clump">
        <span className="settings-label">Miscellaneous</span>
        <label className="settings-optionbox">
          {multiseason_checkbox} Cross-Season Crops?
        </label>
        <label className="settings-optionbox">
          {quality_checkbox} Enable Quality?
        </label>
        {inputs.quality_checkbox &&
          QUALITIES.map((q) => {
            const pct = quality[q] * 100;
            const icon = QUALITY_STAR_ICONS[q];
            return (
              <li>
                <IconTag src={icon}>{pct.toFixed(0)}%</IconTag>
              </li>
            );
          })}
      </div>
    </>
  );
}

const DEFAULT_INPUTS: Inputs = {
  season: Season.SPRING,
  start_day: 1,
  multiseason_checked: true,
  quality_checkbox: false,
  farming_level: 0,
  tiller_checkbox: false,
  level_10_profession: null,
  fertilizer: { quality: null, speedgro: null },
  preserves_jar_checkbox: false,
  kegs_checkbox: false,
  oil_checkbox: false,
};

function CropInfo({ crop_data }: { crop_data: CropData }) {
  const def = crop_data.definition;
  const y = def.yield ?? 1;
  const seasons = def.season
    ? Season.getArray(Season.fromString(def.season), def.multiseason ?? 1).map(
        (s) => [Season.toString(s), <br />]
      )
    : ["None"];

  const rows: [string | JSX.Element, string | number | JSX.Element][] = [
    ["Season(s)", <>{seasons}</>],
    ["Growth", <TimeTag days={crop_data.growth_period} />],
    [
      "Regrowth",
      def.regrowth_period ? <TimeTag days={def.regrowth_period} /> : "-",
    ],
    [
      "Yield",
      def.percent_chance_extra ? `${y} + ${def.percent_chance_extra}%` : y,
    ],
    ["Harvests", crop_data.num_harvests],
    ["Seed Cost", <GoldTag amount={def.seed_cost} fractionalDigits={0} />],
    ["Final Product", <GoodTag name={crop_data.proceeds.name} />],
  ];

  // next is sell price
  if (crop_data.processing_type === "raw") {
    for (const q of QUALITIES) {
      const price = crop_data.crop_proceeds[q].price;
      const icon = QUALITY_STAR_ICONS[q];
      rows.push([
        <>
          Sell Price (<InlineIcon src={icon} />)
        </>,
        <GoldTag amount={price} fractionalDigits={0} />,
      ]);
    }
  } else {
    rows.push([
      "Sell Price",
      <GoldTag amount={crop_data.proceeds.price} fractionalDigits={0} />,
    ]);
  }

  return (
    <table className="crop-sidetable">
      <thead>
        <tr>
          <th colSpan={2}>
            <IconTag src={getIconPath(def.name)}>{def.name}</IconTag>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, prop]) => (
          <tr>
            <td>{name}</td>
            <td>{prop}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Root() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS);
  const [cropSelected, setCropSelected] = useState<string | null>(null);

  function updateInputs(i: Inputs) {
    // Do some quick massaging of the input data.

    // You can get skills above 10 using food. Wiki claims 14 is max.
    i.farming_level = clamp(i.farming_level, 0, 14);

    // When the user ticks the season too far, wrap around and bump the season, for nice UX.
    if (i.start_day <= 0) {
      i.start_day = 28;
      i.season = (i.season + 3) % 4;
    } else if (i.start_day > 28) {
      i.start_day = 1;
      i.season = (i.season + 1) % 4;
    }

    setInputs(i);
  }

  // Construct the settings
  const quality = computeQuality(
    inputs.farming_level,
    inputs.fertilizer.quality
  );
  const settings: Settings = {
    season: inputs.season,
    start_day: inputs.start_day,
    multiseason_enabled: inputs.multiseason_checked,
    quality_probabilities: inputs.quality_checkbox ? quality : null,
    tiller_skill_chosen: inputs.farming_level >= 5 && inputs.tiller_checkbox,
    level_10_profession:
      inputs.farming_level >= 10 ? inputs.level_10_profession : null,
    fertilizer: inputs.fertilizer,
    preserves_jar_enabled: inputs.preserves_jar_checkbox,
    kegs_enabled: inputs.kegs_checkbox,
    oil_maker_enabled: inputs.oil_checkbox,
  };

  // Go through all the crops and generate some rows to draw
  const crop_data = [];
  for (const def of CROP_DEFINITIONS) {
    // Filter to crops that are in-season
    const data = calculate(def, settings);
    if (data == "out-of-season") {
      continue;
    }
    crop_data.push(data);
  }

  // Grab the data for the currently-selected row, if any.
  const sidetable_data = crop_data.find(
    (x) => x.definition.name === cropSelected
  );

  // Change style of whole document
  document.documentElement.className = Season[inputs.season].toLowerCase();

  // Handler for the box on the RHS
  function updateInfoBox(crop_name: string) {
    setCropSelected(crop_name);
  }

  return (
    <>
      <div className="settings-panel">
        <InputPanel inputs={inputs} changeInputs={updateInputs}></InputPanel>
      </div>
      <div className="main-table">
        <CropTable
          crop_data={crop_data}
          on_row_click={updateInfoBox}
        ></CropTable>
      </div>
      <div className="details-panel">
        {sidetable_data !== undefined && (
          <CropInfo crop_data={sidetable_data}></CropInfo>
        )}
      </div>
    </>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Root />);
