import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installTruncationTooltips } from "./lib/ui/truncationTooltip";

const rootEl = document.getElementById("root")!;
const initial = document.getElementById("app-initial-loader");
if (initial) initial.remove();
installTruncationTooltips();
createRoot(rootEl).render(<App />);
