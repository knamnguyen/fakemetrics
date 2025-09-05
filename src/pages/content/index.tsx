import "./style.css";
import { createEditController } from "./edit-controller";
import { getPageKey } from "../../lib/storage";

const controller = createEditController();

controller.init();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "FAKEMETRICS_TOGGLE") {
    if (message.enable) controller.enable();
    else controller.disable();
    sendResponse({
      type: "FAKEMETRICS_TOGGLE_ACK",
      enabled: Boolean(message.enable),
    });
    return true;
  }
  if (message && message.type === "FAKEMETRICS_GET_STATE") {
    const state = { enabled: controller.getState().enabled };
    sendResponse({ type: "FAKEMETRICS_STATE", ...state });
    return true;
  }
  if (message && message.type === "FAKEMETRICS_REAPPLY") {
    controller.handleReapply();
    sendResponse({ ok: true });
    return true;
  }
});

// Masking/unhide handled within controller.init()
