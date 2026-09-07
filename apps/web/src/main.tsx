import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { AvatarTest } from "./AvatarTest.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {new URLSearchParams(location.search).has("avatar-test") ? <AvatarTest /> : <App />}
  </StrictMode>,
);
