"use strict";

import {
  Season,
  computeQuality,
  Level10Profession,
  Fertilizer,
  QualityFertilizer,
  SpeedGro,
  QUALITIES,
} from "../crops";
import { titleCase } from "../utils";

import { getIconPath, IconTag, QUALITY_STAR_ICONS } from "./icon_tags";

import { clsx } from "clsx";
import { useState } from "react";

export type DayControlState = {
  season: Season | "greenhouse";
  start_day: number;
  num_greenhouse_seasons: number;
};

export type Settings = {
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

const ALL_SEASONS = [Season.SPRING, Season.SUMMER, Season.FALL, Season.WINTER];

export function tillerEligible(settings: Settings): boolean {
  return settings.farming_level >= 5;
}

export function level10Eligible(settings: Settings): boolean {
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
              <li key={"quality-pct-" + q}>
                <IconTag src={icon}>{pct.toFixed(0)}%</IconTag>
              </li>
            );
          })}
      </div>
    </>
  );
}

export function SettingsSidebar({
  settings,
  changeSettings,
}: {
  settings: Settings;
  changeSettings: (settings: Settings) => void;
}) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  return (
    <>
      <div className="sidebar-outer">
        <div
          className={clsx("sidebar-inner", !sidebarOpen && "sidebar-collapsed")}
        >
          <h2>Settings</h2>
          <button
            className="close-button small-screen-only"
            onClick={() => setSidebarOpen(false)}
          >
            &times;
          </button>
          <hr />
          <SettingControls
            settings={settings}
            changeSettings={changeSettings}
          />
        </div>
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

export function DayControls({
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
