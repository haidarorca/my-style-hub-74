import { createFileRoute } from "@tanstack/react-router";
import { Route as HomeRoute } from "./index";

// Alias : /index rend la même page d'accueil que /
export const Route = createFileRoute("/index")({
  component: HomeRoute.options.component,
});
