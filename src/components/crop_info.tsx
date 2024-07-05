"use strict";

import { CropData, QUALITIES, Season } from "../crops";
import {
  GoldTag,
  GoodTag,
  IconTag,
  InlineIcon,
  QUALITY_STAR_ICONS,
  TimeTag,
  getIconPath,
} from "./icon_tags";

export function CropInfo({
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
        (s) => [<li key={s}>{Season.toString(s)}</li>]
      )
    : ["None"];

  const rows: [string, string | JSX.Element, string | number | JSX.Element][] =
    [
      ["season", "Season(s)", <ul className="seasons-list">{seasons}</ul>],
      ["growth", "Growth", <TimeTag days={crop_data.growth_period} />],
      [
        "regrowth",
        "Regrowth",
        def.regrowth_period ? <TimeTag days={def.regrowth_period} /> : "-",
      ],
      [
        "yield",
        "Yield",
        def.percent_chance_extra ? `${y} + ${def.percent_chance_extra}%` : y,
      ],
      ["harvests", "Harvests", crop_data.num_harvests],
      [
        "seed-cost",
        "Seed Cost",
        <GoldTag amount={def.seed_cost} fractionalDigits={0} />,
      ],
      [
        "final-product",
        "Final Product",
        <GoodTag name={crop_data.proceeds.name} />,
      ],
    ];

  // next is sell price
  if (crop_data.processing_type === "raw") {
    for (const q of QUALITIES) {
      const price = crop_data.crop_proceeds[q].price;
      const icon = QUALITY_STAR_ICONS[q];
      rows.push([
        "sell-price-" + q,
        <>
          Sell Price (<InlineIcon src={icon} />)
        </>,
        <GoldTag amount={price} fractionalDigits={0} />,
      ]);
    }
  } else {
    rows.push([
      "sell-price",
      "Sell Price",
      <GoldTag amount={crop_data.proceeds.price} fractionalDigits={0} />,
    ]);
  }

  return (
    <div className="crop-sidetable">
      <button className="close-button" onClick={onCloseClick}>
        &times;
      </button>
      <table className="crop-sidetable">
        <thead>
          <tr>
            <th colSpan={2}>
              <IconTag src={getIconPath(def.name)}>{def.name}</IconTag>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, prop, value]) => (
            <tr key={key}>
              <td>{prop}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
