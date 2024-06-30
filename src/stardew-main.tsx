"use strict";

import {
  CropData,
  Season,
  computeQuality,
  calculate,
  Scenario,
  ProcessingType,
  QualityVector,
  Level10Profession,
  Fertilizer,
  QualityFertilizer,
  SpeedGro,
  Quality,
  ScenarioType,
} from "./crops";
import "./stardew.scss";

import { clsx } from "clsx";
import { ReactNode, useEffect, useState } from "react";
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

const ALL_SEASONS = [Season.SPRING, Season.SUMMER, Season.FALL, Season.WINTER];

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
      className={clsx(crop_data.num_harvests === 0 && "disabled")}
      onClick={() => on_click(crop_data.definition.name)}
    >
      {cells}
    </tr>
  );
}

type SortDirection = "ascending" | "descending";

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

    // If we're not the currently-selected column, seize control and sort ascending.
    if (currentSort === null || currentSort[0] !== idx) {
      setCurrentSort([idx, "ascending"]);
    } else {
      // Otherwise, rotate through ASC, DESC, NONE
      switch (currentSort[1]) {
        case "ascending":
          setCurrentSort([idx, "descending"]);
          break;
        case "descending":
          setCurrentSort(null);
          break;
      }
    }
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

type DayControlState = {
  season: Season | "greenhouse";
  start_day: number;
  num_greenhouse_seasons: number;
};

type Settings = {
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

function tillerEligible(settings: Settings): boolean {
  return settings.farming_level >= 5;
}

function level10Eligible(settings: Settings): boolean {
  // The only level 10 professions relevant to this calculator
  // are those that are downstream of Tiller.
  return settings.farming_level >= 10 && settings.tiller_checkbox;
}

function SettingControls({
  settings,
  changeSettings,
}: {
  settings: Settings;
  changeSettings: (settings: Settings) => void;
}) {
  // Compute some values for things
  const quality = computeQuality(
    settings.farming_level,
    settings.fertilizer.quality
  );

  // Helper type
  type SpecificKeys<T, V> = {
    [K in keyof T]: T[K] extends V ? K : never;
  }[keyof T];

  // Helper function for making checkboxes that modify the settings
  function makeCheckbox(
    key: SpecificKeys<Settings, boolean>,
    enabled: boolean = true
  ): JSX.Element {
    return (
      <input
        type="checkbox"
        checked={settings[key]}
        disabled={!enabled}
        onChange={(e) =>
          changeSettings({ ...settings, [key]: e.target.checked })
        }
      />
    );
  }

  const farmer_level_input = (
    <input
      type="number"
      value={settings.farming_level}
      onChange={(e) => {
        changeSettings({ ...settings, farming_level: e.target.valueAsNumber });
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
          disabled={!level10Eligible(settings)}
          checked={settings.level_10_profession == profession}
          onChange={() => {
            changeSettings({ ...settings, level_10_profession: profession });
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
            settings.fertilizer.quality === quality &&
            settings.fertilizer.speedgro === speedgro
          }
          onChange={() => {
            changeSettings({
              ...settings,
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

  return (
    <>
      <div className="settings-clump">
        <label>
          <span className="settings-annotation">Farming Level</span>
          {farmer_level_input}
        </label>
      </div>
      <div className="settings-clump">
        <span className="settings-annotation">Level 5 Profession</span>
        <label className="settings-optionbox">
          {makeCheckbox("tiller_checkbox", tillerEligible(settings))}{" "}
          <IconTag src="Tiller.png">Tiller</IconTag>
        </label>
      </div>
      <div className="settings-clump">
        <span className="settings-annotation">Level 10 Profession</span>
        {makeLvl10Radio("agriculturist", "Agriculturist.png")}
        {makeLvl10Radio("artisan", "Artisan.png")}
      </div>
      <hr />
      <div className="settings-clump">
        <span className="settings-annotation">Fertilizer</span>
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
        <span className="settings-annotation">Processing</span>
        <label className="settings-optionbox">
          {makeCheckbox("preserves_jar_checkbox")}{" "}
          <IconTag src="Preserves_Jar.png">Preserves Jar</IconTag>
        </label>
        <label className="settings-optionbox">
          {makeCheckbox("kegs_checkbox")} <IconTag src="Keg.png">Keg</IconTag>
        </label>
        <label className="settings-optionbox">
          {makeCheckbox("oil_checkbox")}{" "}
          <IconTag src="Oil_Maker.png">Oil Maker</IconTag>
        </label>
      </div>
      <hr />
      <div className="settings-clump">
        <span className="settings-annotation">Miscellaneous</span>
        <label className="settings-optionbox">
          {makeCheckbox("multiseason_checked")} Cross-Season Crops?
        </label>
        <label className="settings-optionbox">
          {makeCheckbox("quality_checkbox")} Enable Quality?
        </label>
        {settings.quality_checkbox &&
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

function SettingsSidebar({
  settings,
  changeSettings,
}: {
  settings: Settings;
  changeSettings: (settings: Settings) => void;
}) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  return (
    <>
      <div
        className={clsx("settings-panel", !sidebarOpen && "sidebar-collapsed")}
      >
        <h2>Settings</h2>
        <button
          className="close-button small-screen-only"
          onClick={() => setSidebarOpen(false)}
        >
          &times;
        </button>
        <hr />
        <SettingControls settings={settings} changeSettings={changeSettings} />
      </div>

      {/*things outside the normal layout flow*/}
      <div
        className="settings-button small-screen-only"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <img src="/stardew-valley/img/Rusty_Cog.png" />
      </div>
      <div
        className={clsx(
          "settings-backdrop small-screen-only",
          !sidebarOpen && "sidebar-collapsed"
        )}
        onClick={() => setSidebarOpen(false)}
      />
    </>
  );
}

function DayControls({
  state,
  changeState,
}: {
  state: DayControlState;
  changeState: (day: DayControlState) => void;
}): JSX.Element {
  type Label = "spring" | "summer" | "fall" | "winter" | "greenhouse";

  function labelToValue(l: Label): Season | "greenhouse" {
    if (l === "greenhouse") {
      return "greenhouse";
    }
    return Season.fromString(l);
  }

  function valueToLabel(v: Season | "greenhouse"): Label {
    if (v === "greenhouse") {
      return "greenhouse";
    }
    // @ts-expect-error: Seasons must be one of those labels
    return Season.toString(v).toLowerCase();
  }

  const choices: (Season | "greenhouse")[] = [...ALL_SEASONS, "greenhouse"];

  const season_options = choices.map((s) => {
    const label = valueToLabel(s);
    return (
      <option value={label} key={label}>
        {titleCase(label)}
      </option>
    );
  });

  const season_select = (
    <select
      value={valueToLabel(state.season)}
      onChange={(e) => {
        changeState({
          ...state,
          season: labelToValue(e.target.value as Label),
        });
      }}
    >
      {season_options}
    </select>
  );

  // Which number input should we show? Depends on if we're greenhouse or not.
  const [day_label, day_input] = (() => {
    if (state.season !== "greenhouse") {
      const label = <>Day (1-28)</>;
      const input = (
        <input
          type="number"
          value={state.start_day}
          onChange={(e) => {
            changeState({ ...state, start_day: e.target.valueAsNumber });
          }}
        />
      );
      return [label, input];
    } else {
      const label = <>Num Seasons (1+)</>;
      const input = (
        <input
          type="number"
          value={state.num_greenhouse_seasons}
          onChange={(e) => {
            changeState({
              ...state,
              num_greenhouse_seasons: e.target.valueAsNumber,
            });
          }}
        />
      );
      return [label, input];
    }
  })();

  return (
    <>
      <label>
        <div className="settings-annotation">
          <b>Season</b>
        </div>
        {season_select}
      </label>
      <label>
        <div className="settings-annotation">
          <b>{day_label}</b>
        </div>
        {day_input}
      </label>
    </>
  );
}

const DEFAULT_DAY_STATE: DayControlState = {
  season: Season.SPRING,
  start_day: 1,
  num_greenhouse_seasons: 4,
};

const DEFAULT_SETTINGS: Settings = {
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

function CropInfo({
  crop_data,
  onCloseClick,
}: {
  crop_data: CropData;
  onCloseClick: () => void;
}) {
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
      <button className="close-button" onClick={onCloseClick}>
        &times;
      </button>
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

// TODO: merge settings into one thing?
function Root() {
  const [day, setDay] = useState<DayControlState>(() => {
    const saved = localStorage.getItem("day");
    return saved !== null
      ? (JSON.parse(saved) as DayControlState) // trust that it's the right type
      : DEFAULT_DAY_STATE;
  });
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem("settings");
    return saved !== null
      ? (JSON.parse(saved) as Settings) // trust that it's the right type
      : DEFAULT_SETTINGS;
  });
  const [cropSelected, setCropSelected] = useState<string | null>(null);

  function updateDay(day: DayControlState) {
    if (day.season === "greenhouse") {
      day.num_greenhouse_seasons = Math.max(day.num_greenhouse_seasons, 1);
    } else {
      // When the user ticks the season too far, wrap around and bump the season, for nice UX.
      if (day.start_day <= 0) {
        day.start_day = 28;
        day.season = (day.season + 3) % 4;
      } else if (day.start_day > 28) {
        day.start_day = 1;
        day.season = (day.season + 1) % 4;
      }
    }

    setDay(day);
  }

  function updateSettings(s: Settings) {
    // Do some quick massaging of the input data.

    // You can get skills above 10 using food. Wiki claims 14 is max.
    s.farming_level = clamp(s.farming_level, 0, 14);

    setSettings(s);
  }

  // Construct the inputs
  const quality = computeQuality(
    settings.farming_level,
    settings.fertilizer.quality
  );
  const scenario_type: ScenarioType =
    day.season === "greenhouse"
      ? { kind: "greenhouse", num_seasons: day.num_greenhouse_seasons }
      : { kind: "season", season: day.season, start_day: day.start_day };
  const scenario: Scenario = {
    start: scenario_type,
    multiseason_enabled: settings.multiseason_checked,
    quality_probabilities: settings.quality_checkbox ? quality : null,
    tiller_skill_chosen: tillerEligible(settings) && settings.tiller_checkbox,
    level_10_profession: level10Eligible(settings)
      ? settings.level_10_profession
      : null,
    fertilizer: settings.fertilizer,
    preserves_jar_enabled: settings.preserves_jar_checkbox,
    kegs_enabled: settings.kegs_checkbox,
    oil_maker_enabled: settings.oil_checkbox,
  };

  // Go through all the crops and generate some rows to draw
  const crop_data = [];
  for (const def of CROP_DEFINITIONS) {
    // Filter to crops that are in-season
    const data = calculate(def, scenario);
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
  document.documentElement.className =
    day.season === "greenhouse"
      ? "greenhouse"
      : Season[day.season].toLowerCase();

  // Handler for the box on the RHS
  function updateInfoBox(crop_name: string) {
    if (crop_name !== cropSelected) {
      setCropSelected(crop_name);
    } else {
      setCropSelected(null);
    }
  }

  useEffect(() => {
    localStorage.setItem("day", JSON.stringify(day));
    localStorage.setItem("settings", JSON.stringify(settings));
  });

  return (
    <>
      <SettingsSidebar settings={settings} changeSettings={updateSettings} />
      <div className="main-body">
        <div className="day-controls">
          <DayControls state={day} changeState={updateDay} />
        </div>
        <div className="main-table">
          <CropTable crop_data={crop_data} on_row_click={updateInfoBox} />
        </div>
      </div>
      <div className="details-panel">
        {sidetable_data !== undefined && (
          <CropInfo
            crop_data={sidetable_data}
            onCloseClick={() => setCropSelected(null)}
          />
        )}
      </div>
    </>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Root />);
