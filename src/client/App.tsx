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
import { Methodology } from "./pages/Methodology";
import { ApiDocs } from "./pages/ApiDocs";
import { ForSegment } from "./pages/ForSegment";
import { PetrochemTree } from "./pages/PetrochemTree";

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
        <Route path="/methodology" element={<Methodology />} />
        <Route path="/api-docs" element={<ApiDocs />} />
        <Route path="/petrochem" element={<PetrochemTree />} />
        <Route path="/for/:segment" element={<ForSegment />} />
      </Route>
    </Routes>
  );
};
