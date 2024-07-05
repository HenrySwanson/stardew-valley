"use strict";

import { clsx } from "clsx";
import { CropData, ProcessingType } from "../crops";
import { getIconPath, GoldTag, IconTag, TimeTag } from "./icon_tags";
import { useState } from "react";

type SortDirection = "ascending" | "descending";

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

export function CropTable({
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

// Private functions for sorting things
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

function toFixedOrInteger(n: number, fractionDigits?: number): string {
  if (Number.isInteger(n)) {
    return n.toString();
  }
  return n.toFixed(fractionDigits);
}
