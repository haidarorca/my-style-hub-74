import { createFileRoute } from "@tanstack/react-router";
import { Home } from "./index";

// Alias : /index rend la même page d'accueil que /
export const Route = createFileRoute("/index")({
  component: Home,
});
