"use strict";

import {
  CropData,
  Season,
  computeQuality,
  calculate,
  Settings,
  PRICE_MULTIPLIERS,
  qualityDot,
  ProcessingType,
  QualityVector,
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

const QUALITIES: (keyof QualityVector<never>)[] = [
  "normal",
  "silver",
  "gold",
  "iridium",
];

const QUALITY_STAR_ICONS: QualityVector<string> = {
  normal: "Base_Quality.png",
  silver: "Silver_Quality.png",
  gold: "Gold_Quality.png",
  iridium: "Iridium_Quality.png",
};

// Some GUI helper stuff
function InlineIcon({ src }: { src: string }) {
  const fullPath = "/img/" + src;
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
  return <IconTag src={getCropIconPath(name)}>{name}</IconTag>;
}

function enableIf(enabled: boolean) {
  return enabled ? undefined : "disabled";
}

function getCropIconPath(name: string): string {
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
      return <IconTag src={getCropIconPath(name)}>{name}</IconTag>;
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
  let cells = [];
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
    <div className="rounded-box">
      <table className="sortable">
        <thead>
          <tr>{header_cells}</tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

type Inputs = {
  season: Season;
  start_day: number;
  multiseason_checked: boolean;
  quality_checkbox: boolean;
  farming_level: number;
  tiller_checkbox: boolean;
  artisan_checkbox: boolean;
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
  const quality = computeQuality(inputs.farming_level);
  const average_quality_score = qualityDot(quality, PRICE_MULTIPLIERS);
  const tiller_checkbox_enabled = inputs.farming_level >= 5;
  const artisan_checkbox_enabled = inputs.farming_level >= 10;

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
      id="season"
      name="season"
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
      id="day"
      value={inputs.start_day}
      onChange={(e) => {
        changeInputs({ ...inputs, start_day: e.target.valueAsNumber });
      }}
    />
  );

  const multiseason_checkbox = (
    <input
      type="checkbox"
      id="enable-multiseason"
      checked={inputs.multiseason_checked}
      onChange={(e) => {
        changeInputs({ ...inputs, multiseason_checked: e.target.checked });
      }}
    />
  );

  const quality_checkbox = (
    <input
      type="checkbox"
      id="enable-quality"
      checked={inputs.quality_checkbox}
      onChange={(e) => {
        changeInputs({ ...inputs, quality_checkbox: e.target.checked });
      }}
    />
  );

  const farmer_level_input = (
    <input
      type="number"
      id="farmer-level"
      min="1"
      max="10"
      value={inputs.farming_level}
      onChange={(e) => {
        changeInputs({ ...inputs, farming_level: e.target.valueAsNumber });
      }}
    />
  );

  const tiller_checkbox = (
    <input
      type="checkbox"
      id="enable-tiller"
      disabled={!tiller_checkbox_enabled}
      checked={inputs.tiller_checkbox}
      onChange={(e) => {
        changeInputs({ ...inputs, tiller_checkbox: e.target.checked });
      }}
    />
  );

  const artisan_checkbox = (
    <input
      type="checkbox"
      id="enable-artisan"
      disabled={!artisan_checkbox_enabled}
      checked={inputs.artisan_checkbox}
      onChange={(e) => {
        changeInputs({ ...inputs, artisan_checkbox: e.target.checked });
      }}
    />
  );

  const preserves_checkbox = (
    <input
      type="checkbox"
      id="enable-preserves"
      checked={inputs.preserves_jar_checkbox}
      onChange={(e) => {
        changeInputs({ ...inputs, preserves_jar_checkbox: e.target.checked });
      }}
    />
  );

  const kegs_checkbox = (
    <input
      type="checkbox"
      id="enable-kegs"
      checked={inputs.kegs_checkbox}
      onChange={(e) => {
        changeInputs({ ...inputs, kegs_checkbox: e.target.checked });
      }}
    />
  );

  const oil_checkbox = (
    <input
      type="checkbox"
      id="enable-oil"
      checked={inputs.oil_checkbox}
      onChange={(e) => {
        changeInputs({ ...inputs, oil_checkbox: e.target.checked });
      }}
    />
  );

  // TODO: should this be a <form>?
  return (
    <div className="rounded-box">
      <table>
        <tbody>
          <tr>
            <td>
              <label htmlFor="season">Season:</label>
            </td>
            <td>{season_select}</td>
          </tr>
          <tr>
            <td>
              <label htmlFor="day">Day (1-28):</label>
            </td>
            <td>{day_input}</td>
          </tr>
          <tr>
            <td>
              <label htmlFor="enable-multiseason">Multi-season?:</label>
            </td>
            <td>{multiseason_checkbox}</td>
          </tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <td>
              <label htmlFor="farmer-level">Farmer Level:</label>
            </td>
            <td>{farmer_level_input}</td>
          </tr>
          <tr className={enableIf(tiller_checkbox_enabled)}>
            <td>
              <label htmlFor="enable-tiller">Tiller Profession?:</label>
            </td>
            <td>{tiller_checkbox}</td>
          </tr>
          <tr className={enableIf(artisan_checkbox_enabled)}>
            <td>
              <label htmlFor="enable-artisan">Artisan Profession?:</label>
            </td>
            <td>{artisan_checkbox}</td>
          </tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <td colSpan={3}>
              <label htmlFor="enable-quality">Enable Quality?:</label>
            </td>
            <td>{quality_checkbox}</td>
          </tr>
          <tr className={enableIf(inputs.quality_checkbox)}>
            <td colSpan={3}>Average Quality Factor:</td>
            <td>{average_quality_score.toFixed(2)}</td>
          </tr>
          <tr className={enableIf(inputs.quality_checkbox)}>
            {QUALITIES.map((q) => {
              const pct = quality[q] * 100;
              const icon = QUALITY_STAR_ICONS[q];
              return (
                <td key={q}>
                  <IconTag src={icon}>{pct.toFixed(0)}%</IconTag>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <td>
              <label htmlFor="enable-preserves">Preserve Jars?:</label>
            </td>
            <td>{preserves_checkbox}</td>
          </tr>
          <tr>
            <td>
              <label htmlFor="enable-kegs">Kegs?:</label>
            </td>
            <td>{kegs_checkbox}</td>
          </tr>
          <tr>
            <td>
              <label htmlFor="enable-oil">Oil Makers?:</label>
            </td>
            <td>{oil_checkbox}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const DEFAULT_INPUTS: Inputs = {
  season: Season.SPRING,
  start_day: 1,
  multiseason_checked: true,
  quality_checkbox: false,
  farming_level: 1,
  tiller_checkbox: false,
  artisan_checkbox: false,
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

  let rows: [string | JSX.Element, string | number | JSX.Element][] = [
    ["Season(s)", <>{seasons}</>],
    ["Growth", <TimeTag days={def.days_to_grow} />],
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
    <div className="rounded-box">
      <table>
        <thead>
          <tr>
            <th colSpan={2}>
              <IconTag src={getCropIconPath(def.name)}>{def.name}</IconTag>
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
    </div>
  );
}

function Root() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS);
  const [cropSelected, setCropSelected] = useState<string | null>(null);

  function updateInputs(i: Inputs) {
    // Do some quick massaging of the input data.
    // TODO: is this the actual max/min?
    i.farming_level = clamp(i.farming_level, 1, 10);

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
  const quality = computeQuality(inputs.farming_level);
  let settings: Settings = {
    season: inputs.season,
    start_day: inputs.start_day,
    multiseason_enabled: inputs.multiseason_checked,
    quality_probabilities: inputs.quality_checkbox ? quality : null,
    tiller_skill_chosen: inputs.tiller_checkbox && inputs.farming_level >= 5,
    artisan_skill_chosen: inputs.artisan_checkbox && inputs.farming_level >= 10,
    preserves_jar_enabled: inputs.preserves_jar_checkbox,
    kegs_enabled: inputs.kegs_checkbox,
    oil_maker_enabled: inputs.oil_checkbox,
  };

  // Go through all the crops and generate some rows to draw
  let crop_data = [];
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
      <div className="auto-center">
        <InputPanel inputs={inputs} changeInputs={updateInputs}></InputPanel>
      </div>
      <div id="crop-table-wrapper">
        <CropTable
          crop_data={crop_data}
          on_row_click={updateInfoBox}
        ></CropTable>
        {sidetable_data !== undefined && (
          <CropInfo crop_data={sidetable_data}></CropInfo>
        )}
      </div>
    </>
  );
}

function initialize() {
  console.log("Initializing!");

  // Create React root
  const root = createRoot(document.getElementById("root")!);
  root.render(<Root />);
}

// Alrighty, we're ready to go! Wait for the DOM to finish loading (or see if it
// already has.
if (document.readyState === "loading") {
  // Loading hasn't finished yet
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  // `DOMContentLoaded` has already fired
  initialize();
}
