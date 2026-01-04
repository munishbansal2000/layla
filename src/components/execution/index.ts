// ============================================
// EXECUTION COMPONENTS
// ============================================
// Components for the execution phase UI

// Notifications
export {
  ExecutionNotificationFeed,
  ExecutionEventLog,
  useExecutionNotifications,
  type ExecutionNotification,
  type ExecutionNotificationType,
} from "./ExecutionNotifications";

// Decision Modal
export {
  ExecutionDecisionModal,
  QuickActionBar,
  useExecutionDecisions,
  createLateWakeupDecision,
  createDelayedDepartureDecision,
  createExtensionDecision,
  type DecisionType,
  type DecisionOption,
  type DecisionContext,
} from "./ExecutionDecisionModal";

// Control Bar
export {
  ExecutionControlBar,
  ActivityStatusIndicator,
  ExecutionModeToggle,
  useExecutionState,
  type ExecutionPhase,
  type ScenarioType,
  type SimulatedTime,
  type ExecutionState,
  type ActivityExecutionStatus,
} from "./ExecutionControlBar";

// Demo Page
export { ExecutionDemoPage } from "./ExecutionDemoPage";
