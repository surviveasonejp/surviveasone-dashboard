import { type FC } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Landing } from "./pages/Landing";
import { SurvivalClock } from "./pages/SurvivalClock";
import { CollapseMap } from "./pages/CollapseMap";
import { Dashboard } from "./pages/Dashboard";
import { TankerTracker } from "./pages/TankerTracker";
import { FoodCollapse } from "./pages/FoodCollapse";
import { FamilyMeter } from "./pages/FamilyMeter";
import { Prepare } from "./pages/Prepare";
import { About } from "./pages/About";

export const App: FC = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/countdown" element={<SurvivalClock />} />
        <Route path="/collapse-map" element={<CollapseMap />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/last-tanker" element={<TankerTracker />} />
        <Route path="/food-collapse" element={<FoodCollapse />} />
        <Route path="/family" element={<FamilyMeter />} />
        <Route path="/prepare" element={<Prepare />} />
        <Route path="/about" element={<About />} />
      </Route>
    </Routes>
  );
};
