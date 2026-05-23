import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const rootEl = document.getElementById("root")!;
const initial = document.getElementById("app-initial-loader");
if (initial) initial.remove();
createRoot(rootEl).render(<App />);
