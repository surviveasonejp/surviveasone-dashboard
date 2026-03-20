import { type FC } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Landing } from "./pages/Landing";
import { SurvivalClock } from "./pages/SurvivalClock";
import { CollapseMap } from "./pages/CollapseMap";
import { Dashboard } from "./pages/Dashboard";

export const App: FC = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/countdown" element={<SurvivalClock />} />
        <Route path="/collapse-map" element={<CollapseMap />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>
    </Routes>
  );
};
