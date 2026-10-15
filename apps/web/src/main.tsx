import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/providers/app-providers";
import { router } from "./app/routes";
import "./app/styles/global.css";

const element = document.getElementById("root");
if (!element) throw new Error("Root element is missing.");

createRoot(element).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
