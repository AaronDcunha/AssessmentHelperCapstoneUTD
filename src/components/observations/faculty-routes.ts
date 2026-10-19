/** Frontend destinations; these do not grant access or define backend permissions. */
export const facultyRoutes = {
  dashboard: "/dashboard",
  evaluation: "/dashboard/evaluation",
  requests: "/observations/requests",
  observations: "/observations",
  history: "/observations/history",
  signup: "/observations/signup",
  recommendations: "/observations/recommendations",
  confirmed: "/observations/confirmed",
  details: "/observations/details",
  appointment: "/observations/appointment",
  form: "/observations/form",
} as const;

export const facultyPageHeaders = {
  // Screenshot-provided semester is display-only preview content, not an active cycle.
  [facultyRoutes.dashboard]: { title: "Faculty Dashboard", subtitle: "Fall 2026", facultyLayout: true },
  [facultyRoutes.evaluation]: { title: "My Evaluation", facultyLayout: true },
  [facultyRoutes.requests]: { title: "Observer Requests", facultyLayout: true },
  [facultyRoutes.observations]: { title: "Observations", facultyLayout: true },
  [facultyRoutes.history]: { title: "Observation History", facultyLayout: true },
  [facultyRoutes.signup]: { title: "Sign Up for Observation", facultyLayout: true },
  [facultyRoutes.recommendations]: { title: "Recommended Observers", facultyLayout: true },
  [facultyRoutes.confirmed]: { title: "Choose Confirmed Observer", facultyLayout: true },
  [facultyRoutes.details]: { title: "Observation Details", facultyLayout: true },
  [facultyRoutes.appointment]: { title: "Observation Appointment", facultyLayout: true },
  [facultyRoutes.form]: { title: "Observation Form", facultyLayout: true },
};
