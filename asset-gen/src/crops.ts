"use strict";

// should i pull this from a JSON like i'm doing now? or should i just
// hard-code it inline (might be more readable)
import CROP_DEFINITIONS from "./crops.json";

/* ======== CALCULATION ======== */

type CropDefinition = typeof CROP_DEFINITIONS[number];

enum Season {
    SPRING, SUMMER, FALL, WINTER
}

namespace Season {
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
}

type CropData = {
    definition: CropDefinition,
    useful_days: number,
    num_harvests: number,
    num_crops: number,
    profit: number,
    daily_profit: number,
};

type Settings = {
    season: Season,
    start_day: number,
    multiseason_enabled: boolean,
};

function calculate(crop: CropDefinition, settings: Settings): CropData | "out-of-season" {
    // When is this crop in-season?
    let seasons: Season[] = [];
    let num_seasons = crop.multiseason ?? 1;
    for (let i = 0; i < num_seasons; i++) {
        seasons.push(Season.fromString(crop.season).valueOf() + i);
    }

    // Bail out if we're out of season
    if (!seasons.includes(settings.season)) {
        return "out-of-season";
    }

    // How many days do we have left?
    let seasons_left = settings.multiseason_enabled
        ? seasons.length - seasons.indexOf(settings.season)
        : 1;
    let days_left = 28 * seasons_left - settings.start_day;

    // What's the profit? Depends how many harvests we can get this season.
    let num_harvests = 0;
    let useful_days = 0;
    if (days_left >= crop.days_to_grow) {
        num_harvests += 1;
        useful_days += crop.days_to_grow;
        if (crop.regrowth_period) {
            let extra_harvests = Math.floor((days_left - crop.days_to_grow) / crop.regrowth_period);
            num_harvests += extra_harvests;
            useful_days += extra_harvests * crop.regrowth_period;
        }
    }

    // We can sometimes get multiple crops per harvest
    let num_crops = num_harvests * ((crop.yield ?? 1) + (crop.percent_chance_extra ?? 0) / 100);

    let profit = num_crops * crop.sell_price - crop.seed_cost;
    let daily_profit = profit / useful_days;

    return {
        definition: crop,
        useful_days,
        num_harvests,
        num_crops,
        profit,
        daily_profit,
    };
}

/* ======== GUI ======== */

// Defines the set of columns for the whole table.
type Column = {
    name: string;
    cellText: (crop: CropData) => string;
    compare: (a: CropData, b: CropData) => number;
};

const COLUMNS: Column[] = [
    {
        name: "Name",
        cellText: (crop: CropData) => crop.definition.name,
        compare: (a: CropData, b: CropData) => a.definition.name.localeCompare(b.definition.name),
    },
    {
        name: "Seed Cost",
        cellText: (crop: CropData) => crop.definition.seed_cost.toString(),
        compare: (a: CropData, b: CropData) => a.definition.seed_cost - b.definition.seed_cost,
    },
    {
        name: "Sell Price",
        cellText: (crop: CropData) => crop.definition.sell_price.toString(),
        compare: (a: CropData, b: CropData) => a.definition.sell_price - b.definition.sell_price,
    },
    {
        name: "Days to Grow",
        cellText: (crop: CropData) => crop.definition.days_to_grow.toString(),
        compare: (a: CropData, b: CropData) => a.definition.days_to_grow - b.definition.days_to_grow,
    },
    {
        name: "Regrowth Period",
        cellText: (crop: CropData) => crop.definition.regrowth_period?.toString() ?? "-",
        compare: (a: CropData, b: CropData) => {
            if (b.definition.regrowth_period === undefined) {
                return -1;
            } else if (a.definition.regrowth_period === undefined) {
                return 1;
            }
            return a.definition.regrowth_period - b.definition.regrowth_period;
        }
    },
    {
        name: "Yield",
        cellText: (crop: CropData) => {
            let yield_num = crop.definition.yield ?? 1;
            if (crop.definition.percent_chance_extra) {
                return `${yield_num} + ${crop.definition.percent_chance_extra}%`;
            } else {
                return yield_num.toString();
            }
        },
        compare: (a: CropData, b: CropData) => {
            // slight hack -- represent as a + b/100
            let a_num = (a.definition.yield ?? 1) + (a.definition.percent_chance_extra ?? 0) / 100;
            let b_num = (b.definition.yield ?? 1) + (b.definition.percent_chance_extra ?? 0) / 100;
            return a_num - b_num;
        }
    },
    {
        name: "Useful Days",
        cellText: (crop: CropData) => crop.useful_days.toString(),
        compare: (a: CropData, b: CropData) => a.useful_days - b.useful_days,
    },
    {
        name: "Num Harvests",
        cellText: (crop: CropData) => crop.num_harvests.toString(),
        compare: (a: CropData, b: CropData) => a.num_crops - b.num_crops,
    },
    {
        name: "Num Crops",
        cellText: (crop: CropData) => {
            let num_crops = crop.num_crops;
            if (Number.isInteger(num_crops)) {
                return num_crops.toString();
            }
            return crop.num_crops.toFixed(2);
        },
        compare: (a: CropData, b: CropData) => a.num_crops - b.num_crops,
    },
    {
        name: "Profit",
        cellText: (crop: CropData) => crop.profit.toFixed(2),
        compare: (a: CropData, b: CropData) => a.profit - b.profit,
    },
    {
        name: "Daily Profit",
        cellText: (crop: CropData) => {
            if (Number.isFinite(crop.daily_profit)) {
                return crop.daily_profit.toFixed(2);
            }
            return "-";
        },
        compare: (a: CropData, b: CropData) => a.daily_profit - b.daily_profit,
    }
];

class CropRow {
    data: CropData;
    row: HTMLTableRowElement;

    constructor(row: HTMLTableRowElement, data: CropData) {
        this.data = data;
        this.row = row;

        // now populate the row
        for (let col of COLUMNS) {
            let value = col.cellText(this.data);
            this.row.insertCell().appendChild(document.createTextNode(value));
        }
    }
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

class CropTable {
    table: HTMLTableElement;
    thead: HTMLTableSectionElement;
    tbody: HTMLTableSectionElement;
    rows: CropRow[];
    current_sort: [number, SortDirection] | null;

    constructor(table: HTMLTableElement) {
        this.table = table;
        this.rows = [];
        this.current_sort = null;

        // Create table header and body
        this.thead = this.table.createTHead();
        this.tbody = this.table.createTBody();

        // Populate head once, here
        let row = this.thead.insertRow();
        for (let [idx, col] of COLUMNS.entries()) {
            let cell = row.insertCell();
            cell.appendChild(document.createTextNode(col.name));
            cell.addEventListener("click", (event) => {
                // Which way do we sort?
                let dir: SortDirection;
                if (this.current_sort !== null && this.current_sort[0] === idx) {
                    dir = flipDirection(this.current_sort[1]);
                } else {
                    dir = "ascending";
                }
                this.current_sort = [idx, dir];

                // Clear all the header buttons, except ourselves
                let headers = this.thead.querySelectorAll('td');
                for (let header of headers) {
                    header.removeAttribute("aria-sort");
                }
                headers[idx].setAttribute("aria-sort", dir);

                // Now sort the rows
                this.sortRows();
            });
        }

        // We'll leave the body empty because it'll be recomputed from
        // repopulateTable(), and we need the settings to be able to
        // create the rows anyways.
    }

    // TODO: don't recreate rows; change the text instead
    public repopulateTable(settings: Settings) {
        // Discard the old rows and create new ones
        this.tbody.replaceChildren();
        this.rows = [];
        for (let def of CROP_DEFINITIONS) {
            // Filter to crops that are in-season
            let data = calculate(def, settings);
            if (data == "out-of-season") {
                continue;
            }
            let row = this.tbody.insertRow();
            this.rows.push(new CropRow(row, data));
        }

        // We also need to re-sort them. 
        this.sortRows();
    }

    private sortRows() {
        // If no sort selected, default is to sort by name
        let idx: number;
        let dir: SortDirection;
        if (this.current_sort === null) {
            idx = 0;
            dir = "ascending";
        } else {
            [idx, dir] = this.current_sort;
        }

        // We first sort our own collection, then use that to re-insert
        // our row elements.
        let col = COLUMNS[idx];
        this.rows.sort((a, b) => {
            let compare = col.compare(a.data, b.data);
            return dir === "ascending" ? compare : -compare;
        });

        // Then use that to rearrange the nodes in the body
        for (let row of this.rows) {
            this.tbody.appendChild(row.row);
        }
    }
}

function initialize() {
    console.log("Initializing!");

    // Find all the elements I need
    let table = document.getElementById("crop-table");
    if (!(table instanceof HTMLTableElement)) {
        throw new Error("crop-table should be a <table>");
    }

    let input_panel = document.getElementById("input-panel")!;
    let season_input = document.querySelector<HTMLInputElement>("#season")!;
    let current_day_input = document.querySelector<HTMLInputElement>("#day")!;
    let enable_multiseason = document.querySelector<HTMLInputElement>("#enable-multiseason")!;

    // Create table component
    let table_component = new CropTable(table);

    // Applies the input settings to the document
    function readAndApplySettings() {
        // Get the settings
        let settings: Settings = {
            season: Season.fromString(season_input.value),
            start_day: current_day_input.valueAsNumber,
            multiseason_enabled: enable_multiseason.checked
        };

        // Repopulate table and change style
        table_component.repopulateTable(settings);
        document.documentElement.className = season_input.value.toLowerCase();
    }

    // Run it once to apply the default settings.
    readAndApplySettings();

    // Attach event listeners
    input_panel.addEventListener("change", (event) => {
        readAndApplySettings();
    });
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