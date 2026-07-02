import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import { installTruncationTooltips } from "./lib/ui/truncationTooltip";

const rootEl = document.getElementById("root")!;
const initial = document.getElementById("app-initial-loader");
if (initial) initial.remove();
installTruncationTooltips();
createRoot(rootEl).render(<App />);
