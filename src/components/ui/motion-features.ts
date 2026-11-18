// The animation features of motion (layout animations, drag, gestures),
// loaded on their own after the page: LazyMotion in Providers brings them in,
// and every component animates through `m.*`. domMax, not domAnimation,
// because of `layoutId` (the active pill of the navs) and `drag` (sheets).
export { domMax as default } from "motion/react";
