import "@fontsource/cinzel/600.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/600.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./ui/styles.css";

// ?seed=123 makes the shuffle repeatable, which helps when reporting a bug.
const param = new URLSearchParams(window.location.search).get("seed");
const seed = param !== null && /^\d+$/.test(param) ? Number(param) : undefined;

const root = document.getElementById("app");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App seed={seed} />
    </StrictMode>,
  );
}
