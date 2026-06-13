import { assertHealthy, getContainerHealthSnapshot } from "./health_state.mjs";

assertHealthy(getContainerHealthSnapshot());
