import { type FC, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";

const Landing = lazy(() => import("./pages/Landing").then(m => ({ default: m.Landing })));
const SurvivalClock = lazy(() => import("./pages/SurvivalClock").then(m => ({ default: m.SurvivalClock })));
const CollapseMap = lazy(() => import("./pages/CollapseMap").then(m => ({ default: m.CollapseMap })));
const Dashboard = lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })));
const TankerTracker = lazy(() => import("./pages/TankerTracker").then(m => ({ default: m.TankerTracker })));
const FoodCollapse = lazy(() => import("./pages/FoodCollapse").then(m => ({ default: m.FoodCollapse })));
const FamilyMeter = lazy(() => import("./pages/FamilyMeter").then(m => ({ default: m.FamilyMeter })));
const Prepare = lazy(() => import("./pages/Prepare").then(m => ({ default: m.Prepare })));
const About = lazy(() => import("./pages/About").then(m => ({ default: m.About })));
const Methodology = lazy(() => import("./pages/Methodology").then(m => ({ default: m.Methodology })));
const ApiDocs = lazy(() => import("./pages/ApiDocs").then(m => ({ default: m.ApiDocs })));
const ForSegment = lazy(() => import("./pages/ForSegment").then(m => ({ default: m.ForSegment })));
const PetrochemTree = lazy(() => import("./pages/PetrochemTree").then(m => ({ default: m.PetrochemTree })));
const Journal = lazy(() => import("./pages/Journal").then(m => ({ default: m.Journal })));

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
        <Route path="/journal" element={<Journal />} />
        <Route path="/for/:segment" element={<ForSegment />} />
      </Route>
    </Routes>
  );
};
