"use strict";

import {
  calculate,
  computeQuality,
  Scenario,
  ScenarioType,
  Season,
} from "../crops";

// should i pull this from a JSON like i'm doing now? or should i just
// hard-code it inline (might be more readable)
import CROP_DEFINITIONS from "../crop_definitions.json";
import { clamp } from "../utils";

import { CropInfo } from "./crop_info";
import { CropTable } from "./crop_table";
import {
  DayControls,
  DayControlState,
  level10Eligible,
  Settings,
  SettingsSidebar,
  tillerEligible,
} from "./settings";

import { useEffect, useState } from "react";

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

// TODO: merge settings into one thing?
export function Root() {
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
