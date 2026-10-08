import "@fontsource/cinzel/600.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/600.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FACTIONS, type MatchSetup } from "./data/decks";
import { App } from "./ui/App";
import "./ui/styles.css";

// ?seed=123 makes the shuffle repeatable, which helps when reporting a bug.
const param = new URLSearchParams(window.location.search).get("seed");
const seed = param !== null && /^\d+$/.test(param) ? Number(param) : undefined;

// ?faction=nilfgaard&opponent=monsters skips the menu (handy for sharing and testing).
const params = new URLSearchParams(window.location.search);
const known = (value: string | null) => FACTIONS.find((f) => f.id === value)?.id;
const player = known(params.get("faction"));
const setup: MatchSetup | undefined = player
  ? { player, opponent: known(params.get("opponent")) ?? (player === "monsters" ? "nilfgaard" : "monsters") }
  : undefined;

const root = document.getElementById("app");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App seed={seed} setup={setup} />
    </StrictMode>,
  );
}
