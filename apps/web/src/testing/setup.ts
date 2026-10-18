// The web app's test set-up: a busy machine can take more than Testing Library's default second to load and draw a
// city in jsdom, so its waits allow five before they fail.
import { configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 5000 });
