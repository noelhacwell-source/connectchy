import { RECORD_COLLECTIONS } from "./record-collections";

const actions = [
  {
    name: "Search",
    description: "Search loaded records by title, details, author, or ID.",
  },
  {
    name: "Filter",
    description:
      "Filter loaded records by status and reorder by date or title.",
  },
  {
    name: "Export",
    description: "Export the currently visible record list as JSON.",
  },
  {
    name: "Delete selected",
    description:
      "Select specific records and confirm their removal in one request.",
  },
  {
    name: "Delete all",
    description:
      "Remove the full authorized collection, including records beyond the first page.",
  },
];

export const WORKSPACE_CONTROL_FEATURES = Object.values(
  RECORD_COLLECTIONS,
).flatMap((collection) =>
  actions.map((action) => ({
    title: action.name + " · " + collection.label,
    description: action.description,
    entry: "Manage records → " + collection.label,
    group: "Workspace controls",
    mode: "shared" as const,
  })),
);
