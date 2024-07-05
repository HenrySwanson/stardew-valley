"use strict";

import "./stardew.scss";
import { Root } from "./components/root";
import { createRoot } from "react-dom/client";

const root = createRoot(document.getElementById("root")!);
root.render(<Root />);
