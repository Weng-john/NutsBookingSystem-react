import { sendToGAS } from "../../api";
import { STORAGE_KEYS } from "../../config";

async function call(route, payload = {}, authenticated = true) {
  const response = await sendToGAS(route, {
    ...payload,
    ...(authenticated ? { idToken: localStorage.getItem(STORAGE_KEYS.TOKEN) } : {}),
  });
  return response.data;
}

export const getGuidelines = () => call("getExamGuidelines", {}, false);
export const submitRequest = (payload) => call("submitReservationRequest", payload);
export const withdrawRequest = (payload) => call("withdrawReservationRequest", payload);
export const processRequest = (payload) => call("processReservationRequest", payload);
export const setResult = (payload) => call("setReservationResult", payload);
export const getReport = (payload = {}) => call("getReservationReport", payload);
export const getAuditLogs = (payload = {}) => call("getAuditLogs", payload);
export const getNotifications = () => call("getMyNotifications");
export const markNotificationRead = (notificationID) => call("markNotificationRead", { notificationID });
export const getPreferences = () => call("getNotificationPreferences");
export const updatePreferences = (preferences) => call("updateNotificationPreferences", { preferences });
export const getNotificationRules = () => call("getNotificationRules");
export const updateNotificationRules = (rules, captchaToken) => call("updateNotificationRules", { rules, captchaToken });
export const getDeliveryLogs = (payload = {}) => call("getNotificationDeliveryLogs", payload);
export const retryNotification = (notificationID, captchaToken) => call("retryNotification", { notificationID, captchaToken });
